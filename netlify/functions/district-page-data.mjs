import { publicParcelMatch } from './region-stats.mjs';
import { communityFromLocation, isCommunityIndexable } from './community-page-data.mjs';

export const DISTRICT_MINIMUM_PUBLIC_PARCELS = 5;
let indexCache = { expiresAt: 0, rows: [] };

const transliteration = {
    а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh', з: 'z', и: 'y', і: 'i', ї: 'i', й: 'i',
    к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch',
    ь: '', ю: 'iu', я: 'ia', '’': '', "'": '', 'ʼ': '',
};

export function districtSlug(name) {
    return [...String(name ?? '').toLocaleLowerCase('uk-UA')]
        .map((character) => transliteration[character] ?? character)
        .join('')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

export function districtPath(oblastSlug, districtName) {
    const district = districtSlug(districtName);
    return oblastSlug && district ? `/raion/${oblastSlug}/${district}` : null;
}

export function isDistrictIndexable(data) {
    return Boolean(data && data.oblast && data.district && data.oblastSlug && Number(data.parcelCount) >= DISTRICT_MINIMUM_PUBLIC_PARCELS);
}

export async function districtPageData(db, oblast, requestedSlug, oblastSlug, sampleLimit = 12) {
    if (!db || !oblast || !requestedSlug || !oblastSlug) return null;
    const locations = await db.collection('parcel_locations').find({
        'spatial.confidence': 'high',
        'spatial.community.oblast': oblast,
        'spatial.community.district': { $type: 'string', $ne: '' },
    }, { projection: { cadastral_number: 1, spatial: 1 } }).toArray();
    const selected = locations.filter((row) => districtSlug(row.spatial?.community?.district) === requestedSlug);
    const first = selected[0];
    const district = String(first?.spatial?.community?.district ?? '').replace(/\s+/g, ' ').trim();
    if (!district) return null;

    const numbers = [...new Set(selected.map((row) => row.cadastral_number).filter(Boolean))];
    const records = await db.collection('parcel_open_rights').find({
        ...publicParcelMatch(),
        cadastral_number_normalized: { $in: numbers },
    }, { projection: { cadastral_number_normalized: 1, lease_area: 1, land_use: 1, address: 1, imported_at: 1, updated_at: 1 } }).toArray();
    const latestByNumber = newestByNumber(records);
    const publicRecords = [...latestByNumber.values()];
    const communityByNumber = new Map(selected.map((row) => [row.cadastral_number, communityFromLocation(row)]));
    const communities = communitySummaries(publicRecords, communityByNumber);
    const totalArea = publicRecords.reduce((sum, record) => sum + numeric(record.lease_area), 0);
    const latestUpdate = publicRecords.reduce((latest, record) => latestDate(latest, record.imported_at ?? record.updated_at), null);

    return {
        oblast,
        oblastSlug,
        district,
        parcelCount: publicRecords.length,
        totalArea,
        latestUpdate,
        landUses: topValues(publicRecords, 'land_use'),
        communities,
        parcels: publicRecords.sort((a, b) => String(a.cadastral_number_normalized).localeCompare(String(b.cadastral_number_normalized), 'uk'))
            .slice(0, sampleLimit)
            .map((record) => ({ cadastralNumber: record.cadastral_number_normalized, areaHectares: numeric(record.lease_area), purpose: record.land_use })),
    };
}

export async function indexableDistrictPages(db, oblastSlugByName) {
    if (!db) return [];
    if (indexCache.expiresAt > Date.now()) return indexCache.rows;
    const rows = await db.collection('parcel_locations').aggregate([
        { $match: { 'spatial.confidence': 'high', 'spatial.community.oblast': { $type: 'string', $ne: '' }, 'spatial.community.district': { $type: 'string', $ne: '' } } },
        { $lookup: { from: 'parcel_open_rights', localField: 'cadastral_number', foreignField: 'cadastral_number_normalized', as: 'right' } },
        { $unwind: '$right' },
        { $match: publicRightMatch() },
        { $sort: { 'right.imported_at': -1, 'right.updated_at': -1 } },
        { $group: { _id: { oblast: '$spatial.community.oblast', district: '$spatial.community.district', cadastral: '$cadastral_number' }, area: { $first: { $convert: { input: '$right.lease_area', to: 'double', onError: 0, onNull: 0 } } }, latestUpdate: { $max: '$right.imported_at' } } },
        { $group: { _id: { oblast: '$_id.oblast', district: '$_id.district' }, parcelCount: { $sum: 1 }, totalArea: { $sum: '$area' }, latestUpdate: { $max: '$latestUpdate' } } },
        { $match: { parcelCount: { $gte: DISTRICT_MINIMUM_PUBLIC_PARCELS } } },
        { $sort: { '_id.oblast': 1, '_id.district': 1 } },
    ]).toArray();
    const results = rows.map((row) => ({
        oblast: String(row._id.oblast).replace(/\s+/g, ' ').trim(),
        district: String(row._id.district).replace(/\s+/g, ' ').trim(),
        oblastSlug: oblastSlugByName.get(String(row._id.oblast).replace(/\s+/g, ' ').trim()) ?? null,
        parcelCount: row.parcelCount,
        totalArea: Number(row.totalArea ?? 0),
        latestUpdate: row.latestUpdate ?? null,
    })).filter(isDistrictIndexable);
    indexCache = { rows: results, expiresAt: Date.now() + 10 * 60 * 1000 };
    return results;
}

function newestByNumber(records) { const result = new Map(); for (const record of records) { const previous = result.get(record.cadastral_number_normalized); if (!previous || new Date(record.imported_at ?? record.updated_at ?? 0) > new Date(previous.imported_at ?? previous.updated_at ?? 0)) result.set(record.cadastral_number_normalized, record); } return result; }
function publicRightMatch() { return { 'right.address': { $type: 'string', $ne: '' }, 'right.lease_area': { $type: 'string', $ne: '' }, 'right.land_use': { $type: 'string', $ne: '' }, $expr: { $gt: [{ $convert: { input: '$right.lease_area', to: 'double', onError: 0, onNull: 0 } }, 0] } }; }
function communitySummaries(records, communityByNumber) { const groups = new Map(); for (const record of records) { const community = communityByNumber.get(record.cadastral_number_normalized); if (!community) continue; const group = groups.get(community.katottg) ?? { ...community, parcelCount: 0, totalArea: 0 }; group.parcelCount += 1; group.totalArea += numeric(record.lease_area); groups.set(community.katottg, group); } return [...groups.values()].filter(isCommunityIndexable).sort((a, b) => b.parcelCount - a.parcelCount || a.name.localeCompare(b.name, 'uk')); }
function numeric(value) { const parsed = Number(String(value ?? '').replace(',', '.')); return Number.isFinite(parsed) ? parsed : 0; }
function latestDate(left, right) { if (!right) return left; return !left || new Date(right) > new Date(left) ? right : left; }
function topValues(records, field) { const counts = new Map(); for (const record of records) { const value = String(record[field] ?? '').trim(); if (value) counts.set(value, (counts.get(value) ?? 0) + 1); } return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'uk')).slice(0, 5); }
