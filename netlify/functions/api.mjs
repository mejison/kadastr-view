import { MongoClient } from 'mongodb';

const jsonHeaders = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
};

const geoJsonHeaders = {
    'content-type': 'application/geo+json; charset=utf-8',
    'cache-control': 'public, max-age=60',
};

const vectorTileHeaders = {
    'content-type': 'application/x-protobuf',
    'cache-control': 'public, max-age=86400',
};

let mongoClientPromise;
let mongoUnavailableUntil = 0;

export async function handler(event, context = {}) {
    context.callbackWaitsForEmptyEventLoop = false;

    try {
        const url = new URL(event.rawUrl);
        const path = normalizedPath(event.path);

        if (event.httpMethod !== 'GET') {
            return jsonResponse({ error: 'Method not allowed' }, 405);
        }

        if (path === 'map/config') {
            return jsonResponse({ data: mapConfig() });
        }

        if (path === 'layers') {
            return jsonResponse({ data: defaultLayers() });
        }

        if (path === 'search/parcels') {
            return jsonResponse({ data: await searchParcels(url.searchParams.get('q') ?? '') });
        }

        if (path === 'search/cadastral-lookup') {
            return cadastralLookup(url.searchParams.get('number') ?? '');
        }

        if (path === 'parcels.geojson') {
            return parcelsGeoJson(Number(url.searchParams.get('limit') ?? 12000));
        }

        const tileMatch = path.match(/^tiles\/kadastr\/(\d+)\/(\d+)\/(\d+)\.pbf$/);
        if (tileMatch) {
            return proxyKadastrTile(tileMatch[1], tileMatch[2], tileMatch[3]);
        }

        const geometryMatch = path.match(/^parcels\/(.+)\/geometry$/);
        if (geometryMatch) {
            return parcelGeometry(decodeURIComponent(geometryMatch[1]));
        }

        const openRightsMatch = path.match(/^parcels\/(.+)\/open-rights$/);
        if (openRightsMatch) {
            return parcelOpenRights(decodeURIComponent(openRightsMatch[1]));
        }

        const parcelMatch = path.match(/^parcels\/(.+)$/);
        if (parcelMatch) {
            return parcelDetails(decodeURIComponent(parcelMatch[1]));
        }

        return jsonResponse({ error: 'Not found' }, 404);
    } catch (error) {
        console.error(error);

        return jsonResponse({ error: 'Serverless API error' }, 500);
    }
}

function normalizedPath(path) {
    return path
        .replace(/^\/api\/v1\/?/, '')
        .replace(/^\/\.netlify\/functions\/api\/?/, '')
        .replace(/^\/+/, '')
        .replace(/\/+$/, '');
}

function jsonResponse(payload, statusCode = 200) {
    return {
        statusCode,
        headers: jsonHeaders,
        body: JSON.stringify(payload),
    };
}

function geoJsonResponse(payload) {
    return {
        statusCode: 200,
        headers: geoJsonHeaders,
        body: JSON.stringify(payload),
    };
}

async function proxyKadastrTile(z, x, y) {
    const sourceUrl = `https://kadastrova-karta.com/tiles/maps/kadastr/${z}/${x}/${y}.pbf`;
    const response = await fetch(sourceUrl, {
        headers: {
            accept: 'application/x-protobuf,application/octet-stream,*/*',
            'user-agent': 'KadastrView development tile proxy',
        },
        signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
        return {
            statusCode: response.status,
            headers: vectorTileHeaders,
            body: '',
        };
    }

    const tileBuffer = Buffer.from(await response.arrayBuffer());

    return {
        statusCode: 200,
        headers: vectorTileHeaders,
        body: tileBuffer.toString('base64'),
        isBase64Encoded: true,
    };
}

function mapConfig() {
    return {
        center: { lat: 48.3794, lng: 31.1656 },
        zoom: 5.2,
        locale: 'uk',
        tile_endpoint: '/api/v1/tiles/kadastr/{z}/{x}/{y}.pbf',
        parcel_zoom_rules: [
            { range: [0, 9], detail: 'hidden' },
            { range: [10, 12], detail: 'low' },
            { range: [13, 15], detail: 'medium' },
            { range: [16, 20], detail: 'full' },
        ],
    };
}

function defaultLayers() {
    return [
        {
            name: 'OpenStreetMap',
            slug: 'osm',
            type: 'raster',
            source_url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            attribution: '© OpenStreetMap contributors',
            min_zoom: 0,
            max_zoom: 19,
            active: true,
        },
        {
            name: 'Kadastr vector tiles',
            slug: 'external-kadastr',
            type: 'vector',
            source_url: '/api/v1/tiles/kadastr/{z}/{x}/{y}.pbf',
            attribution: 'Кадастровий шар: kadastrova-karta.com',
            min_zoom: 3,
            max_zoom: 16,
            active: true,
        },
    ];
}

async function searchParcels(query) {
    const normalized = normalizeCadastralNumber(query);

    if (normalized === '') {
        return [];
    }

    const db = await mongoDb();
    if (!db) {
        return [];
    }

    const parcels = await db.collection('parcels')
        .find({ cadastral_number_normalized: { $regex: `^${escapeRegExp(normalized)}` } })
        .limit(8)
        .toArray();

    return parcels.map(parcelToApiResource);
}

async function parcelsGeoJson(limit) {
    const db = await mongoDb();
    const cappedLimit = Math.min(Number.isFinite(limit) ? limit : 12000, 15000);

    if (!db) {
        return geoJsonResponse(emptyFeatureCollection());
    }

    const parcels = await db.collection('parcels')
        .find({
            is_active: { $ne: false },
            $or: [
                { geometry: { $ne: null } },
                { 'geometries.geometry': { $ne: null } },
            ],
        })
        .limit(cappedLimit)
        .toArray();

    return geoJsonResponse({
        type: 'FeatureCollection',
        features: parcels
            .map(parcelToFeature)
            .filter(Boolean),
    });
}

async function parcelDetails(cadastralNumber) {
    const normalized = normalizeCadastralNumber(cadastralNumber);
    const parcel = await findParcel(normalized);
    const openRights = await findOpenParcelRights(normalized);

    return jsonResponse({
        data: parcel ? parcelToApiResource(parcel, openRights) : {
            ...demoParcel(normalized),
            rights: openRights,
        },
    });
}

async function parcelGeometry(cadastralNumber) {
    const normalized = normalizeCadastralNumber(cadastralNumber);
    const parcel = await findParcel(normalized);
    const openRights = await findOpenParcelRights(normalized);
    const feature = parcel ? parcelToFeature(parcel, openRights) : null;

    return jsonResponse({
        data: feature ?? {
            cadastral_number: normalized,
            type: 'Feature',
            geometry: null,
            properties: {
                geometry_status: 'not_imported',
                source_crs: 'EPSG:4326',
            },
        },
    });
}

async function parcelOpenRights(cadastralNumber) {
    const normalized = normalizeCadastralNumber(cadastralNumber);

    return jsonResponse({
        data: await findOpenParcelRights(normalized),
    });
}

async function cadastralLookup(cadastralNumber) {
    const normalized = normalizeCadastralNumber(cadastralNumber);

    if (normalized === '') {
        return jsonResponse({ data: null }, 422);
    }

    const db = await mongoDb();
    const cached = db
        ? await db.collection('parcel_lookups').findOne({ cadastral_number: normalized })
        : null;

    if (cached?.centroid?.lat && cached?.centroid?.lng) {
        return jsonResponse({
            data: {
                cadastral_number: normalized,
                centroid: cached.centroid,
                source_url: cached.source_url,
                cached: true,
            },
        });
    }

    const sourceUrl = `https://kadastrova-karta.com/dilyanka/${encodeURIComponent(normalized)}`;
    const response = await fetch(sourceUrl, {
        headers: { accept: 'text/html' },
        signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
        return jsonResponse({ data: null }, 404);
    }

    const html = await response.text();
    const lat = attributeFloat(html, 'data-map-parcel-lat-value');
    const lng = attributeFloat(html, 'data-map-parcel-lng-value');

    if (lat === null || lng === null) {
        return jsonResponse({ data: null }, 404);
    }

    const data = {
        cadastral_number: normalized,
        centroid: { lat, lng },
        source_url: sourceUrl,
    };

    if (db) {
        await db.collection('parcel_lookups').updateOne(
            { cadastral_number: normalized },
            {
                $set: {
                    ...data,
                    updated_at: new Date(),
                },
                $setOnInsert: { created_at: new Date() },
            },
            { upsert: true },
        );
    }

    return jsonResponse({ data });
}

async function findParcel(normalizedNumber) {
    const db = await mongoDb();

    if (!db || normalizedNumber === '') {
        return null;
    }

    return db.collection('parcels').findOne({
        $or: [
            { cadastral_number_normalized: normalizedNumber },
            { cadastral_number: normalizedNumber },
            { cadnum: normalizedNumber },
        ],
    });
}

async function findOpenParcelRights(normalizedNumber) {
    const db = await mongoDb();

    if (!db || normalizedNumber === '') {
        return null;
    }

    const record = await db.collection('parcel_open_rights').findOne(
        { cadastral_number_normalized: normalizedNumber },
        { sort: { imported_at: -1, updated_at: -1 } },
    );

    return record ? openRightsToResource(record) : null;
}

function parcelToFeature(parcel, openRights = null) {
    const geometry = parcel.geometry ?? parcel.geometries?.find?.((item) => item.is_current !== false)?.geometry;

    if (!geometry) {
        return null;
    }

    return {
        type: 'Feature',
        id: String(parcel._id ?? parcel.id ?? parcel.cadastral_number),
        geometry,
        properties: {
            id: String(parcel._id ?? parcel.id ?? ''),
            cadastral_number: parcel.cadastral_number ?? parcel.cadnum ?? '',
            address: parcel.address ?? null,
            area_declared: parcel.area_declared ?? parcel.area ?? null,
            freshness_status: parcel.freshness_status ?? 'open_reference',
            geometry_status: parcel.geometry_status ?? 'available',
            ownership_type: parcel.ownership_type ?? parcel.ownership ?? null,
            ownership_category: parcel.ownership_category ?? ownershipCategory(parcel),
            land_category: parcel.land_category ?? null,
            purpose_code: parcel.purpose_code ?? null,
            purpose_name: parcel.purpose_name ?? null,
            ...parcelRightsProperties(parcel, openRights),
            source_name: parcel.source?.name ?? parcel.source_name ?? 'MongoDB Atlas',
            source_official: parcel.source?.official ?? parcel.source_official ?? false,
        },
    };
}

function parcelToApiResource(parcel, openRights = null) {
    const feature = parcelToFeature(parcel, openRights);
    const centroid = parcel.centroid ?? centroidFromGeometry(feature?.geometry);

    return {
        id: String(parcel._id ?? parcel.id ?? ''),
        cadastral_number: parcel.cadastral_number ?? parcel.cadnum ?? '',
        area: {
            declared: parcel.area_declared ?? parcel.area ?? 0,
            calculated: parcel.area_calculated ?? 0,
            unit: parcel.unit ?? 'ha',
        },
        ownership_type: parcel.ownership_type ? { id: null, name: parcel.ownership_type } : null,
        land_category: parcel.land_category ? { id: null, name: parcel.land_category } : null,
        purpose: parcel.purpose_code ? { code: parcel.purpose_code, name: parcel.purpose_name ?? null } : null,
        address: parcel.address ?? 'Україна',
        rights: parcelRightsResource(parcel) ?? openRights,
        centroid: {
            lat: centroid?.lat ?? null,
            lng: centroid?.lng ?? null,
        },
        source: {
            name: parcel.source?.name ?? parcel.source_name ?? 'MongoDB Atlas',
            updated_at: parcel.source_updated_at ?? parcel.updated_at ?? null,
            official: parcel.source?.official ?? parcel.source_official ?? false,
        },
        freshness_status: parcel.freshness_status ?? 'open_reference',
        geometry_available: Boolean(feature?.geometry),
    };
}

function openRightsToResource(record) {
    return {
        rightType: firstString(record.right_type, record.rightType, record.lease_type) ?? 'Оренда землі',
        tenant: firstString(record.tenant, record.lessee, record.leaseholder),
        landlord: firstString(record.landlord, record.lessor),
        landlordCode: firstString(record.landlord_code, record.lessor_code),
        contractNumber: firstString(record.contract_number, record.contractNumber),
        contractDate: firstString(record.contract_date, record.contractDate),
        registeredAt: firstString(record.registered_at, record.registeredAt, record.registration_date),
        validUntil: firstString(record.valid_until, record.validUntil, record.lease_until),
        leaseArea: firstString(record.lease_area, record.leaseArea),
        landUse: firstString(record.land_use, record.landUse),
        address: firstString(record.address, record.lease_address),
        source: firstString(record.source_name, record.dataset_title, record.publisher) ?? 'Відкриті дані',
        sourceUrl: firstString(record.source_url, record.dataset_url, record.resource_url),
        datasetName: firstString(record.dataset_title, record.dataset_name),
        publisher: firstString(record.publisher),
        updatedAt: firstString(record.updated_at, record.imported_at),
    };
}

function parcelRightsResource(parcel) {
    const rights = {
        rightType: firstString(parcel.right_type, parcel.rights_type, parcel.property_right_type, parcel.real_right_type, parcel.lease_type),
        tenant: firstString(parcel.tenant, parcel.lessee, parcel.leaseholder, parcel.renter, parcel.orendar, parcel.orendar_name),
        landlord: firstString(parcel.landlord, parcel.lessor, parcel.owner, parcel.orendodavec, parcel.orendodavets),
        landlordCode: firstString(parcel.landlord_code, parcel.lessor_code, parcel.edrpou, parcel.edrpou_code),
        contractNumber: firstString(parcel.contract_number, parcel.lease_contract, parcel.agreement_number, parcel.registration_number, parcel.record_number),
        contractDate: firstString(parcel.contract_date, parcel.lease_contract_date, parcel.agreement_date),
        registeredAt: firstString(parcel.registered_at, parcel.registration_date, parcel.right_registered_at, parcel.lease_registered_at),
        validUntil: firstString(parcel.valid_until, parcel.lease_until, parcel.contract_until, parcel.expires_at, parcel.end_date),
        leaseArea: firstString(parcel.lease_area, parcel.leaseArea),
        landUse: firstString(parcel.land_use, parcel.landUse, parcel.lease_land_use),
        address: firstString(parcel.lease_address, parcel.address),
        source: firstString(parcel.rights_source, parcel.lease_source, parcel.register_source),
    };

    return Object.values(rights).some(Boolean) ? rights : null;
}

function parcelRightsProperties(parcel, openRights = null) {
    const rights = parcelRightsResource(parcel) ?? openRights;

    return rights ? {
        rights_type: rights.rightType,
        lease_tenant: rights.tenant,
        lease_landlord: rights.landlord,
        lease_landlord_code: rights.landlordCode,
        lease_contract_number: rights.contractNumber,
        lease_contract_date: rights.contractDate,
        lease_registered_at: rights.registeredAt,
        lease_valid_until: rights.validUntil,
        lease_area: rights.leaseArea,
        lease_land_use: rights.landUse,
        lease_address: rights.address,
        rights_source: rights.source,
        rights_source_url: rights.sourceUrl,
        rights_dataset_name: rights.datasetName,
        rights_publisher: rights.publisher,
    } : {};
}

function firstString(...values) {
    for (const value of values) {
        if (typeof value !== 'string' && typeof value !== 'number') {
            continue;
        }

        const normalized = String(value).trim();

        if (normalized !== '') {
            return normalized;
        }
    }

    return null;
}

function demoParcel(cadastralNumber) {
    return {
        id: null,
        cadastral_number: cadastralNumber,
        area: {
            declared: 0,
            calculated: 0,
            unit: 'ha',
        },
        ownership_type: { id: null, name: 'Невідомо' },
        land_category: { id: null, name: 'Очікує індексу' },
        purpose: { code: null, name: 'Дані з vector tiles або зовнішнього lookup' },
        address: 'Україна',
        rights: null,
        centroid: { lat: null, lng: null },
        source: {
            name: 'Serverless fallback',
            updated_at: null,
            official: false,
        },
        freshness_status: 'not_indexed',
        geometry_available: false,
    };
}

function emptyFeatureCollection() {
    return {
        type: 'FeatureCollection',
        features: [],
    };
}

function ownershipCategory(parcel) {
    const value = String(parcel.ownership_type ?? parcel.ownership ?? '').toLowerCase();
    const landCategory = String(parcel.land_category ?? '').toLowerCase();

    if (landCategory.includes('вод') || value.includes('water')) {
        return 'water_resource';
    }

    if (
        value.includes('держ')
        || value.includes('комун')
        || value.includes('state')
        || value.includes('communal')
        || value.includes('municipal')
    ) {
        return 'state_communal';
    }

    if (value.includes('приват') || value.includes('private')) {
        return 'private';
    }

    return 'unknown';
}

function centroidFromGeometry(geometry) {
    if (!geometry) {
        return null;
    }

    const coordinates = [];
    collectCoordinates(geometry.coordinates, coordinates);

    if (coordinates.length === 0) {
        return null;
    }

    const sums = coordinates.reduce((carry, point) => {
        carry.lng += point[0];
        carry.lat += point[1];
        return carry;
    }, { lat: 0, lng: 0 });

    return {
        lat: sums.lat / coordinates.length,
        lng: sums.lng / coordinates.length,
    };
}

function collectCoordinates(value, output) {
    if (!Array.isArray(value)) {
        return;
    }

    if (typeof value[0] === 'number' && typeof value[1] === 'number') {
        output.push(value);
        return;
    }

    value.forEach((item) => collectCoordinates(item, output));
}

function normalizeCadastralNumber(value) {
    return String(value ?? '').trim().replace(/\s+/g, '');
}

function attributeFloat(html, attribute) {
    const match = html.match(new RegExp(`${escapeRegExp(attribute)}="([^"]+)"`));
    const value = match?.[1];
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : null;
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function mongoDb() {
    const uri = process.env.MONGODB_URI;

    if (!uri) {
        return null;
    }

    if (Date.now() < mongoUnavailableUntil) {
        return null;
    }

    mongoClientPromise ??= MongoClient.connect(uri, {
        maxPoolSize: 3,
        serverSelectionTimeoutMS: 4500,
        connectTimeoutMS: 4500,
        socketTimeoutMS: 10000,
    });

    try {
        const client = await mongoClientPromise;

        return client.db(process.env.MONGODB_DATABASE ?? 'kadastr_view');
    } catch (error) {
        mongoClientPromise = null;
        mongoUnavailableUntil = Date.now() + 60000;
        console.error('MongoDB connection unavailable', error);

        return null;
    }
}
