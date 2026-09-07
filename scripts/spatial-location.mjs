export function centroidFromHtml(html) {
    const number = (attribute) => {
        const match = String(html ?? '').match(new RegExp(`${attribute}="([^"]+)"`, 'i'));
        const value = Number(match?.[1]);
        return Number.isFinite(value) ? value : null;
    };
    const lat = number('data-map-parcel-lat-value');
    const lng = number('data-map-parcel-lng-value');
    return lat !== null && lng !== null && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 ? { lat, lng } : null;
}

function pointInRing([lng, lat], ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        const crosses = ((yi > lat) !== (yj > lat)) && (lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi);
        if (crosses) inside = !inside;
    }
    return inside;
}

export function geometryContainsPoint(geometry, point) {
    if (!geometry || !point) return false;
    const polygonContains = (polygon) => polygon?.length > 0
        && pointInRing(point, polygon[0])
        && !polygon.slice(1).some((ring) => pointInRing(point, ring));
    if (geometry.type === 'Polygon') return polygonContains(geometry.coordinates);
    if (geometry.type === 'MultiPolygon') return geometry.coordinates.some(polygonContains);
    return false;
}

export function communityForPoint(point, features) {
    const feature = features.find((candidate) => geometryContainsPoint(candidate.geometry, [point.lng, point.lat]));
    if (!feature) return null;
    const properties = feature.properties ?? {};
    const name = properties.Gromada || properties.hromada_name || properties.name;
    const oblast = properties.Oblast || properties.oblast_name;
    if (!name || !oblast) return null;
    return {
        name,
        district: properties.Rayon || properties.district_name || null,
        oblast,
        katottg: properties.katottg || properties.katotth || properties.hromada_id || null,
        type: properties.Vyd_gromady || properties.type || null,
        boundary_object_id: properties.OBJECTID ?? feature.id ?? null,
    };
}
