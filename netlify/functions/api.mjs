import { createHmac, timingSafeEqual } from 'node:crypto';
import { MongoClient, ObjectId } from 'mongodb';

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

        if (event.httpMethod === 'POST') {
            if (path === 'orders') {
                return createParcelOrder(event);
            }

            if (path === 'listings') {
                return createParcelListing(event);
            }

            if (path === 'payments/monobank/webhook') {
                return monobankWebhook(event);
            }

            if (path === 'payments/stripe/webhook' || path === 'payments-providers/stripe/webhook') {
                return stripeWebhook(event);
            }

            return jsonResponse({ error: 'Not found' }, 404);
        }

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

        if (path === 'services') {
            return jsonResponse({ data: parcelServices() });
        }

        if (path === 'listings') {
            return parcelListings();
        }

        if (path === 'listings.geojson') {
            return parcelListingsGeoJson();
        }

        const listingMatch = path.match(/^listings\/(.+)$/);
        if (listingMatch) {
            return parcelListingDetails(decodeURIComponent(listingMatch[1]));
        }

        const orderMatch = path.match(/^orders\/(.+)$/);
        if (orderMatch) {
            return parcelOrderDetails(decodeURIComponent(orderMatch[1]));
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
        .replace(/^\/api\/?/, '')
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

function parcelServices() {
    return [
        {
            id: 'dzk_extract',
            title: 'Витяг з ДЗК',
            price: 100,
            currency: 'UAH',
            description: 'Офіційна заявка на отримання відомостей з Державного земельного кадастру.',
        },
        {
            id: 'drrp_extract',
            title: 'Витяг з ДРРП',
            price: 300,
            currency: 'UAH',
            description: 'Перевірка речових прав на нерухоме майно за кадастровим номером.',
        },
        {
            id: 'valuation_extract',
            title: 'НГО',
            price: 100,
            currency: 'UAH',
            description: 'Витяг із технічної документації про нормативну грошову оцінку.',
        },
        {
            id: 'cadastral_plan',
            title: 'Кадастровий план',
            price: 100,
            currency: 'UAH',
            description: 'Підготовка плану ділянки за кадастровим номером і доступною геометрією.',
        },
    ];
}

function parcelServiceById(id) {
    return parcelServices().find((service) => service.id === id) ?? null;
}

function listingTypes() {
    return [
        'land_sale',
        'land_with_house_sale',
        'land_rent',
        'long_term_lease',
    ];
}

async function createParcelListing(event) {
    const payload = parseJsonBody(event);
    const cadastralNumber = normalizeCadastralNumber(payload?.cadastralNumber);
    const listingType = firstString(payload?.listingType);
    const title = firstString(payload?.title);
    const description = firstString(payload?.description);
    const currency = listingCurrency(payload?.currency);
    const price = positiveNumber(payload?.price);
    const area = positiveNumber(payload?.area);
    const contact = normalizeListingContact(payload?.contact);
    const centroid = normalizeListingCentroid(payload?.centroid);
    const photos = normalizeListingPhotos(payload?.photos);

    if (!isCadastralNumber(cadastralNumber)) {
        return jsonResponse({ error: 'Некоректний кадастровий номер' }, 422);
    }

    if (!listingType || !listingTypes().includes(listingType)) {
        return jsonResponse({ error: 'Оберіть тип оголошення' }, 422);
    }

    if (!price) {
        return jsonResponse({ error: 'Вкажіть ціну' }, 422);
    }

    if (!title || title.length < 4) {
        return jsonResponse({ error: 'Вкажіть назву оголошення' }, 422);
    }

    if (!contact.phone) {
        return jsonResponse({ error: 'Вкажіть телефон для звʼязку' }, 422);
    }

    if (!centroid) {
        return jsonResponse({ error: 'Не вдалося визначити координати ділянки' }, 422);
    }

    const db = await mongoDb();

    if (!db) {
        return jsonResponse({ error: 'Сховище оголошень тимчасово недоступне' }, 503);
    }

    const now = new Date();
    const listing = {
        cadastral_number: cadastralNumber,
        cadastral_number_normalized: normalizeCadastralNumber(cadastralNumber),
        listing_type: listingType,
        title,
        description,
        price,
        currency,
        area,
        contact,
        photos,
        status: 'pending_review',
        source: 'user_submission',
        location: {
            type: 'Point',
            coordinates: [centroid.lng, centroid.lat],
        },
        centroid,
        created_at: now,
        updated_at: now,
        published_at: now,
    };
    const result = await db.collection('parcel_listings').insertOne(listing);
    const createdListing = {
        _id: result.insertedId,
        ...listing,
    };

    return jsonResponse({
        data: listingToResource(createdListing),
    }, 201);
}

async function parcelListings() {
    const db = await mongoDb();

    if (!db) {
        return jsonResponse({ data: [] });
    }

    const listings = await db.collection('parcel_listings')
        .find({ status: { $in: ['active', 'pending_review'] } })
        .sort({ created_at: -1 })
        .limit(500)
        .toArray();

    return jsonResponse({
        data: listings.map(listingToResource),
    });
}

async function parcelListingsGeoJson() {
    const db = await mongoDb();

    if (!db) {
        return geoJsonResponse(emptyFeatureCollection());
    }

    const listings = await db.collection('parcel_listings')
        .find({
            status: { $in: ['active', 'pending_review'] },
            location: { $exists: true },
        })
        .sort({ created_at: -1 })
        .limit(1000)
        .toArray();

    return geoJsonResponse({
        type: 'FeatureCollection',
        features: listings.map((listing) => ({
            type: 'Feature',
            id: String(listing._id),
            geometry: listing.location,
            properties: {
                id: String(listing._id),
                cadastralNumber: listing.cadastral_number,
                listingType: listing.listing_type,
                title: listing.title,
                price: listing.price,
                currency: listing.currency,
                priceLabel: `${formatListingPrice(listing.price)} ${listing.currency}`,
                status: listing.status,
            },
        })),
    });
}

async function parcelListingDetails(listingId) {
    if (!ObjectId.isValid(listingId)) {
        return jsonResponse({ error: 'Invalid listing id' }, 422);
    }

    const db = await mongoDb();
    const listing = db
        ? await db.collection('parcel_listings').findOne({ _id: new ObjectId(listingId) })
        : null;

    return jsonResponse({
        data: listing ? listingToResource(listing) : null,
    }, listing ? 200 : 404);
}

async function createParcelOrder(event) {
    const payload = parseJsonBody(event);
    const cadastralNumber = normalizeCadastralNumber(payload?.cadastralNumber);
    const service = parcelServiceById(payload?.serviceId);
    const customer = normalizeOrderCustomer(payload?.customer);

    if (!service) {
        return jsonResponse({ error: 'Невідома послуга' }, 422);
    }

    if (!isCadastralNumber(cadastralNumber)) {
        return jsonResponse({ error: 'Некоректний кадастровий номер' }, 422);
    }

    if (!customer.email && !customer.phone) {
        return jsonResponse({ error: 'Вкажіть email або телефон для отримання документа' }, 422);
    }

    const db = await mongoDb();

    if (!db) {
        return jsonResponse({ error: 'Сховище замовлень тимчасово недоступне' }, 503);
    }

    const now = new Date();
    const order = {
        cadastral_number: cadastralNumber,
        service_id: service.id,
        service_title: service.title,
        amount: service.price,
        ccy: 980,
        currency: service.currency,
        status: 'draft',
        payment_provider: 'stripe',
        customer,
        page_url: null,
        invoice_id: null,
        mono_status: null,
        stripe_status: null,
        stripe_payment_intent: null,
        created_at: now,
        updated_at: now,
    };
    const result = await db.collection('parcel_orders').insertOne(order);
    const orderId = String(result.insertedId);

    if (!process.env.STRIPE_SECRET_KEY) {
        await db.collection('parcel_orders').updateOne(
            { _id: result.insertedId },
            {
                $set: {
                    status: 'payment_not_configured',
                    updated_at: new Date(),
                },
            },
        );

        return jsonResponse({
            error: 'Оплата через Stripe ще не налаштована',
            data: {
                orderId,
                status: 'payment_not_configured',
            },
        }, 503);
    }

    let invoice;

    try {
        invoice = await createStripeCheckoutSession({
            orderId,
            cadastralNumber,
            service,
            customer,
            origin: requestOrigin(event),
        });
    } catch (error) {
        console.error(error);

        await db.collection('parcel_orders').updateOne(
            { _id: result.insertedId },
            {
                $set: {
                    status: 'payment_create_failed',
                    payment_error: error instanceof Error ? error.message : 'unknown error',
                    updated_at: new Date(),
                },
            },
        );

        return jsonResponse({
            error: 'Не вдалося створити оплату Stripe. Спробуйте ще раз.',
            data: {
                orderId,
                status: 'payment_create_failed',
            },
        }, 502);
    }

    await db.collection('parcel_orders').updateOne(
        { _id: result.insertedId },
        {
            $set: {
                status: 'payment_pending',
                invoice_id: invoice.invoiceId,
                page_url: invoice.pageUrl,
                stripe_status: invoice.status,
                updated_at: new Date(),
            },
        },
    );

    return jsonResponse({
        data: {
            orderId,
            status: 'payment_pending',
            invoiceId: invoice.invoiceId,
            pageUrl: invoice.pageUrl,
            amount: service.price,
            currency: service.currency,
        },
    }, 201);
}

async function parcelOrderDetails(orderId) {
    if (!ObjectId.isValid(orderId)) {
        return jsonResponse({ error: 'Invalid order id' }, 422);
    }

    const db = await mongoDb();
    let order = db
        ? await db.collection('parcel_orders').findOne({ _id: new ObjectId(orderId) })
        : null;

    if (db && order?.payment_provider === 'stripe' && order.invoice_id && order.status === 'payment_pending') {
        order = await refreshStripeOrderStatus(db, order);
    }

    return jsonResponse({
        data: order ? orderToResource(order) : null,
    }, order ? 200 : 404);
}

async function refreshStripeOrderStatus(db, order) {
    if (!process.env.STRIPE_SECRET_KEY || !String(order.invoice_id).startsWith('cs_')) {
        return order;
    }

    try {
        const session = await retrieveStripeCheckoutSession(order.invoice_id);
        const status = stripeOrderStatus(session);
        const update = {
            stripe_status: firstString(session.status, session.payment_status),
            stripe_payment_intent: firstString(session.payment_intent),
            updated_at: new Date(),
        };

        if (status) {
            update.status = status;
        }

        if (status === 'paid' && !order.paid_at) {
            update.paid_at = new Date();
        }

        await db.collection('parcel_orders').updateOne(
            { _id: order._id },
            { $set: update },
        );

        return {
            ...order,
            ...update,
        };
    } catch (error) {
        console.error(error);

        return order;
    }
}

async function createStripeCheckoutSession({ orderId, cadastralNumber, service, customer, origin }) {
    const successUrl = `${origin}/dilyanka/${encodeURIComponent(cadastralNumber)}?order=${encodeURIComponent(orderId)}&payment=success`;
    const cancelUrl = `${origin}/dilyanka/${encodeURIComponent(cadastralNumber)}?order=${encodeURIComponent(orderId)}&payment=cancel`;
    const params = new URLSearchParams({
        mode: 'payment',
        success_url: successUrl,
        cancel_url: cancelUrl,
        'line_items[0][quantity]': '1',
        'line_items[0][price_data][currency]': 'uah',
        'line_items[0][price_data][unit_amount]': String(service.price * 100),
        'line_items[0][price_data][product_data][name]': service.title,
        'line_items[0][price_data][product_data][description]': `Кадастровий номер: ${cadastralNumber}`,
        'metadata[order_id]': orderId,
        'metadata[cadastral_number]': cadastralNumber,
        'metadata[service_id]': service.id,
        'metadata[customer_phone]': customer.phone ?? '',
        'payment_intent_data[metadata][order_id]': orderId,
        'payment_intent_data[metadata][cadastral_number]': cadastralNumber,
        'payment_intent_data[metadata][service_id]': service.id,
    });

    if (customer.email) {
        params.set('customer_email', customer.email);
    } else {
        params.set('phone_number_collection[enabled]', 'true');
    }

    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: {
            authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
            'content-type': 'application/x-www-form-urlencoded',
        },
        body: params,
        signal: AbortSignal.timeout(12000),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.id || !data.url) {
        throw new Error(`Stripe checkout failed: ${response.status} ${JSON.stringify(data)}`);
    }

    return {
        invoiceId: data.id,
        pageUrl: data.url,
        status: data.status ?? null,
    };
}

async function retrieveStripeCheckoutSession(sessionId) {
    const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
        headers: {
            authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        },
        signal: AbortSignal.timeout(12000),
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.id) {
        throw new Error(`Stripe session retrieve failed: ${response.status} ${JSON.stringify(data)}`);
    }

    return data;
}

async function createMonobankInvoice({ orderId, cadastralNumber, service, customer, origin }) {
    const response = await fetch('https://api.monobank.ua/api/merchant/invoice/create', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'X-Token': process.env.MONOBANK_TOKEN,
        },
        body: JSON.stringify({
            amount: service.price * 100,
            ccy: 980,
            redirectUrl: `${origin}/dilyanka/${encodeURIComponent(cadastralNumber)}?order=${encodeURIComponent(orderId)}`,
            webHookUrl: `${origin}/api/v1/payments/monobank/webhook`,
            merchantPaymInfo: {
                reference: orderId,
                destination: `${service.title}: ${cadastralNumber}`,
                basketOrder: [{
                    name: service.title,
                    qty: 1,
                    sum: service.price * 100,
                    total: service.price * 100,
                    unit: 'шт.',
                    code: service.id,
                }],
                comment: customer.email || customer.phone || '',
            },
        }),
        signal: AbortSignal.timeout(12000),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.invoiceId || !data.pageUrl) {
        throw new Error(`Monobank invoice failed: ${response.status} ${JSON.stringify(data)}`);
    }

    return data;
}

async function monobankWebhook(event) {
    const payload = parseJsonBody(event);
    const invoiceId = firstString(payload?.invoiceId, payload?.invoice_id);
    const reference = firstString(payload?.reference, payload?.merchantPaymInfo?.reference);
    const status = firstString(payload?.status);
    const db = await mongoDb();

    if (!db || !invoiceId) {
        return jsonResponse({ ok: true });
    }

    const filter = reference && ObjectId.isValid(reference)
        ? { _id: new ObjectId(reference) }
        : { invoice_id: invoiceId };

    const orderStatus = monobankOrderStatus(status);
    const update = {
        invoice_id: invoiceId,
        mono_status: status,
        status: orderStatus,
        payment_webhook: payload,
        updated_at: new Date(),
    };

    if (orderStatus === 'paid') {
        update.paid_at = new Date();
    }

    await db.collection('parcel_orders').updateOne(
        filter,
        {
            $set: update,
        },
    );

    return jsonResponse({ ok: true });
}

function monobankOrderStatus(status) {
    if (status === 'success') {
        return 'paid';
    }

    if (['failure', 'expired', 'reversed'].includes(status)) {
        return 'payment_failed';
    }

    return 'payment_pending';
}

async function stripeWebhook(event) {
    const rawBody = rawRequestBody(event);
    const signingSecret = process.env.STRIPE_WEBHOOK_SIGNING_SECRET;

    if (!signingSecret?.startsWith('whsec_')) {
        console.warn('Stripe webhook signing secret is missing or invalid');

        return jsonResponse({ error: 'Stripe webhook signing secret is not configured' }, 503);
    }

    if (!verifyStripeSignature({
        rawBody,
        signatureHeader: event.headers?.['stripe-signature'] ?? event.headers?.['Stripe-Signature'],
        signingSecret,
    })) {
        return jsonResponse({ error: 'Invalid Stripe signature' }, 400);
    }

    let payload;

    try {
        payload = JSON.parse(rawBody);
    } catch {
        return jsonResponse({ error: 'Invalid Stripe payload' }, 400);
    }
    const db = await mongoDb();

    if (!db) {
        return jsonResponse({ error: 'Orders storage unavailable' }, 503);
    }

    if (payload.type !== 'checkout.session.completed') {
        return jsonResponse({ ok: true });
    }

    const session = payload.data?.object ?? {};
    const orderId = firstString(session.metadata?.order_id, session.client_reference_id);

    if (!orderId || !ObjectId.isValid(orderId)) {
        return jsonResponse({ ok: true });
    }

    await db.collection('parcel_orders').updateOne(
        { _id: new ObjectId(orderId) },
        {
            $set: {
                status: 'paid',
                invoice_id: firstString(session.id),
                page_url: firstString(session.url),
                stripe_status: firstString(session.status, session.payment_status),
                stripe_payment_intent: firstString(session.payment_intent),
                payment_webhook: payload,
                paid_at: new Date(),
                updated_at: new Date(),
            },
        },
    );

    return jsonResponse({ ok: true });
}

function stripeOrderStatus(session) {
    if (session.payment_status === 'paid') {
        return 'paid';
    }

    if (session.status === 'expired') {
        return 'payment_failed';
    }

    return session.status || session.payment_status ? 'payment_pending' : null;
}

function verifyStripeSignature({ rawBody, signatureHeader, signingSecret }) {
    if (!rawBody || !signatureHeader) {
        return false;
    }

    const parts = Object.fromEntries(
        signatureHeader
            .split(',')
            .map((part) => part.split('='))
            .filter(([key, value]) => key && value),
    );
    const timestamp = parts.t;
    const signature = parts.v1;

    if (!timestamp || !signature) {
        return false;
    }

    const expected = createHmac('sha256', signingSecret)
        .update(`${timestamp}.${rawBody}`)
        .digest('hex');
    const expectedBuffer = Buffer.from(expected, 'hex');
    const signatureBuffer = Buffer.from(signature, 'hex');

    return expectedBuffer.length === signatureBuffer.length
        && timingSafeEqual(expectedBuffer, signatureBuffer);
}

function rawRequestBody(event) {
    if (!event.body) {
        return '';
    }

    return event.isBase64Encoded
        ? Buffer.from(event.body, 'base64').toString('utf8')
        : event.body;
}

function parseJsonBody(event) {
    if (!event.body) {
        return {};
    }

    try {
        return JSON.parse(rawRequestBody(event));
    } catch {
        return {};
    }
}

function normalizeOrderCustomer(value) {
    const email = firstString(value?.email)?.toLowerCase() ?? null;
    const phone = firstString(value?.phone)?.replace(/[^\d+]/g, '') ?? null;

    return {
        name: firstString(value?.name),
        email: email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null,
        phone: phone && phone.length >= 10 ? phone : null,
    };
}

function normalizeListingContact(value) {
    const name = firstString(value?.name);
    const phone = firstString(value?.phone)?.replace(/[^\d+]/g, '') ?? null;
    const email = firstString(value?.email)?.toLowerCase() ?? null;

    return {
        name,
        phone: phone && phone.length >= 10 ? phone : null,
        email: email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null,
    };
}

function normalizeListingCentroid(value) {
    const lat = Number(value?.lat);
    const lng = Number(value?.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return null;
    }

    if (lat < 43 || lat > 53.5 || lng < 20 || lng > 42) {
        return null;
    }

    return { lat, lng };
}

function normalizeListingPhotos(value) {
    if (!Array.isArray(value)) {
        return [];
    }

    let totalDataUrlLength = 0;

    return value.slice(0, 5)
        .map((photo) => {
            const url = normalizeListingPhotoDataUrl(photo?.url);
            const size = Math.max(0, Math.floor(Number(photo?.size) || estimateDataUrlSize(url)));

            if (url) {
                totalDataUrlLength += url.length;
            }

            if (totalDataUrlLength > 2_200_000) {
                return null;
            }

            return {
                name: firstString(photo?.name)?.slice(0, 160) ?? 'photo',
                size,
                type: firstString(photo?.type)?.slice(0, 80) ?? photoTypeFromDataUrl(url),
                url,
            };
        })
        .filter(Boolean);
}

function normalizeListingPhotoDataUrl(value) {
    const url = firstString(value);

    if (!url || url.length > 520_000) {
        return null;
    }

    if (!/^data:image\/(?:jpeg|jpg|png|webp);base64,[a-z0-9+/=]+$/i.test(url)) {
        return null;
    }

    return url;
}

function estimateDataUrlSize(value) {
    if (!value) {
        return 0;
    }

    const base64 = value.split(',')[1] ?? '';

    return Math.floor(base64.length * 0.75);
}

function photoTypeFromDataUrl(value) {
    if (!value) {
        return null;
    }

    const match = value.match(/^data:(image\/[^;]+);base64,/i);

    return match?.[1]?.toLowerCase() ?? null;
}

function positiveNumber(value) {
    const number = Number(String(value ?? '').replace(',', '.').replace(/[^\d.]/g, ''));

    return Number.isFinite(number) && number > 0 ? number : null;
}

function listingCurrency(value) {
    const currency = firstString(value)?.toUpperCase();

    return ['UAH', 'USD', 'EUR'].includes(currency) ? currency : 'USD';
}

function requestOrigin(event) {
    const host = event.headers?.host ?? event.headers?.Host;
    const forwardedProtocol = event.headers?.['x-forwarded-proto'] ?? event.headers?.['X-Forwarded-Proto'] ?? 'https';
    const protocol = isLocalHost(host) ? 'http' : forwardedProtocol;

    return host
        ? `${protocol}://${host}`
        : process.env.PUBLIC_SITE_URL ?? process.env.URL ?? 'https://kadastrview.online';
}

function isLocalHost(host) {
    return /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(String(host ?? ''));
}

function orderToResource(order) {
    return {
        id: String(order._id),
        cadastralNumber: order.cadastral_number,
        serviceId: order.service_id,
        serviceTitle: order.service_title,
        amount: order.amount,
        currency: order.currency,
        status: order.status,
        invoiceId: order.invoice_id,
        pageUrl: order.page_url,
        createdAt: order.created_at,
        updatedAt: order.updated_at,
    };
}

function listingToResource(listing) {
    return {
        id: String(listing._id),
        cadastralNumber: listing.cadastral_number,
        listingType: listing.listing_type,
        title: listing.title,
        description: listing.description,
        price: listing.price,
        currency: listing.currency,
        area: listing.area,
        contact: listing.contact,
        photos: listing.photos ?? [],
        status: listing.status,
        centroid: listing.centroid,
        createdAt: listing.created_at,
        updatedAt: listing.updated_at,
    };
}

function formatListingPrice(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
        return '';
    }

    return new Intl.NumberFormat('uk-UA', {
        maximumFractionDigits: 0,
    }).format(number);
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

function isCadastralNumber(value) {
    return /^\d{10}:\d{2}:\d{3}:\d{4}$/.test(value);
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
