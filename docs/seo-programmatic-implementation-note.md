# SEO programmatic rollout — implementation note

Updated: 2026-09-06

## Implemented safely

- A central indexability module (`netlify/functions/seo-indexability.mjs`) now owns the cadastral-number format, canonical parcel path, oblast threshold and parcel data-quality gate.
- Server-rendered oblast pages use that rule. They remain reachable with HTTP 200 when data is insufficient, but respond with `noindex,follow` and are excluded from the regional hub and sitemap.
- `/sitemap-pages.xml` is now a Netlify Function rather than a static file. It uses the same MongoDB-derived eligibility check as the page rendering. The sitemap includes curated content pages and approved oblasts only.
- `/sitemap-parcels.xml` is a dynamic sitemap of deduplicated public parcel records that pass the same gate as the SSR page. It currently contains 13,546 URLs, below the 50,000-URL sitemap limit.
- Parcel pages reject malformed or incomplete records rather than exposing thin pages. Public pages use only cadastral number, address, positive area in the public record, land-use code, right type and source. Tenant, landlord and contract fields from `parcel_open_rights` are never published.

## Data audit and rollout boundary

The active `parcels` collection contains 10,870 geometry records, but none has a normalized Ukrainian cadastral number in the format `##########:##:###:####`. Valid public records exist in `parcel_open_rights`; the quality gate retains only records with a valid number, address, positive public area and land-use code. This dataset does not provide a stable oblast/district/hromada/settlement hierarchy and also contains personal fields such as landlord and tenant, which are excluded from public output.

Consequently, location hierarchy routes are deliberately **not** generated from the current database. Parcel programmatic pages are generated only from the qualified non-personal subset; the interactive map remains available after the client application loads.

## Thresholds

- Oblast: at least 25 active records with a syntactically valid cadastral number.
- Parcel: valid cadastral number, positive public area, non-empty address and land-use code.

## Required data work before the next phase

1. Import a verified parcel source with valid cadastral number, full parcel area, geometry/centroid, normalized purpose/category and source timestamp.
2. Populate stable `region_id`, `district_id`, `community_id` and `settlement_id` values from an authoritative administrative classifier.
3. Keep public parcel facts separate from lease/right-holder data; do not expose landlord or tenant fields.
4. Add quality checks for valid identifier, non-empty geometry, normalized area, allowed location identifiers and a current source timestamp.
5. After a representative import, re-run the eligibility tests and inspect a small sample of each route level before enabling location routes or any parcel sitemap.

## Verification performed locally

- `npm test` — 23 tests passed.
- `npm run typecheck` — passed.
- `npm run build` — passed.
- `npx netlify build` — passed.

Before release, validate the deployed responses for `/sitemap.xml`, `/sitemap-pages.xml`, one low-data oblast, one eligible oblast (when data exists), and `/sitemap-parcels.xml`.
