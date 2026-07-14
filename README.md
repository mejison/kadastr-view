# Kadastr View

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
npx netlify dev
```

Open:

```text
http://localhost:8888
```

## Build

```bash
npm run typecheck
npm run build
```

Netlify publishes the generated `dist` directory.

## SEO

The temporary canonical domain is:

```text
https://kadastrview.netlify.app/
```

When the production domain changes, update it in:

- `index.html`
- `public/robots.txt`
- `public/sitemap.xml`
- `public/og-image.svg`

## API

The frontend keeps stable API paths:

- `GET /api/v1/parcels.geojson`
- `GET /api/v1/parcels/:cadastralNumber`
- `GET /api/v1/parcels/:cadastralNumber/geometry`
- `GET /api/v1/search/cadastral-lookup?number=...`
- `GET /api/v1/tiles/kadastr/:z/:x/:y.pbf`

The cadastral tile endpoint is proxied through Netlify Functions to avoid browser CORS issues during local development and deployment.
