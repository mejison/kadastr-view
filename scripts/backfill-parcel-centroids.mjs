import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { MongoClient } from 'mongodb';
import { centroidFromHtml, communityForPoint } from './spatial-location.mjs';

const CADASTRAL = /^\d{10}:\d{2}:\d{3}:\d{4}$/;
const DEFAULT_COMMUNITY_BOUNDARIES_URL = 'https://raw.githubusercontent.com/bnotezz/ua-settlements/main/assets/maps/communities.geojson';
const values = process.argv.slice(2);
const has = (name) => values.includes(name);
const value = (name, fallback) => values.find((item) => item.startsWith(`${name}=`))?.slice(name.length + 1) ?? fallback;
const write = has('--write');
const refreshBoundaries = has('--refresh-boundaries');
const limit = Math.max(0, Number(value('--limit', '10')));
const delayMs = Math.max(500, Number(value('--delay-ms', '1200')));
const cachePath = resolve(value('--boundaries-file', '.cache/community-boundaries.geojson'));
const reportPath = resolve(value('--report', 'storage/centroid-backfill-report.json'));
// This legacy enrichment command must never silently scrape a third-party service.
// Supply a source explicitly only when an authorised source is available.
const centroidSource = value('--centroid-source', process.env.PARCEL_CENTROID_SOURCE_BASE ?? '');
const boundariesSource = value('--boundaries-source', process.env.COMMUNITY_BOUNDARIES_URL ?? DEFAULT_COMMUNITY_BOUNDARIES_URL);
const uri = process.env.MONGODB_URI;
const databaseName = process.env.MONGODB_DATABASE ?? 'kadastr_view';

if (!uri) throw new Error('MONGODB_URI is required.');
if (!centroidSource) throw new Error('Set PARCEL_CENTROID_SOURCE_BASE or pass --centroid-source. No third-party centroid source is configured by default.');
if (!write) console.log('Dry run: no MongoDB documents will be written. Add --write to persist results.');

const boundaries = await loadBoundaries();
const client = new MongoClient(uri, { maxPoolSize: 2 });
try {
    await client.connect();
    const db = client.db(databaseName);
    const candidates = await candidateNumbers(db);
    const report = { started_at: new Date().toISOString(), write, candidate_count: candidates.length, boundaries: boundaries.length, resolved_centroids: 0, matched_communities: 0, missing: 0, failed: 0, failures: [] };

    for (let index = 0; index < candidates.length; index += 1) {
        const cadastralNumber = candidates[index];
        try {
            const response = await fetch(`${centroidSource}${encodeURIComponent(cadastralNumber)}`, { headers: { accept: 'text/html' }, signal: AbortSignal.timeout(15_000) });
            if (response.status === 403 || response.status === 429) throw new Error(`Source refused request: HTTP ${response.status}. Stopping without retries.`);
            if (!response.ok) {
                report.missing += 1;
                continue;
            }
            const centroid = centroidFromHtml(await response.text());
            if (!centroid) {
                report.missing += 1;
                continue;
            }
            report.resolved_centroids += 1;
            const community = communityForPoint(centroid, boundaries);
            if (community) report.matched_communities += 1;
            if (write) await saveResult(db, cadastralNumber, centroid, community);
        } catch (error) {
            report.failed += 1;
            report.failures.push({ cadastral_number: cadastralNumber, error: String(error.message ?? error) });
            if (/HTTP (403|429)/.test(String(error.message))) break;
        }
        if (index < candidates.length - 1) await sleep(delayMs);
    }

    report.finished_at = new Date().toISOString();
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify({ ...report, report_path: reportPath }, null, 2));
} finally {
    await client.close();
}

async function candidateNumbers(db) {
    const cached = new Set(await db.collection('parcel_lookups').distinct('cadastral_number'));
    const rows = await db.collection('parcel_open_rights').aggregate([
        { $match: { cadastral_number_normalized: { $regex: CADASTRAL } } },
        { $group: { _id: '$cadastral_number_normalized' } },
        { $sort: { _id: 1 } },
    ]).toArray();
    const pending = rows.map((row) => row._id).filter((number) => !cached.has(number));
    return limit > 0 ? pending.slice(0, limit) : pending;
}

async function loadBoundaries() {
    if (!refreshBoundaries) {
        try {
            const cached = JSON.parse(readFileSync(cachePath, 'utf8'));
            if (Array.isArray(cached.features) && cached.features.length > 100) return cached.features;
        } catch (error) {
            if (error?.code !== 'ENOENT') throw error;
        }
    }
    const response = await fetch(boundariesSource, { signal: AbortSignal.timeout(120_000) });
    if (!response.ok) throw new Error(`Unable to fetch community boundaries: HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data.features)) throw new Error('Community boundary response failed validation.');
    const features = data.features.filter((feature) => feature.geometry?.coordinates?.length);
    if (features.length < 1_000) throw new Error(`Community boundary response is unexpectedly small (${features.length} polygons).`);
    mkdirSync(dirname(cachePath), { recursive: true });
    writeFileSync(cachePath, `${JSON.stringify({ type: 'FeatureCollection', features })}\n`);
    return features;
}

async function saveResult(db, cadastralNumber, centroid, community) {
    const now = new Date();
    await db.collection('parcel_lookups').updateOne(
        { cadastral_number: cadastralNumber },
        { $set: { cadastral_number: cadastralNumber, centroid, source_url: `${centroidSource}${encodeURIComponent(cadastralNumber)}`, updated_at: now }, $setOnInsert: { created_at: now } },
        { upsert: true },
    );
    if (!community) return;
    await db.collection('parcel_locations').updateOne(
        { cadastral_number: cadastralNumber },
        { $set: { spatial: { centroid, community, matched_by: 'centroid-in-community-boundary', confidence: 'high', source_url: boundariesSource, matched_at: now }, updated_at: now } },
        { upsert: false },
    );
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
