import { MongoClient } from 'mongodb';
import { eligibleOblastSlugs } from './region-stats.mjs';

const siteUrl = 'https://kadastrview.online';
const staticLastModified = '2026-09-06';
const xmlHeaders = {
    'content-type': 'application/xml; charset=utf-8',
    'cache-control': 'public, max-age=60, s-maxage=60, must-revalidate',
    'netlify-cache-tag': 'seo-sitemaps',
};
const fixedPaths = [
    ['/', 'weekly', '1.0'],
    ['/guides', 'monthly', '0.9'],
    ['/guides/kadastrovyi-nomer', 'monthly', '0.9'],
    ['/guides/poshuk-za-kadastrovym-nomerom', 'monthly', '0.9'],
    ['/guides/yak-znayty-dilyanku', 'monthly', '0.85'],
    ['/oblast', 'monthly', '0.85'],
    ['/about', 'yearly', '0.4'],
    ['/data-sources', 'monthly', '0.6'],
    ['/contact', 'yearly', '0.3'],
    ['/privacy', 'yearly', '0.2'],
    ['/terms', 'yearly', '0.2'],
];

let mongoClientPromise;
let mongoUnavailableUntil = 0;

export async function handler(event, context = {}) {
    context.callbackWaitsForEmptyEventLoop = false;

    if (!['GET', 'HEAD'].includes(event.httpMethod)) {
        return xmlResponse('', 405);
    }

    const db = await mongoDb();
    const slugs = await eligibleOblastSlugs(db).catch((error) => {
        console.error('Eligible oblast sitemap query failed', error);
        return [];
    });

    return xmlResponse(renderSitemap(sitemapUrls(slugs)));
}

export function sitemapUrls(eligibleSlugs = []) {
    const fixed = fixedPaths.map(([path, changefreq, priority]) => ({
        loc: `${siteUrl}${path}`,
        lastmod: staticLastModified,
        changefreq,
        priority,
    }));
    const oblasts = [...new Set(eligibleSlugs)].sort().map((slug) => ({
        loc: `${siteUrl}/oblast/${slug}`,
        lastmod: staticLastModified,
        changefreq: 'weekly',
        priority: '0.7',
    }));

    return [...fixed, ...oblasts];
}

function renderSitemap(urls) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((url) => `    <url><loc>${url.loc}</loc><lastmod>${url.lastmod}</lastmod><changefreq>${url.changefreq}</changefreq><priority>${url.priority}</priority></url>`).join('\n')}
</urlset>`;
}

function xmlResponse(body, statusCode = 200) {
    return { statusCode, headers: xmlHeaders, body };
}

async function mongoDb() {
    const uri = process.env.MONGODB_URI;

    if (!uri || Date.now() < mongoUnavailableUntil) {
        return null;
    }

    mongoClientPromise ??= MongoClient.connect(uri, {
        maxPoolSize: 3,
        serverSelectionTimeoutMS: 4500,
        connectTimeoutMS: 4500,
        socketTimeoutMS: 10000,
    });

    try {
        return (await mongoClientPromise).db(process.env.MONGODB_DATABASE ?? 'kadastr_view');
    } catch (error) {
        mongoClientPromise = null;
        mongoUnavailableUntil = Date.now() + 60000;
        console.error('MongoDB connection unavailable', error);
        return null;
    }
}
