import { createReadStream } from 'node:fs';
import { readdir, stat, writeFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const args = new Map(process.argv.slice(2).filter((item) => item.startsWith('--')).map((item) => {
    const [key, value = true] = item.slice(2).split('=', 2);
    return [key, value];
}));

const root = resolve(String(args.get('root') ?? '/Users/oleksandrkovalcuk/KadastrView-tiles/own-z13'));
const bucket = String(args.get('bucket') ?? process.env.R2_BUCKET ?? 'dilyanka');
const prefix = normalizePrefix(String(args.get('prefix') ?? 'kadastr/v1'));
const concurrency = Number(args.get('concurrency') ?? 8);
const dryRun = args.has('dry-run');
const force = args.has('force');
const reportPath = resolve(String(args.get('report') ?? 'storage/r2-pbf-upload-report.json'));

if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 32) {
    throw new Error('--concurrency must be an integer from 1 to 32.');
}

if (!dryRun && (!process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY || !process.env.R2_ACCOUNT_ID)) {
    throw new Error('Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY. Do not store them in source control.');
}

const files = await pbfFiles(root);
if (files.length === 0) throw new Error(`No .pbf files found under ${root}`);

const client = dryRun ? null : new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
});

const report = {
    started_at: new Date().toISOString(),
    bucket,
    prefix,
    root,
    files: files.length,
    bytes: files.reduce((total, file) => total + file.bytes, 0),
    dry_run: dryRun,
    force,
    uploaded: 0,
    skipped: 0,
    failed: 0,
    failures: [],
};
let cursor = 0;

await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, async () => {
    while (cursor < files.length) {
        const file = files[cursor++];
        try {
            const result = dryRun ? 'skipped' : await uploadFile(file);
            report[result] += 1;
        } catch (error) {
            report.failed += 1;
            report.failures.push({ key: file.key, message: error instanceof Error ? error.message : String(error) });
        }

        const completed = report.uploaded + report.skipped + report.failed;
        if (completed % 100 === 0 || completed === files.length) {
            console.log(JSON.stringify({ progress: `${completed}/${files.length}`, uploaded: report.uploaded, skipped: report.skipped, failed: report.failed }));
        }
    }
}));

if (!dryRun && report.failed === 0) {
    report.remote = await validateRemoteObjectCount();
}

report.finished_at = new Date().toISOString();
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (report.failed > 0) process.exitCode = 1;

async function uploadFile(file) {
    if (!force && await remoteObjectMatches(file)) return 'skipped';

    await retry(async () => {
        await client.send(new PutObjectCommand({
            Bucket: bucket,
            Key: file.key,
            Body: createReadStream(file.path),
            ContentLength: file.bytes,
            ContentType: 'application/x-protobuf',
            CacheControl: 'public, max-age=31536000, immutable',
            Metadata: {
                bytes: String(file.bytes),
                source: 'kadastrview-postgis',
            },
        }));
    });

    return 'uploaded';
}

async function remoteObjectMatches(file) {
    // Listing the prefix is deliberately avoided for every file. R2 returns a
    // stable object size in HeadObject; if an interrupted upload produced a
    // partial object, the next run replaces it. This makes the command resumable.
    try {
        const object = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: file.key }));
        return Number(object.ContentLength) === file.bytes;
    } catch (error) {
        const status = error?.$metadata?.httpStatusCode;
        if (status === 404 || error?.name === 'NotFound') return false;
        throw error;
    }
}

async function validateRemoteObjectCount() {
    let continuationToken;
    let count = 0;
    let bytes = 0;

    do {
        const page = await client.send(new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: `${prefix}/`,
            ContinuationToken: continuationToken,
        }));
        for (const object of page.Contents ?? []) {
            count += 1;
            bytes += Number(object.Size ?? 0);
        }
        continuationToken = page.NextContinuationToken;
    } while (continuationToken);

    if (count !== files.length || bytes !== report.bytes) {
        throw new Error(`Remote validation failed: expected ${files.length} objects / ${report.bytes} bytes, received ${count} objects / ${bytes} bytes.`);
    }

    return { objects: count, bytes };
}

async function pbfFiles(directory) {
    const result = [];

    async function walk(current) {
        for (const entry of await readdir(current, { withFileTypes: true })) {
            const path = resolve(current, entry.name);
            if (entry.isDirectory()) await walk(path);
            else if (entry.isFile() && entry.name.endsWith('.pbf')) {
                const info = await stat(path);
                const relativePath = relative(root, path).split(sep).join('/');
                if (!/^\d+\/\d+\/\d+\.pbf$/.test(relativePath)) continue;
                result.push({ path, bytes: info.size, key: `${prefix}/${relativePath}` });
            }
        }
    }

    await walk(directory);
    return result.sort((left, right) => left.key.localeCompare(right.key));
}

function normalizePrefix(value) {
    return value.replace(/^\/+|\/+$/g, '');
}

async function retry(operation, attempts = 5) {
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            const status = error?.$metadata?.httpStatusCode;
            if (attempt === attempts || (status && status >= 400 && status < 500 && status !== 429)) throw error;
            await delay(Math.min(1000 * 2 ** (attempt - 1), 8000));
        }
    }
    throw lastError;
}

function delay(milliseconds) {
    return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}
