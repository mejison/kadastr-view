# KadastrView

Interactive cadastral map MVP for Ukraine, built as a static Vue app with Netlify Functions and MongoDB Atlas.

## Stack

- Vue 3 + TypeScript + Vite
- MapLibre GL JS
- Netlify static hosting
- Netlify Functions for `/api/v1/*`
- MongoDB Atlas for parcel metadata, imported reference geometries, and lookup cache

## Environment

Create `.env` locally and set the same variables in Netlify:

```dotenv
MONGODB_URI=
MONGODB_DATABASE=kadastr_view
VITE_API_BASE_URL=
```

`VITE_API_BASE_URL` can stay empty for same-origin Netlify routes.

## Local Development

```bash
npm install
npm run mongo:setup
npm run dev
```

Open:

```text
http://localhost:8888
```

Do not open Vite directly on port `5173`: it does not serve the Netlify
Functions used by `/api/v1/*`. The `npm run dev` command starts the Netlify
gateway on port `8888` and Vite behind it.

## Build

```bash
npm run typecheck
npm run build
```

Netlify publishes the generated `dist` directory.

## SEO

The canonical domain is:

```text
https://kadastrview.online/
```

When the production domain changes, update it in:

- `index.html`
- `public/robots.txt`
- `public/sitemap.xml`
- `public/og-image.svg`

## Local administrative-location enrichment

`data:enrich-locations` enriches public parcel records locally with the
current KATOTTG hierarchy (oblast, district, hromada, settlement). It downloads
the free classifier dump once into `.cache/`, uses the KOATUU component already
embedded in the cadastral number, and writes only to the separate
`parcel_locations` collection. It makes no request to a cadastral service per
parcel and does not copy personal fields.

Always inspect the proposed coverage first:

```bash
npm run data:enrich-locations -- --dry-run --refresh
```

Then write in restart-safe batches:

```bash
npm run data:enrich-locations -- --batch-size=500
npm run data:enrich-locations -- --resume
```

`--resume` skips already saved cadastral numbers. The generated report is stored
at `storage/location-enrichment-report.json` (ignored by Git). Only high- and
medium-confidence matches should later be considered for indexable location
pages; low-confidence oblast-only matches must not create such pages.

### Centroid backfill and spatial validation

The map can obtain a centroid for an individual searched cadastral number. The
following command fetches a deliberately small dry-run sample and spatially
matches it against public community boundaries. It is resumable because already
cached centroids are skipped:

```bash
npm run data:backfill-centroids
```

Writing is deliberately explicit. This external-source workflow must be run
only where its source terms and request limits permit it; it stops on HTTP 403
or 429 and does not use any rate-limit bypasses:

```bash
npm run data:backfill-centroids -- --write --limit=0 --delay-ms=1200
```

## API

The frontend keeps stable API paths:

- `GET /api/v1/parcels.geojson`
- `GET /api/v1/parcels/:cadastralNumber`
- `GET /api/v1/parcels/:cadastralNumber/geometry`
- `GET /api/v1/search/cadastral-lookup?number=...`
- `GET /api/v1/tiles/kadastr/:z/:x/:y.pbf`

The cadastral tile endpoint is proxied through Netlify Functions to avoid browser CORS issues during local development and deployment.
