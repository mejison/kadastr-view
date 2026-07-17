import { MongoClient } from 'mongodb';
import AdmZip from 'adm-zip';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import * as XLSX from 'xlsx';

const dataGovApi = 'https://data.gov.ua/api/3/action';
const uri = process.env.MONGODB_URI;
const databaseName = process.env.MONGODB_DATABASE ?? 'kadastr_view';
const outputMode = process.env.OPEN_LEASE_OUTPUT ?? (uri ? 'mongo' : 'sqlite');
const outputTargets = new Set(outputMode.split(',').map((value) => value.trim()).filter(Boolean));
const sqlitePath = process.env.OPEN_LEASE_SQLITE_PATH ?? 'storage/open-lease-data.sqlite';
const cadastralNumberPattern = /\b\d{10}:\d{2}:\d{3}:\d{4}\b/g;
const defaultQueries = [
    'орендарі земельних ділянок',
    'договори оренди землі',
    'земельні ділянки комунальної власності оренда',
    'перелік орендарів земельних ділянок',
    'актуальні списки власників орендарів місцевих земельних ділянок',
    'перелік укладених договорів оренди земельних ділянок',
    'оренди землі комунальної власності кадастровий номер',
    'перелік орендарів з якими укладено договори оренди землі',
];
const requestTimeoutMs = Number(process.env.OPEN_LEASE_REQUEST_TIMEOUT_MS ?? 30000);
const requestAttempts = Number(process.env.OPEN_LEASE_REQUEST_ATTEMPTS ?? 3);
const mongoBatchSize = Number(process.env.OPEN_LEASE_MONGO_BATCH_SIZE ?? 50);
const dataGovSearchRows = Number(process.env.DATA_GOV_SEARCH_ROWS ?? 100);

if (outputTargets.has('mongo') && !uri) {
    console.error('MONGODB_URI is required.');
    process.exit(1);
}

let client;
let db;
let sqlite;
let sqliteInsertStatement;

try {
    await initializeOutputs();
    const packages = await discoverPackages();
    let importedCount = 0;

    console.log(`Discovered ${packages.length} open-data datasets.`);

    for (const dataset of packages) {
        const resources = dataset.resources
            .filter((resource) => isSupportedResource(resource))
            .slice(0, Number(process.env.OPEN_LEASE_MAX_RESOURCES_PER_DATASET ?? 12));

        for (const resource of resources) {
            const rows = await readResourceRows(resource);
            const records = rows.flatMap((row, index) => openRightsRecordsFromRow(dataset, resource, row, index));

            if (records.length === 0) {
                continue;
            }

            const result = await writeOpenRightsRecords(records);
            importedCount += result;
            console.log(`Imported ${records.length} records from ${dataset.title} / ${resource.name ?? resource.format}`);
        }
    }

    console.log(`Open lease data import finished. Matched rows: ${importedCount}`);
} finally {
    await client?.close();
    sqlite?.close();
}

async function initializeOutputs() {
    if (outputTargets.has('sqlite')) {
        initializeSqlite();
    }

    if (outputTargets.has('mongo')) {
        db = await mongoDb();
    }
}

async function writeOpenRightsRecords(records) {
    let writtenCount = 0;

    if (outputTargets.has('sqlite')) {
        writtenCount = Math.max(writtenCount, writeSqliteRecords(records));
    }

    if (outputTargets.has('mongo')) {
        const operations = records.map((record) => ({
            updateOne: {
                filter: {
                    source_url: record.source_url,
                    source_row_id: record.source_row_id,
                },
                update: {
                    $set: record,
                    $setOnInsert: { created_at: new Date() },
                },
                upsert: true,
            },
        }));

        writtenCount = Math.max(writtenCount, await writeMongoOperations(operations));
    }

    return writtenCount;
}

async function writeMongoOperations(operations) {
    let writtenCount = 0;

    for (let index = 0; index < operations.length; index += mongoBatchSize) {
        const chunk = operations.slice(index, index + mongoBatchSize);
        const result = await bulkWriteWithRetry(chunk);

        writtenCount += result.upsertedCount + result.modifiedCount;
    }

    return writtenCount;
}

function initializeSqlite() {
    mkdirSync(dirname(sqlitePath), { recursive: true });
    sqlite = new DatabaseSync(sqlitePath);
    sqlite.exec(`
        CREATE TABLE IF NOT EXISTS parcel_open_rights (
            cadastral_number TEXT NOT NULL,
            cadastral_number_normalized TEXT NOT NULL,
            right_type TEXT,
            tenant TEXT,
            landlord TEXT,
            landlord_code TEXT,
            contract_number TEXT,
            contract_date TEXT,
            registered_at TEXT,
            valid_until TEXT,
            lease_area TEXT,
            land_use TEXT,
            address TEXT,
            source_name TEXT,
            dataset_title TEXT,
            dataset_name TEXT,
            publisher TEXT,
            dataset_url TEXT,
            resource_url TEXT,
            source_url TEXT NOT NULL,
            source_row_id TEXT NOT NULL,
            raw_json TEXT,
            imported_at TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (source_url, source_row_id)
        );
        CREATE INDEX IF NOT EXISTS parcel_open_rights_cadastral_number_normalized
            ON parcel_open_rights (cadastral_number_normalized);
        CREATE INDEX IF NOT EXISTS parcel_open_rights_cadastral_number
            ON parcel_open_rights (cadastral_number);
    `);
    ensureSqliteColumns([
        ['landlord_code', 'TEXT'],
        ['contract_date', 'TEXT'],
        ['lease_area', 'TEXT'],
        ['land_use', 'TEXT'],
        ['address', 'TEXT'],
    ]);
    sqliteInsertStatement = sqlite.prepare(`
        INSERT INTO parcel_open_rights (
            cadastral_number,
            cadastral_number_normalized,
            right_type,
            tenant,
            landlord,
            landlord_code,
            contract_number,
            contract_date,
            registered_at,
            valid_until,
            lease_area,
            land_use,
            address,
            source_name,
            dataset_title,
            dataset_name,
            publisher,
            dataset_url,
            resource_url,
            source_url,
            source_row_id,
            raw_json,
            imported_at,
            updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(source_url, source_row_id) DO UPDATE SET
            cadastral_number = excluded.cadastral_number,
            cadastral_number_normalized = excluded.cadastral_number_normalized,
            right_type = excluded.right_type,
            tenant = excluded.tenant,
            landlord = excluded.landlord,
            landlord_code = excluded.landlord_code,
            contract_number = excluded.contract_number,
            contract_date = excluded.contract_date,
            registered_at = excluded.registered_at,
            valid_until = excluded.valid_until,
            lease_area = excluded.lease_area,
            land_use = excluded.land_use,
            address = excluded.address,
            source_name = excluded.source_name,
            dataset_title = excluded.dataset_title,
            dataset_name = excluded.dataset_name,
            publisher = excluded.publisher,
            dataset_url = excluded.dataset_url,
            resource_url = excluded.resource_url,
            raw_json = excluded.raw_json,
            imported_at = excluded.imported_at,
            updated_at = CURRENT_TIMESTAMP
    `);
    console.log(`SQLite output: ${sqlitePath}`);
}

function ensureSqliteColumns(columns) {
    const existingColumns = new Set(
        sqlite.prepare('PRAGMA table_info(parcel_open_rights)').all().map((column) => column.name),
    );

    for (const [name, type] of columns) {
        if (!existingColumns.has(name)) {
            sqlite.exec(`ALTER TABLE parcel_open_rights ADD COLUMN ${name} ${type}`);
        }
    }
}

function writeSqliteRecords(records) {
    sqlite.exec('BEGIN');

    try {
        for (const record of records) {
            sqliteInsertStatement.run(
                record.cadastral_number,
                record.cadastral_number_normalized,
                record.right_type,
                record.tenant,
                record.landlord,
                record.landlord_code,
                record.contract_number,
                record.contract_date,
                record.registered_at,
                record.valid_until,
                record.lease_area,
                record.land_use,
                record.address,
                record.source_name,
                record.dataset_title,
                record.dataset_name,
                record.publisher,
                record.dataset_url,
                record.resource_url,
                record.source_url,
                record.source_row_id,
                JSON.stringify(record.raw ?? {}),
                record.imported_at instanceof Date ? record.imported_at.toISOString() : String(record.imported_at ?? ''),
            );
        }

        sqlite.exec('COMMIT');
        return records.length;
    } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
    }
}

async function bulkWriteWithRetry(operations) {
    let lastError;

    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            return await db.collection('parcel_open_rights').bulkWrite(operations, { ordered: false });
        } catch (error) {
            lastError = error;

            if (attempt < 3 && isRetryableMongoWriteError(error)) {
                console.warn(`Mongo write retry ${attempt}/3 after ${error.code ?? error.name}: ${error.message}`);
                await reconnectMongo();
                await sleep(750 * attempt);
                continue;
            }

            throw error;
        }
    }

    throw lastError;
}

async function mongoDb() {
    client = new MongoClient(uri, {
        maxPoolSize: 2,
        serverSelectionTimeoutMS: 10000,
        connectTimeoutMS: 10000,
        socketTimeoutMS: 60000,
    });
    await client.connect();

    return client.db(databaseName);
}

async function reconnectMongo() {
    await client?.close().catch(() => {});
    db = await mongoDb();
}

function isRetryableMongoWriteError(error) {
    const message = String(error?.message ?? '');

    return error?.code === 'EPIPE'
        || error?.code === 32
        || message.includes('EPIPE')
        || message.includes('connection')
        || message.includes('socket')
        || message.includes('network');
}

async function discoverPackages() {
    const resourceUrls = (process.env.OPEN_LEASE_RESOURCE_URLS ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);

    if (resourceUrls.length > 0) {
        return [{
            id: 'manual-open-lease-resources',
            name: 'manual-open-lease-resources',
            title: 'Відкриті дані про оренду землі',
            organization: { title: 'Відкриті дані' },
            resources: resourceUrls.map((url, index) => ({
                id: `manual-${index + 1}`,
                name: url,
                url,
                format: resourceFormatFromUrl(url),
            })),
        }];
    }

    const packageIds = (process.env.DATA_GOV_PACKAGE_IDS ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);

    if (packageIds.length > 0) {
        const packages = [];

        for (const packageId of packageIds) {
            try {
                packages.push(await packageShow(packageId));
            } catch (error) {
                console.warn(`Skipped dataset ${packageId}: ${error.message}`);
            }
        }

        return packages;
    }

    const datasets = new Map();

    for (const query of defaultQueries) {
        try {
            const response = await fetchJson(`${dataGovApi}/package_search?q=${encodeURIComponent(query)}&rows=${dataGovSearchRows}`);

            for (const item of response.result?.results ?? []) {
                if (!datasets.has(item.id)) {
                    datasets.set(item.id, item);
                }
            }
        } catch (error) {
            console.warn(`Skipped package search "${query}": ${error.message}`);
        }
    }

    return Array.from(datasets.values());
}

async function packageShow(id) {
    const response = await fetchJson(`${dataGovApi}/package_show?id=${encodeURIComponent(id)}`);

    return response.result;
}

function isSupportedResource(resource) {
    const format = String(resource.format ?? '').toLowerCase();
    const url = String(resource.url ?? '').toLowerCase();

    return ['csv', 'json', 'geojson', 'xls', 'xlsx', '.xlsx', 'zip'].includes(format)
        || url.endsWith('.csv')
        || url.endsWith('.json')
        || url.endsWith('.geojson')
        || url.endsWith('.xls')
        || url.endsWith('.xlsx')
        || url.endsWith('.zip');
}

function resourceFormatFromUrl(url) {
    const normalizedUrl = String(url).toLowerCase();

    if (normalizedUrl.endsWith('.json') || normalizedUrl.endsWith('.geojson')) {
        return 'json';
    }

    if (normalizedUrl.endsWith('.xls') || normalizedUrl.endsWith('.xlsx')) {
        return 'xlsx';
    }

    if (normalizedUrl.endsWith('.zip')) {
        return 'zip';
    }

    return 'csv';
}

async function readResourceRows(resource) {
    try {
        const response = await fetchWithRetry(resource.url, {
            headers: { accept: 'text/csv,application/json,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,*/*' },
            timeoutMs: requestTimeoutMs,
        }, requestAttempts);

        if (!response.ok) {
            return [];
        }

        if (isSpreadsheetResource(resource)) {
            return rowsFromSpreadsheet(Buffer.from(await response.arrayBuffer()));
        }

        if (isZipResource(resource)) {
            return rowsFromZip(Buffer.from(await response.arrayBuffer()));
        }

        const text = await response.text();
        const trimmed = text.trim();

        if (!trimmed) {
            return [];
        }

        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            return rowsFromJson(JSON.parse(trimmed));
        }

        return rowsFromCsv(trimmed);
    } catch (error) {
        console.warn(`Skipped resource ${resource.url}: ${error.message}`);
        return [];
    }
}

function isSpreadsheetResource(resource) {
    const format = String(resource.format ?? '').toLowerCase();
    const url = String(resource.url ?? '').toLowerCase();

    return ['xls', 'xlsx', '.xlsx'].includes(format)
        || url.endsWith('.xls')
        || url.endsWith('.xlsx');
}

function isZipResource(resource) {
    const format = String(resource.format ?? '').toLowerCase();
    const url = String(resource.url ?? '').toLowerCase();

    return format === 'zip' || url.endsWith('.zip');
}

function rowsFromZip(buffer) {
    const zip = new AdmZip(buffer);
    const rows = [];

    for (const entry of zip.getEntries()) {
        if (entry.isDirectory) {
            continue;
        }

        const name = entry.entryName.toLowerCase();
        const entryBuffer = entry.getData();

        if (name.endsWith('.xls') || name.endsWith('.xlsx')) {
            rows.push(...rowsFromSpreadsheet(entryBuffer));
            continue;
        }

        if (name.endsWith('.json') || name.endsWith('.geojson')) {
            rows.push(...rowsFromJson(JSON.parse(entryBuffer.toString('utf8'))));
            continue;
        }

        if (name.endsWith('.csv')) {
            rows.push(...rowsFromCsv(entryBuffer.toString('utf8').trim()));
        }
    }

    return rows;
}

function rowsFromSpreadsheet(buffer) {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
    const rows = [];

    for (const sheetName of workbook.SheetNames) {
        const sheetRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
            header: 1,
            defval: '',
            raw: false,
        });
        const headerIndex = sheetRows.findIndex(isSpreadsheetHeaderRow);

        if (headerIndex === -1) {
            continue;
        }

        const headers = sheetRows[headerIndex].map((header, index) => {
            const normalized = normalizeHeader(header);

            return normalized || `column_${index + 1}`;
        });

        for (const row of sheetRows.slice(headerIndex + 1)) {
            if (!Array.isArray(row) || !row.some((value) => String(value ?? '').trim() !== '')) {
                continue;
            }

            rows.push(Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])));
        }
    }

    return rows;
}

function isSpreadsheetHeaderRow(row) {
    if (!Array.isArray(row)) {
        return false;
    }

    const text = row.map((value) => normalizeHeader(value)).join(' ');

    return text.includes('кадастровий номер') || text.includes('cadastral number');
}

function rowsFromJson(value) {
    if (Array.isArray(value)) {
        return value.filter((item) => item && typeof item === 'object');
    }

    if (Array.isArray(value.features)) {
        return value.features
            .map((feature) => feature.properties)
            .filter((item) => item && typeof item === 'object');
    }

    if (Array.isArray(value.data)) {
        return value.data.filter((item) => item && typeof item === 'object');
    }

    if (value && typeof value === 'object') {
        return Object.values(value).filter((item) => item && typeof item === 'object');
    }

    return [];
}

function rowsFromCsv(text) {
    const delimiter = guessDelimiter(text);
    const lines = parseDelimited(text, delimiter);
    const [headers, ...rows] = lines;

    if (!headers) {
        return [];
    }

    return rows.map((row) => Object.fromEntries(headers.map((header, index) => [
        normalizeHeader(header),
        row[index] ?? '',
    ])));
}

function parseDelimited(text, delimiter) {
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;

    for (let index = 0; index < text.length; index++) {
        const char = text[index];
        const next = text[index + 1];

        if (char === '"' && quoted && next === '"') {
            field += '"';
            index++;
            continue;
        }

        if (char === '"') {
            quoted = !quoted;
            continue;
        }

        if (char === delimiter && !quoted) {
            row.push(field.trim());
            field = '';
            continue;
        }

        if ((char === '\n' || char === '\r') && !quoted) {
            if (char === '\r' && next === '\n') {
                index++;
            }
            row.push(field.trim());
            rows.push(row);
            row = [];
            field = '';
            continue;
        }

        field += char;
    }

    row.push(field.trim());
    rows.push(row);

    return rows.filter((item) => item.some((fieldValue) => fieldValue !== ''));
}

function guessDelimiter(text) {
    const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
    const semicolons = (firstLine.match(/;/g) ?? []).length;
    const commas = (firstLine.match(/,/g) ?? []).length;

    return semicolons > commas ? ';' : ',';
}

function openRightsRecordsFromRow(dataset, resource, row, index) {
    const rowText = JSON.stringify(row);
    const cadastralNumbers = Array.from(new Set(rowText.match(cadastralNumberPattern) ?? []));

    return cadastralNumbers.map((cadastralNumber) => ({
        cadastral_number: cadastralNumber,
        cadastral_number_normalized: cadastralNumber.replace(/\s+/g, ''),
        right_type: firstValue(row, ['right_type', 'тип права', 'вид права', 'тип договору']) ?? 'Оренда землі',
        tenant: firstValue(row, [
            'tenant',
            'lessee',
            'leaseholder',
            'найменування орендаря',
            'орендар земельної ділянки',
            'найменування юридичної особи',
            'найменування п.і.б. орендаря',
            'найменування (п.і.б.) орендаря',
            'орендар',
        ]),
        landlord: firstValue(row, ['landlord', 'lessor', 'орендодавець', 'власник', 'балансоутримувач']),
        landlord_code: firstValue(row, ['landlord_code', 'lessor_code', 'код орендодавця', 'єдрпоу орендодавця', 'код власника']),
        contract_number: firstValue(row, ['contract_number', 'номер договору', 'номер договору оренди']),
        contract_date: firstValue(row, ['contract_date', 'date of conclusion of the land lease agreement', 'дата договору', 'дата укладення', 'дата укладання', 'дата укладання договору']),
        registered_at: firstValue(row, ['registered_at', 'дата реєстрації', 'дата державної реєстрації', 'дата укладення', 'дата договору']),
        valid_until: firstValue(row, ['valid_until', 'строк дії', 'діє до', 'дата закінчення']),
        lease_area: firstValue(row, ['lease_area', 'land plot area, ha (with four decimal places)', 'площа', 'площа земельної ділянки']),
        land_use: firstValue(row, ['land_use', 'purpose of land plot**', 'purpose of land plot', 'цільове призначення', 'призначення']),
        address: firstValue(row, ['address', 'location of the land plot (address)', 'адреса', 'місце розташування', 'місцезнаходження земельної ділянки']),
        source_name: 'Відкриті дані',
        dataset_title: dataset.title ?? dataset.name,
        dataset_name: dataset.name,
        publisher: dataset.organization?.title ?? dataset.author ?? null,
        dataset_url: `https://data.gov.ua/dataset/${dataset.name}`,
        resource_url: resource.url,
        source_url: resource.url,
        source_row_id: `${resource.id ?? resource.url}:${index}:${cadastralNumber}`,
        raw: row,
        imported_at: new Date(),
    }));
}

function firstValue(row, keys) {
    const normalizedEntries = Object.entries(row).map(([key, value]) => [normalizeHeader(key), value]);

    for (const key of keys.map(normalizeHeader)) {
        const entry = normalizedEntries.find(([candidate]) => candidate.includes(key) || key.includes(candidate));
        const value = entry?.[1];

        if (typeof value === 'string' || typeof value === 'number') {
            const normalized = String(value).trim();

            if (normalized !== '') {
                return normalized;
            }
        }
    }

    return null;
}

function normalizeHeader(value) {
    return String(value ?? '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
}

async function fetchJson(url) {
    const response = await fetchWithRetry(url, {
        headers: { accept: 'application/json' },
        timeoutMs: requestTimeoutMs,
    }, requestAttempts);

    if (!response.ok) {
        throw new Error(`Request failed: ${response.status} ${url}`);
    }

    return response.json();
}

async function fetchWithRetry(url, options = {}, attempts = 3) {
    let lastError;

    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            return await fetch(url, {
                headers: options.headers,
                signal: AbortSignal.timeout(options.timeoutMs ?? requestTimeoutMs),
            });
        } catch (error) {
            lastError = error;

            if (attempt < attempts) {
                const delayMs = 750 * attempt;
                console.warn(`Fetch retry ${attempt}/${attempts} for ${url}: ${error.message}`);
                await sleep(delayMs);
            }
        }
    }

    throw lastError;
}

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
