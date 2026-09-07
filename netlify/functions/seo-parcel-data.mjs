import { isParcelIndexable } from './seo-indexability.mjs';
import { publicParcelMatch, regionSlugForCode } from './region-stats.mjs';
import { communityFromLocation } from './community-page-data.mjs';

export function publicParcelFromOpenRight(record) {
    const cadastralNumber = String(record?.cadastral_number_normalized ?? record?.cadastral_number ?? '').trim();
    const areaHectares = numericArea(record?.lease_area);
    return {
        cadastralNumber,
        areaHectares,
        address: text(record?.address),
        purpose: text(record?.land_use),
        useType: text(record?.right_type),
        sourceName: text(record?.source_name) ?? 'Відкриті дані',
        sourceUrl: text(record?.source_url),
        updatedAt: record?.imported_at ?? record?.updated_at ?? null,
        regionSlug: regionSlugForCode(cadastralNumber.slice(0, 2)),
    };
}

export async function findIndexablePublicParcel(db, cadastralNumber) {
    if (!db) return null;
    const record = await db.collection('parcel_open_rights').findOne({ ...publicParcelMatch(), cadastral_number_normalized: cadastralNumber }, { sort: { imported_at: -1, updated_at: -1 } });
    const parcel = record ? publicParcelFromOpenRight(record) : null;
    if (parcel) {
        const location = await db.collection('parcel_locations').findOne(
            { cadastral_number: cadastralNumber },
            { projection: { spatial: 1 } },
        );
        parcel.community = communityFromLocation(location);
        parcel.centroid = location?.spatial?.confidence === 'high' ? location.spatial.centroid : null;
    }
    return isParcelIndexable(parcel) ? parcel : null;
}

export function parcelSitemapPipeline() {
    return [
        { $match: publicParcelMatch() },
        { $sort: { imported_at: -1, updated_at: -1 } },
        { $group: { _id: '$cadastral_number_normalized', latestUpdate: { $max: '$imported_at' } } },
        { $sort: { _id: 1 } },
        { $project: { _id: 0, cadastralNumber: '$_id', latestUpdate: 1 } },
    ];
}

export async function relatedPublicParcels(db, parcel, limit = 4) {
    if (!db || !parcel?.address) return [];
    const records = await db.collection('parcel_open_rights').find({ ...publicParcelMatch(), address: parcel.address, cadastral_number_normalized: { $ne: parcel.cadastralNumber } }, { projection: { cadastral_number_normalized: 1, address: 1, lease_area: 1, land_use: 1, right_type: 1 } }).limit(limit).toArray();
    return records.map(publicParcelFromOpenRight).filter(isParcelIndexable);
}

export async function relatedPublicParcelsInCommunity(db, parcel, limit = 4) {
    if (!db || !parcel?.community?.katottg) return [];
    const locations = await db.collection('parcel_locations').find({
        'spatial.confidence': 'high',
        'spatial.community.katottg': parcel.community.katottg,
        cadastral_number: { $ne: parcel.cadastralNumber },
    }, { projection: { cadastral_number: 1 } }).limit(Math.max(limit * 4, 20)).toArray();
    const numbers = locations.map((item) => item.cadastral_number).filter(Boolean);
    if (!numbers.length) return [];
    const records = await db.collection('parcel_open_rights').find({
        ...publicParcelMatch(),
        cadastral_number_normalized: { $in: numbers },
    }, { projection: { cadastral_number_normalized: 1, address: 1, lease_area: 1, land_use: 1, right_type: 1 } }).limit(limit).toArray();
    return records.map(publicParcelFromOpenRight).filter(isParcelIndexable);
}

function numericArea(value) { return Number(String(value ?? '').replace(',', '.')); }
function text(value) { return typeof value === 'string' && value.trim() ? value.trim() : null; }
