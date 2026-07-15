import { mkdir, writeFile } from 'node:fs/promises';
import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
const databaseName = process.env.MONGODB_DATABASE ?? 'kadastr_view';
const tolerance = Number(process.env.OVERVIEW_TOLERANCE ?? 0.035);
const outputPath = process.env.OVERVIEW_OUTPUT ?? 'public/data/parcels-overview.geojson';

if (!uri) {
    console.error('MONGODB_URI is required.');
    process.exit(1);
}

const client = new MongoClient(uri, { maxPoolSize: 3 });

try {
    await client.connect();
    const db = client.db(databaseName);
    const cursor = db.collection('parcels')
        .find({
            is_active: { $ne: false },
            geometry: { $ne: null },
        })
        .project({
            cadastral_number: 1,
            address: 1,
            area_declared: 1,
            freshness_status: 1,
            geometry_status: 1,
            ownership_type: 1,
            ownership_category: 1,
            source_name: 1,
            source: 1,
            geometry: 1,
        });

    const features = [];

    for await (const parcel of cursor) {
        const geometry = simplifyGeometry(parcel.geometry, tolerance);

        if (!geometry) {
            continue;
        }

        features.push({
            type: 'Feature',
            id: String(parcel._id),
            geometry,
            properties: {
                id: String(parcel._id),
                cadastral_number: parcel.cadastral_number ?? '',
                address: parcel.address ?? null,
                area_declared: parcel.area_declared ?? null,
                freshness_status: parcel.freshness_status ?? 'open_reference',
                geometry_status: parcel.geometry_status ?? 'available',
                ownership_type: parcel.ownership_type ?? null,
                ownership_category: parcel.ownership_category ?? 'unknown',
                source_name: parcel.source?.name ?? parcel.source_name ?? 'MongoDB Atlas',
                source_official: parcel.source?.official ?? false,
            },
        });
    }

    await mkdir('public/data', { recursive: true });
    await writeFile(outputPath, JSON.stringify({
        type: 'FeatureCollection',
        features,
    }));

    console.log(`Exported ${features.length} overview features to ${outputPath}`);
} finally {
    await client.close();
}

function simplifyGeometry(geometry, pointTolerance) {
    if (!geometry) {
        return null;
    }

    if (geometry.type === 'Polygon') {
        return {
            type: 'Polygon',
            coordinates: simplifyPolygon(geometry.coordinates, pointTolerance),
        };
    }

    if (geometry.type === 'MultiPolygon') {
        return {
            type: 'MultiPolygon',
            coordinates: geometry.coordinates
                .map((polygon) => simplifyPolygon(polygon, pointTolerance))
                .filter((polygon) => polygon.length > 0),
        };
    }

    return geometry;
}

function simplifyPolygon(polygon, pointTolerance) {
    return polygon
        .map((ring) => simplifyRing(ring, pointTolerance))
        .filter((ring) => ring.length >= 4);
}

function simplifyRing(ring, pointTolerance) {
    if (!Array.isArray(ring) || ring.length <= 5) {
        return ring;
    }

    const closed = samePoint(ring[0], ring[ring.length - 1]);
    const source = closed ? ring.slice(0, -1) : ring.slice();
    const simplified = simplifyLine(source, pointTolerance);

    if (simplified.length < 3) {
        const bbox = boundingBox(source);

        return [
            [bbox.minX, bbox.minY],
            [bbox.maxX, bbox.minY],
            [bbox.maxX, bbox.maxY],
            [bbox.minX, bbox.maxY],
            [bbox.minX, bbox.minY],
        ];
    }

    const result = closed ? [...simplified, simplified[0]] : simplified;

    return result.length >= 4 ? result : ring;
}

function simplifyLine(points, pointTolerance) {
    if (points.length <= 2) {
        return points;
    }

    let maxDistance = 0;
    let maxIndex = 0;
    const start = points[0];
    const end = points[points.length - 1];

    for (let index = 1; index < points.length - 1; index++) {
        const distance = perpendicularDistance(points[index], start, end);

        if (distance > maxDistance) {
            maxDistance = distance;
            maxIndex = index;
        }
    }

    if (maxDistance <= pointTolerance) {
        return [start, end];
    }

    const left = simplifyLine(points.slice(0, maxIndex + 1), pointTolerance);
    const right = simplifyLine(points.slice(maxIndex), pointTolerance);

    return left.slice(0, -1).concat(right);
}

function perpendicularDistance(point, start, end) {
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];

    if (dx === 0 && dy === 0) {
        return distance(point, start);
    }

    return Math.abs(dy * point[0] - dx * point[1] + end[0] * start[1] - end[1] * start[0])
        / Math.sqrt(dx * dx + dy * dy);
}

function distance(a, b) {
    return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function samePoint(a, b) {
    return a?.[0] === b?.[0] && a?.[1] === b?.[1];
}

function boundingBox(points) {
    return points.reduce((box, point) => ({
        minX: Math.min(box.minX, point[0]),
        minY: Math.min(box.minY, point[1]),
        maxX: Math.max(box.maxX, point[0]),
        maxY: Math.max(box.maxY, point[1]),
    }), {
        minX: Number.POSITIVE_INFINITY,
        minY: Number.POSITIVE_INFINITY,
        maxX: Number.NEGATIVE_INFINITY,
        maxY: Number.NEGATIVE_INFINITY,
    });
}
