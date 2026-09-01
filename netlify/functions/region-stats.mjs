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

export function regionCodeForSlug(slug) {
    return regionCodes[slug] ?? null;
}

export function regionStatsPipeline(regionCode) {
    return [
        {
            $match: {
                is_active: { $ne: false },
                cadastral_number_normalized: { $regex: `^${regionCode}` },
            },
        },
        {
            $facet: {
                summary: [
                    {
                        $group: {
                            _id: null,
                            parcelCount: { $sum: 1 },
                            totalArea: {
                                $sum: {
                                    $convert: {
                                        input: { $ifNull: ['$area_declared', '$area'] },
                                        to: 'double',
                                        onError: 0,
                                        onNull: 0,
                                    },
                                },
                            },
                            latestUpdate: { $max: '$updated_at' },
                        },
                    },
                ],
                categories: topValuesPipeline('$land_category'),
                purposes: topValuesPipeline('$purpose_name'),
            },
        },
    ];
}

function topValuesPipeline(field) {
    return [
        { $match: { $expr: { $gt: [{ $strLenCP: { $trim: { input: { $ifNull: [field, ''] } } } }, 0] } } },
        { $group: { _id: field, count: { $sum: 1 } } },
        { $sort: { count: -1, _id: 1 } },
        { $limit: 5 },
        { $project: { _id: 0, name: '$_id', count: 1 } },
    ];
}

export async function regionStatsFor(db, slug) {
    const regionCode = regionCodeForSlug(slug);

    if (!db || !regionCode) {
        return null;
    }

    const cached = cache.get(slug);

    if (cached && cached.expiresAt > Date.now()) {
        return cached.value;
    }

    const [result = {}] = await db.collection('parcels').aggregate(regionStatsPipeline(regionCode)).toArray();
    const summary = result.summary?.[0];

    if (!summary?.parcelCount) {
        return null;
    }

    const value = {
        parcelCount: summary.parcelCount,
        totalArea: Number(summary.totalArea ?? 0),
        latestUpdate: summary.latestUpdate ?? null,
        categories: result.categories ?? [],
        purposes: result.purposes ?? [],
    };

    cache.set(slug, { value, expiresAt: Date.now() + cacheTtlMs });

    return value;
}

export function clearRegionStatsCache() {
    cache.clear();
}
