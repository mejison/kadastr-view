import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
const databaseName = process.env.MONGODB_DATABASE ?? 'kadastr_view';

if (!uri) {
    console.error('MONGODB_URI is required.');
    process.exit(1);
}

const client = new MongoClient(uri, {
    maxPoolSize: 3,
});

try {
    await client.connect();
    const db = client.db(databaseName);

    await db.command({ ping: 1 });

    await db.collection('parcels').createIndexes([
        {
            key: { cadastral_number_normalized: 1 },
            name: 'cadastral_number_normalized_unique',
            unique: true,
            sparse: true,
        },
        {
            key: { cadastral_number: 1 },
            name: 'cadastral_number',
            sparse: true,
        },
        {
            key: { cadnum: 1 },
            name: 'cadnum',
            sparse: true,
        },
        {
            key: { geometry: '2dsphere' },
            name: 'geometry_2dsphere',
            sparse: true,
        },
        {
            key: { ownership_category: 1, is_active: 1 },
            name: 'ownership_active',
        },
    ]);

    await db.collection('parcel_lookups').createIndexes([
        {
            key: { cadastral_number: 1 },
            name: 'cadastral_number_unique',
            unique: true,
        },
        {
            key: { 'centroid.lng': 1, 'centroid.lat': 1 },
            name: 'centroid_lng_lat',
        },
        {
            key: { updated_at: -1 },
            name: 'updated_at_desc',
        },
    ]);

    await db.collection('parcel_open_rights').createIndexes([
        {
            key: { cadastral_number_normalized: 1 },
            name: 'cadastral_number_normalized',
        },
        {
            key: { cadastral_number: 1 },
            name: 'cadastral_number',
            sparse: true,
        },
        {
            key: { source_url: 1, source_row_id: 1 },
            name: 'source_row_unique',
            unique: true,
            sparse: true,
        },
        {
            key: { imported_at: -1 },
            name: 'imported_at_desc',
        },
    ]);

    await db.collection('parcel_orders').createIndexes([
        {
            key: { cadastral_number: 1, created_at: -1 },
            name: 'cadastral_number_created_at',
        },
        {
            key: { invoice_id: 1 },
            name: 'invoice_id_unique',
            unique: true,
            partialFilterExpression: { invoice_id: { $type: 'string' } },
        },
        {
            key: { status: 1, created_at: -1 },
            name: 'status_created_at',
        },
        {
            key: { stripe_payment_intent: 1 },
            name: 'stripe_payment_intent',
            partialFilterExpression: { stripe_payment_intent: { $type: 'string' } },
        },
    ]);

    await db.collection('parcel_listings').createIndexes([
        {
            key: { cadastral_number_normalized: 1, created_at: -1 },
            name: 'cadastral_number_created_at',
        },
        {
            key: { status: 1, created_at: -1 },
            name: 'status_created_at',
        },
        {
            key: { listing_type: 1, status: 1 },
            name: 'listing_type_status',
        },
        {
            key: { location: '2dsphere' },
            name: 'location_2dsphere',
            sparse: true,
        },
    ]);

    console.log(`MongoDB ready: ${databaseName}`);
} finally {
    await client.close();
}
