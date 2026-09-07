import { publicParcelMatch } from './region-stats.mjs';

export const COMMUNITY_MINIMUM_PUBLIC_PARCELS = 5;
let indexCache = { expiresAt: 0, rows: [] };

export function communityPath(katottg) {
    return `/hromada/${encodeURIComponent(String(katottg ?? '').trim())}`;
}

export function validCommunityCode(value) {
    return /^UA\d{17}$/.test(String(value ?? '').trim());
}

export function communityFromLocation(location) {
    const spatial = location?.spatial;
    const community = spatial?.community;
    if (spatial?.confidence !== 'high' || !validCommunityCode(community?.katottg) || !community?.name || !community?.oblast) return null;
    return {
        katottg: community.katottg,
        name: String(community.name).replace(/\s+/g, ' ').trim(),
        oblast: String(community.oblast).replace(/\s+/g, ' ').trim(),
        district: community.district ? String(community.district).replace(/\s+/g, ' ').trim() : null,
    };
}

/**
 * A location page is built only from centroids that were spatially checked
 * against a community boundary. It never promotes a KOATUU-prefix guess.
 */
export async function communityPageData(db, katottg, sampleLimit = 12) {
    if (!db || !validCommunityCode(katottg)) return null;
    const locations = await db.collection('parcel_locations').find({
        'spatial.confidence': 'high',
        'spatial.community.katottg': katottg,
    }, { projection: { cadastral_number: 1, spatial: 1 } }).toArray();
    const community = communityFromLocation(locations[0]);
    if (!community || locations.length === 0) return null;

    const numbers = [...new Set(locations.map((item) => item.cadastral_number).filter(Boolean))];
    const records = await db.collection('parcel_open_rights').find({
        ...publicParcelMatch(),
        cadastral_number_normalized: { $in: numbers },
    }, { projection: { cadastral_number_normalized: 1, lease_area: 1, land_use: 1, address: 1, imported_at: 1, updated_at: 1 } }).toArray();

    const byNumber = new Map();
    for (const record of records) {
        const number = record.cadastral_number_normalized;
        const previous = byNumber.get(number);
        if (!previous || newer(record, previous)) byNumber.set(number, record);
    }
    const publicRecords = [...byNumber.values()];
    const totalArea = publicRecords.reduce((sum, record) => sum + numeric(record.lease_area), 0);
    const landUses = topValues(publicRecords, 'land_use');
    const latestUpdate = publicRecords.reduce((latest, record) => {
        const value = record.imported_at ?? record.updated_at ?? null;
        return value && (!latest || new Date(value) > new Date(latest)) ? value : latest;
    }, null);

    return {
        ...community,
        parcelCount: publicRecords.length,
        totalArea,
        landUses,
        latestUpdate,
        parcels: publicRecords
            .sort((a, b) => String(a.cadastral_number_normalized).localeCompare(String(b.cadastral_number_normalized)))
            .slice(0, sampleLimit)
            .map((record) => ({ cadastralNumber: record.cadastral_number_normalized, areaHectares: numeric(record.lease_area), purpose: record.land_use, address: record.address })),
    };
}

export function isCommunityIndexable(data) {
    return Boolean(data && Number(data.parcelCount) >= COMMUNITY_MINIMUM_PUBLIC_PARCELS && data.name && data.oblast);
}

export async function indexableCommunityPages(db) {
    if (!db) return [];
    if (indexCache.expiresAt > Date.now()) return indexCache.rows;
    const rows = await db.collection('parcel_locations').aggregate([
        { $match: { 'spatial.confidence': 'high', 'spatial.community.katottg': { $regex: /^UA\d{17}$/ } } },
        { $lookup: { from: 'parcel_open_rights', localField: 'cadastral_number', foreignField: 'cadastral_number_normalized', as: 'right' } },
        { $unwind: '$right' },
        { $match: {
            'right.address': { $type: 'string', $ne: '' },
            'right.lease_area': { $type: 'string', $ne: '' },
            'right.land_use': { $type: 'string', $ne: '' },
            $expr: { $gt: [{ $convert: { input: '$right.lease_area', to: 'double', onError: 0, onNull: 0 } }, 0] },
        } },
        { $sort: { 'right.imported_at': -1, 'right.updated_at': -1 } },
        { $group: {
            _id: { community: '$spatial.community.katottg', cadastral: '$cadastral_number' },
            community: { $first: '$spatial.community' },
            area: { $first: { $convert: { input: '$right.lease_area', to: 'double', onError: 0, onNull: 0 } } },
            latestUpdate: { $max: '$right.imported_at' },
        } },
        { $group: {
            _id: '$_id.community',
            community: { $first: '$community' },
            parcelCount: { $sum: 1 },
            totalArea: { $sum: '$area' },
            latestUpdate: { $max: '$latestUpdate' },
        } },
        { $match: { parcelCount: { $gte: COMMUNITY_MINIMUM_PUBLIC_PARCELS } } },
        { $sort: { _id: 1 } },
    ]).toArray();
    const results = rows.map((row) => {
        const community = communityFromLocation({ spatial: { confidence: 'high', community: row.community } });
        return community ? { ...community, parcelCount: row.parcelCount, totalArea: row.totalArea, latestUpdate: row.latestUpdate, landUses: [], parcels: [] } : null;
    }).filter(isCommunityIndexable);
    indexCache = { rows: results, expiresAt: Date.now() + 10 * 60 * 1000 };
    return results;
}

function newer(left, right) {
    return new Date(left.imported_at ?? left.updated_at ?? 0) > new Date(right.imported_at ?? right.updated_at ?? 0);
}
function numeric(value) { const parsed = Number(String(value ?? '').replace(',', '.')); return Number.isFinite(parsed) ? parsed : 0; }
function topValues(records, field) {
    const counts = new Map();
    for (const record of records) {
        const value = String(record[field] ?? '').trim();
        if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'uk')).slice(0, 5);
}
