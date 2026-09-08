import { createHash } from 'node:crypto';
import { readdir, readFile, statfs } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';
import Pbf from 'pbf';
import { VectorTile } from '@mapbox/vector-tile';
import pg from 'pg';

const { Client } = pg;
const args = new Map(process.argv.slice(2).filter((value) => value.startsWith('--')).map((value) => {
    const [key, raw = true] = value.slice(2).split('=', 2);
    return [key, raw];
}));
const tilesDir = resolve(String(args.get('tiles-dir') ?? 'tiles/kadastr'));
const limit = numberArg('limit', 0);
const dryRun = args.has('dry-run');
const force = args.has('force');
const batchSize = numberArg('batch-size', 500);
const compactEvery = numberArg('compact-every', 100);
const minFreeGb = numberArg('min-free-gb', 12);

if (force && compactEvery > 0) {
    throw new Error('--force cannot be used with --compact-every: compacted fragments cannot be subtracted from an existing canonical polygon.');
}

if (!process.env.POSTGRES_URL && !process.env.PGHOST) {
    throw new Error('Set POSTGRES_URL or PGHOST/PGUSER/PGPASSWORD before importing. Credentials are never stored by this script.');
}

const client = new Client({
    connectionString: process.env.POSTGRES_URL,
    host: process.env.PGHOST,
    port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE ?? 'kadastrview_geo',
});

const files = (await pbfFiles(tilesDir)).slice(0, limit || undefined);
const report = {
    started_at: new Date().toISOString(),
    tiles_dir: tilesDir,
    candidates: files.length,
    dry_run: dryRun,
    imported_tiles: 0,
    skipped_tiles: 0,
    fragments: 0,
    skipped_features: 0,
    compacted_batches: 0,
    compacted_parcels: 0,
    failures: [],
};
const pendingTiles = [];

if (!dryRun) {
    await client.connect();
    await ensureSchema(client);
    await ensureDiskHeadroom();
    // Resume safely after an interrupted run: a committed tile can leave a
    // small un-compacted batch behind, but it must not be skipped forever.
    if (compactEvery > 0) await compactResidualFragments();
}

for (const [index, file] of files.entries()) {
    try {
        const result = await importTile(file);
        report[result.skipped ? 'skipped_tiles' : 'imported_tiles'] += 1;
        report.fragments += result.fragments;
        report.skipped_features += result.skippedFeatures;
        if (!dryRun && !result.skipped && compactEvery > 0) {
            pendingTiles.push({ z: file.z, x: file.x, y: file.y });
            if (pendingTiles.length >= compactEvery) await compactPendingTiles();
        }
        if (!dryRun && (index + 1) % compactEvery === 0) await ensureDiskHeadroom();
        if ((index + 1) % 100 === 0 || index + 1 === files.length) {
            console.log(JSON.stringify({ progress: `${index + 1}/${files.length}`, ...result, imported_tiles: report.imported_tiles, fragments: report.fragments }));
        }
    } catch (error) {
        report.failures.push({ file: relative(tilesDir, file.path), error: error.message });
        console.error(`Failed ${file.path}: ${error.stack ?? error.message}`);
    }
}

if (!dryRun && pendingTiles.length) await compactPendingTiles();
// A successful streaming run has no un-compacted fragments left. TRUNCATE
// returns the physical staging-table space immediately; plain DELETE does not.
if (!dryRun && compactEvery > 0) {
    await client.query('TRUNCATE TABLE parcel_tile_fragments');
    await client.query('VACUUM (ANALYZE) parcel_tile_fragments');
}
if (!dryRun) await client.end();
report.finished_at = new Date().toISOString();
console.log(JSON.stringify(report, null, 2));
if (report.failures.length) process.exitCode = 1;

async function importTile(file) {
    const buffer = await readFile(file.path);
    const hash = createHash('sha256').update(buffer).digest('hex');
    const tile = new VectorTile(new Pbf(buffer));
    const fragments = [];
    let skippedFeatures = 0;

    for (const layer of Object.values(tile.layers)) {
        for (let index = 0; index < layer.length; index += 1) {
            const feature = layer.feature(index);
            if (feature.type !== 3) {
                skippedFeatures += 1;
                continue;
            }
            const geojson = feature.toGeoJSON(file.x, file.y, file.z);
            const cadnum = normalizeCadnum(feature.properties?.cadnum);
            if (!cadnum || !geojson.geometry) {
                skippedFeatures += 1;
                continue;
            }
            fragments.push({
                feature_index: fragments.length,
                cadnum,
                properties: feature.properties ?? {},
                geometry: geojson.geometry,
            });
        }
    }

    if (dryRun) return { tile: file.key, fragments: fragments.length, skippedFeatures, skipped: false };

    const existing = await client.query('SELECT sha256 FROM pbf_tile_imports WHERE z = $1 AND x = $2 AND y = $3', [file.z, file.x, file.y]);
    if (!force && existing.rows[0]?.sha256 === hash) {
        return { tile: file.key, fragments: 0, skippedFeatures, skipped: true };
    }

    await client.query('BEGIN');
    try {
        await client.query('DELETE FROM parcel_tile_fragments WHERE z = $1 AND x = $2 AND y = $3', [file.z, file.x, file.y]);
        await client.query(`INSERT INTO pbf_tile_imports (z, x, y, sha256, file_bytes, feature_count, source_path, imported_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
            ON CONFLICT (z, x, y) DO UPDATE SET sha256 = EXCLUDED.sha256, file_bytes = EXCLUDED.file_bytes,
              feature_count = EXCLUDED.feature_count, source_path = EXCLUDED.source_path, imported_at = EXCLUDED.imported_at`,
        [file.z, file.x, file.y, hash, buffer.length, fragments.length, relative(process.cwd(), file.path)]);

        for (let offset = 0; offset < fragments.length; offset += batchSize) {
            const batch = fragments.slice(offset, offset + batchSize);
            await client.query(`INSERT INTO parcel_tile_fragments (z, x, y, feature_index, cadnum, properties, geometry)
                SELECT $1, $2, $3, value.feature_index, value.cadnum, value.properties,
                    ST_SetSRID(ST_GeomFromGeoJSON(value.geometry::text), 4326)
                FROM jsonb_to_recordset($4::jsonb) AS value(feature_index integer, cadnum text, properties jsonb, geometry jsonb)`,
            [file.z, file.x, file.y, JSON.stringify(batch)]);
        }
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    }
    return { tile: file.key, fragments: fragments.length, skippedFeatures, skipped: false };
}

async function pbfFiles(root) {
    const output = [];
    async function walk(directory) {
        for (const entry of await readdir(directory, { withFileTypes: true })) {
            const path = resolve(directory, entry.name);
            if (entry.isDirectory()) await walk(path);
            else if (entry.isFile() && entry.name.endsWith('.pbf')) {
                const parts = relative(root, path).split(sep);
                if (parts.length !== 3) continue;
                const [z, x, filename] = parts;
                const y = filename.slice(0, -4);
                if (![z, x, y].every((value) => /^\d+$/.test(value))) continue;
                output.push({ path, z: Number(z), x: Number(x), y: Number(y), key: `${z}/${x}/${y}` });
            }
        }
    }
    await walk(root);
    return output.sort((a, b) => a.z - b.z || a.x - b.x || a.y - b.y);
}

function normalizeCadnum(value) {
    const normalized = String(value ?? '').replace(/\s/g, '');
    return /^\d{10}:\d{2}:\d{3}:\d{4}$/.test(normalized) ? normalized : null;
}

function numberArg(name, fallback) {
    const value = Number(args.get(name) ?? fallback);
    if (!Number.isInteger(value) || value < 0) throw new Error(`--${name} must be a non-negative integer.`);
    return value;
}

async function compactPendingTiles() {
    const tiles = pendingTiles.splice(0, pendingTiles.length);
    await client.query('BEGIN');
    try {
        const result = await client.query(`WITH requested_tiles AS (
            SELECT value.z, value.x, value.y
            FROM jsonb_to_recordset($1::jsonb) AS value(z integer, x integer, y integer)
        ), grouped AS (
            SELECT fragment.cadnum,
                (array_agg(fragment.properties))[1] AS properties,
                count(*)::integer AS fragment_count,
                ST_CollectionExtract(ST_MakeValid(ST_UnaryUnion(ST_Collect(fragment.geometry))), 3) AS joined_geometry
            FROM parcel_tile_fragments fragment
            JOIN requested_tiles tile USING (z, x, y)
            GROUP BY fragment.cadnum
        ), prepared AS (
            SELECT cadnum, properties, fragment_count,
                ST_Multi(joined_geometry)::geometry(MultiPolygon, 4326) AS geometry
            FROM grouped
            WHERE NOT ST_IsEmpty(joined_geometry)
        )
        INSERT INTO parcel_geometries AS target (cadnum, properties, reported_area_hectares, geometry, centroid, fragment_count, assembled_at)
        SELECT cadnum,
            properties,
            CASE WHEN COALESCE(properties->>'area', '') ~ '^[0-9]+(\\.[0-9]+)?$' THEN (properties->>'area')::numeric ELSE NULL END,
            geometry,
            ST_PointOnSurface(geometry),
            fragment_count,
            NOW()
        FROM prepared
        ON CONFLICT (cadnum) DO UPDATE SET
            properties = EXCLUDED.properties,
            reported_area_hectares = EXCLUDED.reported_area_hectares,
            geometry = ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_UnaryUnion(ST_Collect(target.geometry, EXCLUDED.geometry))), 3)),
            centroid = ST_PointOnSurface(ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_UnaryUnion(ST_Collect(target.geometry, EXCLUDED.geometry))), 3))),
            fragment_count = target.fragment_count + EXCLUDED.fragment_count,
            assembled_at = EXCLUDED.assembled_at
        RETURNING cadnum`, [JSON.stringify(tiles)]);
        await client.query(`WITH requested_tiles AS (
            SELECT value.z, value.x, value.y
            FROM jsonb_to_recordset($1::jsonb) AS value(z integer, x integer, y integer)
        )
        DELETE FROM parcel_tile_fragments fragment
        USING requested_tiles tile
        WHERE fragment.z = tile.z AND fragment.x = tile.x AND fragment.y = tile.y`, [JSON.stringify(tiles)]);
        await client.query('COMMIT');
        report.compacted_batches += 1;
        report.compacted_parcels += result.rowCount;
        console.log(JSON.stringify({ compacted_tiles: tiles.length, canonical_parcels: result.rowCount, compacted_batches: report.compacted_batches }));
    } catch (error) {
        await client.query('ROLLBACK');
        pendingTiles.unshift(...tiles);
        throw error;
    }
}

async function compactResidualFragments() {
    const { rows } = await client.query('SELECT DISTINCT z, x, y FROM parcel_tile_fragments ORDER BY z, x, y');
    for (const tile of rows) {
        pendingTiles.push(tile);
        if (pendingTiles.length >= compactEvery) await compactPendingTiles();
    }
    if (pendingTiles.length) await compactPendingTiles();
}

async function ensureDiskHeadroom() {
    const filesystem = await statfs(process.cwd());
    const freeBytes = Number(filesystem.bavail) * Number(filesystem.bsize);
    const freeGb = freeBytes / 1024 ** 3;
    if (freeGb < minFreeGb) {
        throw new Error(`Stopping safely: only ${freeGb.toFixed(1)} GiB free; --min-free-gb=${minFreeGb}. Completed batches remain resumable.`);
    }
}

async function ensureSchema(database) {
    await database.query('CREATE EXTENSION IF NOT EXISTS postgis');
    await database.query(`CREATE TABLE IF NOT EXISTS pbf_tile_imports (
        z integer NOT NULL, x integer NOT NULL, y integer NOT NULL,
        sha256 text NOT NULL, file_bytes integer NOT NULL, feature_count integer NOT NULL,
        source_path text NOT NULL, imported_at timestamptz NOT NULL,
        PRIMARY KEY (z, x, y)
    )`);
    await database.query(`CREATE TABLE IF NOT EXISTS parcel_tile_fragments (
        z integer NOT NULL, x integer NOT NULL, y integer NOT NULL, feature_index integer NOT NULL,
        cadnum text NOT NULL, properties jsonb NOT NULL, geometry geometry(Geometry, 4326) NOT NULL,
        imported_at timestamptz NOT NULL DEFAULT NOW(),
        PRIMARY KEY (z, x, y, feature_index),
        FOREIGN KEY (z, x, y) REFERENCES pbf_tile_imports (z, x, y) ON DELETE CASCADE
    )`);
    await database.query('CREATE INDEX IF NOT EXISTS parcel_tile_fragments_cadnum_idx ON parcel_tile_fragments (cadnum)');
    await database.query('CREATE INDEX IF NOT EXISTS parcel_tile_fragments_geometry_idx ON parcel_tile_fragments USING GIST (geometry)');
    await database.query(`CREATE TABLE IF NOT EXISTS parcel_geometries (
        cadnum text PRIMARY KEY,
        properties jsonb NOT NULL,
        reported_area_hectares numeric,
        geometry geometry(MultiPolygon, 4326) NOT NULL,
        centroid geometry(Point, 4326) NOT NULL,
        fragment_count integer NOT NULL,
        assembled_at timestamptz NOT NULL
    )`);
    await database.query('CREATE INDEX IF NOT EXISTS parcel_geometries_geometry_idx ON parcel_geometries USING GIST (geometry)');
    await database.query('CREATE INDEX IF NOT EXISTS parcel_geometries_centroid_idx ON parcel_geometries USING GIST (centroid)');
}
