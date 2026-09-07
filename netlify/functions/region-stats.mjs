import { SEO_INDEXABILITY } from './seo-indexability.mjs';

const regionCodes = {
    crimea: '01', vinnytska: '05', volynska: '07', dnipropetrovska: '12', donetska: '14',
    zhytomyrska: '18', zakarpatska: '21', zaporizka: '23', 'ivano-frankivska': '26', kyivska: '32',
    kirovohradska: '35', luhanska: '44', lvivska: '46', mykolaivska: '48', odeska: '51',
    poltavska: '53', rivnenska: '56', sumska: '59', ternopilska: '61', kharkivska: '63',
    khersonska: '65', khmelnytska: '68', cherkaska: '71', chernivetska: '73', chernihivska: '74',
    kyiv: '80', sevastopol: '85',
};

const cacheTtlMs = 10 * 60 * 1000;
const cache = new Map();

export function regionCodeForSlug(slug) { return regionCodes[slug] ?? null; }
export function regionSlugForCode(code) { return Object.entries(regionCodes).find(([, value]) => value === code)?.[0] ?? null; }

export function publicParcelMatch(regionCode = '') {
    return {
        cadastral_number_normalized: { $regex: `^${regionCode}\\d{${10 - regionCode.length}}:\\d{2}:\\d{3}:\\d{4}$` },
        address: { $type: 'string', $ne: '' },
        lease_area: { $type: 'string', $ne: '' },
        land_use: { $type: 'string', $ne: '' },
        $expr: { $gt: [{ $convert: { input: '$lease_area', to: 'double', onError: 0, onNull: 0 } }, 0] },
    };
}

export function regionStatsPipeline(regionCode) {
    return [
        { $match: publicParcelMatch(regionCode) },
        { $sort: { imported_at: -1, updated_at: -1 } },
        { $group: { _id: '$cadastral_number_normalized', address: { $first: '$address' }, leaseArea: { $first: '$lease_area' }, landUse: { $first: '$land_use' }, latestUpdate: { $max: '$imported_at' } } },
        { $facet: {
            summary: [{ $group: { _id: null, parcelCount: { $sum: 1 }, totalArea: { $sum: { $convert: { input: '$leaseArea', to: 'double', onError: 0, onNull: 0 } } }, latestUpdate: { $max: '$latestUpdate' } } }],
            categories: topValuesPipeline('$landUse'),
            purposes: topValuesPipeline('$address'),
        } },
    ];
}

export function eligibleOblastsPipeline() {
    return [
        { $match: publicParcelMatch() },
        { $group: { _id: '$cadastral_number_normalized' } },
        { $group: { _id: { $substrBytes: ['$_id', 0, 2] }, parcelCount: { $sum: 1 } } },
        { $match: { parcelCount: { $gte: SEO_INDEXABILITY.oblastMinimumKnownParcels } } },
    ];
}

export async function eligibleOblastSlugs(db) {
    if (!db) return [];
    const rows = await db.collection('parcel_open_rights').aggregate(eligibleOblastsPipeline()).toArray();
    const codes = new Set(rows.map((row) => row._id));
    return Object.entries(regionCodes).filter(([, code]) => codes.has(code)).map(([slug]) => slug);
}

function topValuesPipeline(field) {
    return [{ $group: { _id: field, count: { $sum: 1 } } }, { $sort: { count: -1, _id: 1 } }, { $limit: 5 }, { $project: { _id: 0, name: '$_id', count: 1 } }];
}

export async function regionStatsFor(db, slug) {
    const regionCode = regionCodeForSlug(slug);
    if (!db || !regionCode) return null;
    const cached = cache.get(slug);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const [result = {}] = await db.collection('parcel_open_rights').aggregate(regionStatsPipeline(regionCode)).toArray();
    const summary = result.summary?.[0];
    if (!summary?.parcelCount) return null;
    const value = { parcelCount: summary.parcelCount, totalArea: Number(summary.totalArea ?? 0), latestUpdate: summary.latestUpdate ?? null, categories: result.categories ?? [], purposes: result.purposes ?? [] };
    cache.set(slug, { value, expiresAt: Date.now() + cacheTtlMs });
    return value;
}

export function clearRegionStatsCache() { cache.clear(); }
