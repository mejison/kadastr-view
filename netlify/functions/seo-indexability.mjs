export const SEO_INDEXABILITY = Object.freeze({
    oblastMinimumKnownParcels: 25,
    parcelMinimumUsefulAttributes: 3,
});

export function isCadastralNumber(value) {
    return /^\d{10}:\d{2}:\d{3}:\d{4}$/.test(String(value ?? '').trim());
}

export function canonicalParcelPath(cadastralNumber) {
    const normalized = String(cadastralNumber ?? '').trim();

    return `/dilyanka/${encodeURIComponent(normalized).replace(/%3A/gi, ':')}`;
}

export function isParcelIndexable(parcel) {
    if (!parcel || parcel.isActive === false || !isCadastralNumber(parcel.cadastralNumber)) {
        return false;
    }

    const usefulAttributes = [
        parcel.centroid?.lat != null && parcel.centroid?.lng != null,
        Number(parcel.areaHectares) > 0,
        hasText(parcel.address),
        hasText(parcel.purpose),
        hasText(parcel.landCategory),
        hasText(parcel.ownershipType),
        hasText(parcel.useType),
    ].filter(Boolean).length;

    return usefulAttributes >= SEO_INDEXABILITY.parcelMinimumUsefulAttributes;
}

export function isOblastIndexable(stats) {
    return Boolean(
        stats
        && Number(stats.parcelCount) >= SEO_INDEXABILITY.oblastMinimumKnownParcels,
    );
}

function hasText(value) {
    return typeof value === 'string' && value.trim().length > 0;
}
