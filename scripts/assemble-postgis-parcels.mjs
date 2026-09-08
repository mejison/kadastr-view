import pg from 'pg';

const { Client } = pg;
const args = new Map(process.argv.slice(2).filter((value) => value.startsWith('--')).map((value) => {
    const [key, raw = true] = value.slice(2).split('=', 2);
    return [key, raw];
}));
const write = args.has('write');
const cleanupFragments = args.has('cleanup-fragments');
const cadnum = args.get('cadnum') ? normalizeCadnum(args.get('cadnum')) : null;

if (args.has('cadnum') && !cadnum) throw new Error('--cadnum must be a valid cadastral number.');
if (cleanupFragments && !write) throw new Error('--cleanup-fragments requires --write.');
if (!process.env.POSTGRES_URL && !process.env.PGHOST) {
    throw new Error('Set POSTGRES_URL or PGHOST/PGUSER/PGPASSWORD. Credentials are never stored by this script.');
}

const client = new Client({
    connectionString: process.env.POSTGRES_URL,
    host: process.env.PGHOST,
    port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE ?? 'kadastrview_geo',
});

await client.connect();
await ensureSchema(client);
const filter = cadnum ? 'WHERE cadnum = $1' : '';
const parameters = cadnum ? [cadnum] : [];
const source = await client.query(`SELECT count(DISTINCT cadnum)::integer AS parcels, count(*)::integer AS fragments FROM parcel_tile_fragments ${filter}`, parameters);

if (!write) {
    console.log(JSON.stringify({ write: false, cadnum, source: source.rows[0], hint: 'Re-run with --write to assemble tile fragments into canonical parcel geometries.' }, null, 2));
    await client.end();
    process.exit(0);
}

// PBF features that cross a tile boundary are stored as fragments. Grouping by
// cadnum and applying ST_UnaryUnion joins those fragments into one geometry.
const result = await client.query(`WITH grouped AS (
    SELECT cadnum,
        (array_agg(properties))[1] AS properties,
        count(*)::integer AS fragment_count,
        ST_CollectionExtract(ST_MakeValid(ST_UnaryUnion(ST_Collect(geometry))), 3) AS joined_geometry
    FROM parcel_tile_fragments
    ${filter}
    GROUP BY cadnum
), prepared AS (
    SELECT cadnum, properties, fragment_count, ST_Multi(joined_geometry)::geometry(MultiPolygon, 4326) AS geometry
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
    geometry = EXCLUDED.geometry,
    centroid = EXCLUDED.centroid,
    fragment_count = EXCLUDED.fragment_count,
    assembled_at = EXCLUDED.assembled_at
RETURNING cadnum, fragment_count, ST_IsValid(geometry) AS valid, ST_Area(geometry::geography) / 10000 AS calculated_area_hectares`, parameters);

let cleanedFragments = 0;
if (cleanupFragments) {
    const cleanup = await client.query(`DELETE FROM parcel_tile_fragments ${filter}`, parameters);
    cleanedFragments = cleanup.rowCount;
}

console.log(JSON.stringify({ write: true, cadnum, source: source.rows[0], assembled: result.rowCount, cleaned_fragments: cleanedFragments, sample: result.rows.slice(0, 5) }, null, 2));
await client.end();

function normalizeCadnum(value) {
    const normalized = String(value ?? '').replace(/\s/g, '');
    return /^\d{10}:\d{2}:\d{3}:\d{4}$/.test(normalized) ? normalized : null;
}

async function ensureSchema(database) {
    await database.query('CREATE EXTENSION IF NOT EXISTS postgis');
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
