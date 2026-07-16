import { MongoClient } from 'mongodb';

const siteUrl = 'https://kadastrview.online';
const xmlHeaders = {
    'content-type': 'application/xml; charset=utf-8',
    'cache-control': 'public, max-age=3600, s-maxage=21600',
};

let mongoClientPromise;
let mongoUnavailableUntil = 0;

export async function handler(event, context = {}) {
    context.callbackWaitsForEmptyEventLoop = false;

    if (event.httpMethod !== 'GET' && event.httpMethod !== 'HEAD') {
        return xmlResponse('', 405);
    }

    const db = await mongoDb();
    const limit = Math.min(Math.max(Number(new URL(event.rawUrl).searchParams.get('limit') ?? 50000), 1), 50000);
    const parcels = db
        ? await db.collection('parcels')
            .find({
                is_active: { $ne: false },
                $or: [
                    { cadastral_number: { $type: 'string', $ne: '' } },
                    { cadnum: { $type: 'string', $ne: '' } },
                ],
            }, {
                projection: {
                    cadastral_number: 1,
                    cadnum: 1,
                    source_updated_at: 1,
                    updated_at: 1,
                },
            })
            .sort({ updated_at: -1, source_updated_at: -1 })
            .limit(limit)
            .toArray()
        : [];

    const urls = parcels
        .map((parcel) => ({
            loc: `${siteUrl}/dilyanka/${encodeURIComponent(parcel.cadastral_number ?? parcel.cadnum).replace(/%3A/gi, ':')}`,
            lastmod: sitemapDate(parcel.source_updated_at ?? parcel.updated_at),
        }))
        .filter((item) => item.loc.endsWith('/dilyanka/') === false);

    return xmlResponse(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((url) => `    <url>
        <loc>${escapeXml(url.loc)}</loc>
        ${url.lastmod ? `<lastmod>${url.lastmod}</lastmod>` : ''}
        <changefreq>weekly</changefreq>
        <priority>0.7</priority>
    </url>`).join('\n')}
</urlset>`);
}

function xmlResponse(body, statusCode = 200) {
    return { statusCode, headers: xmlHeaders, body };
}

function sitemapDate(value) {
    const date = value ? new Date(value) : null;

    return date && Number.isFinite(date.getTime())
        ? date.toISOString().slice(0, 10)
        : null;
}

function escapeXml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
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
