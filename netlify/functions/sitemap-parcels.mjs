import { MongoClient } from 'mongodb';
import { canonicalParcelPath } from './seo-indexability.mjs';
import { parcelSitemapPipeline } from './seo-parcel-data.mjs';

const siteUrl = 'https://kadastrview.online';
const fallbackLastModified = '2026-09-06';
const xmlHeaders = { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=60, s-maxage=60, must-revalidate', 'netlify-cache-tag': 'seo-sitemaps' };
let mongoClientPromise;
let mongoUnavailableUntil = 0;

export async function handler(event, context = {}) {
    context.callbackWaitsForEmptyEventLoop = false;
    if (!['GET', 'HEAD'].includes(event.httpMethod)) return xmlResponse('', 405);
    const db = await mongoDb();
    if (!db) return xmlResponse(renderSitemap([]));
    try {
        const rows = await db.collection('parcel_open_rights').aggregate(parcelSitemapPipeline(), { allowDiskUse: true }).toArray();
        return xmlResponse(renderSitemap(rows));
    } catch (error) {
        console.error('Parcel sitemap query failed', error);
        return xmlResponse(renderSitemap([]));
    }
}

export function sitemapParcelUrls(rows = []) {
    return rows.map((row) => ({ loc: `${siteUrl}${canonicalParcelPath(row.cadastralNumber)}`, lastmod: dateValue(row.latestUpdate) }));
}

function renderSitemap(rows) {
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapParcelUrls(rows).map((url) => `    <url><loc>${url.loc}</loc><lastmod>${url.lastmod}</lastmod><changefreq>monthly</changefreq><priority>0.5</priority></url>`).join('\n')}\n</urlset>`;
}

function dateValue(value) {
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.valueOf()) ? date.toISOString().slice(0, 10) : fallbackLastModified;
}

function xmlResponse(body, statusCode = 200) { return { statusCode, headers: xmlHeaders, body }; }
async function mongoDb() {
    const uri = process.env.MONGODB_URI;
    if (!uri || Date.now() < mongoUnavailableUntil) return null;
    mongoClientPromise ??= MongoClient.connect(uri, { maxPoolSize: 3, serverSelectionTimeoutMS: 4500, connectTimeoutMS: 4500, socketTimeoutMS: 10000 });
    try { return (await mongoClientPromise).db(process.env.MONGODB_DATABASE ?? 'kadastr_view'); } catch (error) { mongoClientPromise = null; mongoUnavailableUntil = Date.now() + 60000; console.error('MongoDB connection unavailable', error); return null; }
}
