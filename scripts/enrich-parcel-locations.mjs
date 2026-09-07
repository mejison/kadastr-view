import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { MongoClient } from 'mongodb';
import { buildKatottgIndex, locationForCadastralNumber, publisherSupportsCommunity } from './location-enrichment.mjs';

const DEFAULT_KATOTTG_URL = 'https://katottg.net.ua/dumps/katottg.json';
const VALID_CADASTRAL_NUMBER = /^\d{10}:\d{2}:\d{3}:\d{4}$/;
const args = new Set(process.argv.slice(2));
const valueFor = (name, fallback) => {
    const prefix = `${name}=`;
    const item = process.argv.slice(2).find((argument) => argument.startsWith(prefix));
    return item ? item.slice(prefix.length) : fallback;
};

const dryRun = args.has('--dry-run');
const refresh = args.has('--refresh');
const resume = args.has('--resume');
const limit = Number(valueFor('--limit', '0'));
const batchSize = Math.max(1, Number(valueFor('--batch-size', '500')));
const cachePath = resolve(valueFor('--katottg-file', '.cache/katottg.json'));
const reportPath = resolve(valueFor('--report', 'storage/location-enrichment-report.json'));
const uri = process.env.MONGODB_URI;
const databaseName = process.env.MONGODB_DATABASE ?? 'kadastr_view';

if (!uri) {
    console.error('MONGODB_URI is required. Run via: node --env-file=.env scripts/enrich-parcel-locations.mjs');
    process.exit(1);
}

const katottg = await loadKatottg();
const index = buildKatottgIndex(katottg);
const client = new MongoClient(uri, { maxPoolSize: 3 });

try {
    await client.connect();
    const db = client.db(databaseName);
    const allRecords = await sourceRecords(db);
    const records = resume ? await recordsWithoutSavedLocation(db, allRecords) : allRecords;
    const locations = buildLocations(records, index, limit);
    const report = makeReport(locations, records, katottg, allRecords.length);

    if (!dryRun) {
        await db.collection('parcel_locations').createIndexes([
            { key: { cadastral_number: 1 }, name: 'cadastral_number_unique', unique: true },
            { key: { 'location.community.id': 1 }, name: 'community_id' },
            { key: { 'location.settlement.id': 1 }, name: 'settlement_id' },
            { key: { 'location.koatuu': 1 }, name: 'koatuu' },
        ]);
        await writeLocations(db, locations);
    }

    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, `${JSON.stringify({ ...report, dry_run: dryRun }, null, 2)}\n`);
    console.log(JSON.stringify({ ...report, dry_run: dryRun, report_path: reportPath }, null, 2));
} finally {
    await client.close();
}

async function loadKatottg() {
    if (!refresh) {
        try {
            return JSON.parse(readFileSync(cachePath, 'utf8'));
        } catch (error) {
            if (error?.code !== 'ENOENT') throw error;
        }
    }

    const response = await fetch(DEFAULT_KATOTTG_URL, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`Unable to download KATOTTG dump: HTTP ${response.status}`);
    const text = await response.text();
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed) || parsed.length < 10_000) throw new Error('KATOTTG dump failed validation.');
    mkdirSync(dirname(cachePath), { recursive: true });
    writeFileSync(cachePath, text);
    return parsed;
}

async function sourceRecords(db) {
    const cursor = db.collection('parcel_open_rights').find(
        { cadastral_number_normalized: { $regex: VALID_CADASTRAL_NUMBER } },
        { projection: { _id: 0, cadastral_number_normalized: 1, publisher: 1, address: 1 } },
    );
    const grouped = new Map();
    for await (const record of cursor) {
        const cadastre = record.cadastral_number_normalized;
        const group = grouped.get(cadastre) ?? { cadastral_number: cadastre, publishers: new Set(), address_count: 0, source_record_count: 0 };
        if (typeof record.publisher === 'string' && record.publisher.trim()) group.publishers.add(record.publisher.trim());
        if (typeof record.address === 'string' && record.address.trim()) group.address_count += 1;
        group.source_record_count += 1;
        grouped.set(cadastre, group);
    }
    return [...grouped.values()];
}

async function recordsWithoutSavedLocation(db, records) {
    const saved = new Set(await db.collection('parcel_locations').distinct('cadastral_number'));
    const pending = records.filter((record) => !saved.has(record.cadastral_number));
    console.log(`Resume mode: ${pending.length}/${records.length} locations remain.`);
    return pending;
}

function buildLocations(records, katottgIndex, max) {
    const result = [];
    for (const record of records) {
        if (max > 0 && result.length >= max) break;
        const location = locationForCadastralNumber(record.cadastral_number, katottgIndex);
        if (!location) continue;
        const publishers = [...record.publishers].sort();
        location.publisher_supports_community = publisherSupportsCommunity(publishers, location.community);
        location.source_record_count = record.source_record_count;
        location.source_has_address = record.address_count > 0;
        result.push({ cadastral_number: record.cadastral_number, location, publishers });
    }
    return result;
}

async function writeLocations(db, locations) {
    for (let start = 0; start < locations.length; start += batchSize) {
        const chunk = locations.slice(start, start + batchSize);
        const now = new Date();
        await db.collection('parcel_locations').bulkWrite(chunk.map(({ cadastral_number, location, publishers }) => ({
            updateOne: {
                filter: { cadastral_number },
                update: {
                    $set: {
                        cadastral_number,
                        location,
                        publisher_names: publishers,
                        source: {
                            name: 'KATOTTG classifier dump',
                            url: DEFAULT_KATOTTG_URL,
                            matched_at: now,
                            method: 'local-koatuu-prefix-join',
                        },
                        updated_at: now,
                    },
                    $setOnInsert: { created_at: now },
                },
                upsert: true,
            },
        })), { ordered: false });
        console.log(`Saved ${Math.min(start + chunk.length, locations.length)}/${locations.length} locations`);
    }
}

function makeReport(locations, records, units, totalSourceParcels = records.length) {
    const count = (predicate) => locations.filter(predicate).length;
    const katottgChecksum = createHash('sha256').update(JSON.stringify(units)).digest('hex');
    return {
        generated_at: new Date().toISOString(),
        source_unique_parcels: totalSourceParcels,
        selected_for_this_run: records.length,
        processed_parcels: locations.length,
        unmatched_parcels: records.length - locations.length,
        with_oblast: count(({ location }) => Boolean(location.oblast)),
        with_district: count(({ location }) => Boolean(location.district)),
        with_community: count(({ location }) => Boolean(location.community)),
        with_settlement: count(({ location }) => Boolean(location.settlement)),
        high_confidence: count(({ location }) => location.confidence === 'high'),
        publisher_confirmed: count(({ location }) => location.publisher_supports_community === true),
        source: { url: DEFAULT_KATOTTG_URL, unit_count: units.length, sha256: katottgChecksum },
    };
}
