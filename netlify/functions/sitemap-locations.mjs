import { MongoClient } from 'mongodb';
import { communityPath, indexableCommunityPages } from './community-page-data.mjs';
import { districtPath, indexableDistrictPages } from './district-page-data.mjs';
import { oblastSlugByName } from './geo-seo-regions.mjs';

const siteUrl = 'https://kadastrview.online';
const headers = { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=60, s-maxage=60, must-revalidate', 'netlify-cache-tag': 'seo-sitemaps' };
let mongoClientPromise;
let unavailableUntil = 0;
let sitemapCache = { expiresAt: 0, urls: [] };

export async function handler(event, context = {}) {
    context.callbackWaitsForEmptyEventLoop = false;
    if (!['GET', 'HEAD'].includes(event.httpMethod)) return response('', 405);
    const urls = await locationSitemapUrls(await mongoDb()).catch((error) => {
        console.error('Location sitemap query failed', error);
        return [];
    });
    return response(render(urls));
}

export async function locationSitemapUrls(db) {
    if (sitemapCache.expiresAt > Date.now()) return sitemapCache.urls;
    const [communities, districts] = await Promise.all([
        indexableCommunityPages(db),
        indexableDistrictPages(db, oblastSlugByName),
    ]);
    const urls = communities.map((row) => ({
        loc: `${siteUrl}${communityPath(row.katottg)}`,
        lastmod: validDate(row.latestUpdate),
        changefreq: 'weekly',
        priority: '0.65',
    })).concat(districts.map((row) => ({
        loc: `${siteUrl}${districtPath(row.oblastSlug, row.district)}`,
        lastmod: validDate(row.latestUpdate),
        changefreq: 'weekly',
        priority: '0.7',
    }))).sort((a, b) => a.loc.localeCompare(b.loc));
    sitemapCache = { urls, expiresAt: Date.now() + 10 * 60 * 1000 };
    return urls;
}

function validDate(value) { const date = new Date(value); return Number.isNaN(date.valueOf()) ? new Date().toISOString().slice(0, 10) : date.toISOString().slice(0, 10); }
function render(urls) { return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((item) => `    <url><loc>${item.loc}</loc><lastmod>${item.lastmod}</lastmod><changefreq>${item.changefreq}</changefreq><priority>${item.priority}</priority></url>`).join('\n')}\n</urlset>`; }
function response(body, statusCode = 200) { return { statusCode, headers, body }; }
async function mongoDb() {
    if (!process.env.MONGODB_URI || Date.now() < unavailableUntil) return null;
    mongoClientPromise ??= MongoClient.connect(process.env.MONGODB_URI, { maxPoolSize: 3, serverSelectionTimeoutMS: 4500, connectTimeoutMS: 4500, socketTimeoutMS: 10000 });
    try { return (await mongoClientPromise).db(process.env.MONGODB_DATABASE ?? 'kadastr_view'); }
    catch (error) { mongoClientPromise = null; unavailableUntil = Date.now() + 60_000; console.error('MongoDB unavailable', error); return null; }
}
