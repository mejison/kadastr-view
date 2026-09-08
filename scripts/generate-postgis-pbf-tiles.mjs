import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import pg from 'pg';

const { Pool } = pg;
const args = new Map(process.argv.slice(2).filter((item) => item.startsWith('--')).map((item) => {
    const [key, value = true] = item.slice(2).split('=', 2);
    return [key, value];
}));
const output = resolve(String(args.get('output') ?? 'storage/postgis-pbf/kadastr'));
const limit = Number(args.get('limit') ?? 0);
const concurrency = Number(args.get('concurrency') ?? 4);
const overwrite = args.has('overwrite');
const requestedTile = args.get('tile') ? String(args.get('tile')).split('/').map(Number) : null;
const zooms = String(args.get('zooms') ?? '13').split(',').map((value) => Number(value.trim())).filter((value, index, values) => Number.isInteger(value) && value >= 0 && value <= 13 && values.indexOf(value) === index).sort((left, right) => left - right);

if (!process.env.POSTGRES_URL && !process.env.PGHOST) throw new Error('Set POSTGRES_URL or PGHOST/PGUSER/PGPASSWORD.');
if (!Number.isInteger(limit) || limit < 0 || !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8 || zooms.length === 0 || (requestedTile && (requestedTile.length !== 3 || requestedTile.some((value) => !Number.isInteger(value))))) throw new Error('Invalid --limit, --concurrency, --zooms=10,11,12,13, or --tile=z/x/y.');

const pool = new Pool({ connectionString: process.env.POSTGRES_URL, host: process.env.PGHOST, port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined, user: process.env.PGUSER, password: process.env.PGPASSWORD, database: process.env.PGDATABASE ?? 'kadastrview_geo', max: concurrency });
const { rows: sourceTiles } = await pool.query('SELECT x, y FROM pbf_tile_imports WHERE z = 13 ORDER BY x, y');
const allTiles = deriveCoverageTiles(sourceTiles, zooms);
const tiles = (requestedTile ? allTiles.filter((tile) => tile.z === requestedTile[0] && tile.x === requestedTile[1] && tile.y === requestedTile[2]) : allTiles).slice(0, limit || undefined);
const report = { started_at: new Date().toISOString(), output, zooms, candidates: tiles.length, generated: 0, skipped: 0, empty: 0, failed: 0 };
let cursor = 0;

await Promise.all(Array.from({ length: Math.min(concurrency, tiles.length) }, async () => {
    while (cursor < tiles.length) {
        const tile = tiles[cursor++];
        try {
            const result = await generate(tile);
            report[result] += 1;
            const done = report.generated + report.skipped + report.empty + report.failed;
            if (done % 100 === 0 || done === tiles.length) console.log(JSON.stringify({ progress: `${done}/${tiles.length}`, generated: report.generated, skipped: report.skipped, empty: report.empty, failed: report.failed }));
        } catch (error) {
            report.failed += 1;
            console.error(`Failed 13/${tile.x}/${tile.y}: ${error.message}`);
        }
    }
}));

await pool.end();
report.finished_at = new Date().toISOString();
console.log(JSON.stringify(report, null, 2));
if (report.failed) process.exitCode = 1;

async function generate({ z, x, y }) {
    const path = resolve(output, String(z), String(x), `${y}.pbf`);
    if (!overwrite && await exists(path)) return 'skipped';
    const { rows } = await pool.query(`WITH bounds AS (SELECT ST_TileEnvelope($1, $2, $3) AS mercator), source AS (
        SELECT p.cadnum, p.properties->>'ownership' AS ownership, p.properties->>'purpose' AS purpose,
            p.properties->>'purpose_code' AS purpose_code, p.properties->>'category' AS category,
            p.reported_area_hectares AS area,
            ST_AsMVTGeom(ST_Transform(p.geometry, 3857), bounds.mercator, 4096, 64, true) AS geom
        FROM parcel_geometries p CROSS JOIN bounds
        WHERE p.geometry && ST_Transform(bounds.mercator, 4326)
    ) SELECT ST_AsMVT(source, 'polygons', 4096, 'geom') AS tile FROM source`, [z, x, y]);
    const buffer = rows[0]?.tile ? Buffer.from(rows[0].tile) : Buffer.alloc(0);
    if (!buffer.length) return 'empty';
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, buffer);
    return 'generated';
}

async function exists(path) { try { await stat(path); return true; } catch { return false; } }

function deriveCoverageTiles(sourceTiles, requestedZooms) {
    const tiles = new Map();

    for (const zoom of requestedZooms) {
        const divisor = 2 ** (13 - zoom);
        for (const source of sourceTiles) {
            const x = Math.floor(source.x / divisor);
            const y = Math.floor(source.y / divisor);
            tiles.set(`${zoom}/${x}/${y}`, { z: zoom, x, y });
        }
    }

    return [...tiles.values()].sort((left, right) => left.z - right.z || left.x - right.x || left.y - right.y);
}
