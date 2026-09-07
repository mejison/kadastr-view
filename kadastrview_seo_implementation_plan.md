# KadastrView — Technical SEO / Programmatic SEO Implementation Plan

**Project:** https://kadastrview.online  
**Primary SEO target:** `кадастрова карта України`  
**Secondary targets:** regional, city/district, cadastral-number and land-parcel long-tail queries  
**Audience of this document:** coding AI agent working directly in the KadastrView repository  
**Priority:** High

---

## 1. Goal

Improve organic visibility of KadastrView by turning the project from a small set of mostly template-like landing pages into a crawlable, indexable, internally linked cadastral information architecture with genuinely useful region/locality/parcel pages.

The implementation must **not** generate large quantities of empty, duplicate, thin or doorway pages merely to increase index count. A URL becomes indexable only when it contains sufficient unique, useful data.

Primary outcome:

- Google can reliably crawl and index important pages.
- Regional pages become distinct and useful rather than near-duplicates.
- The site develops topical depth: Ukraine → oblast → district/locality → parcel.
- Individual cadastral numbers can rank as long-tail landing pages.
- Internal linking distributes authority throughout the site.
- Indexation can scale safely without flooding Google with low-value URLs.

---

# 2. Current state and observed problems

## 2.1 Current public structure

Currently visible important routes include approximately:

```text
/
/oblast
/oblast/{oblast_slug}
```

The home page already contains relevant SEO copy around:

- кадастрова карта України;
- кадастровий номер;
- межі земельної ділянки;
- площа;
- цільове призначення;
- пошук земельної ділянки.

The `/oblast` page exposes normal HTML links to oblast pages. This is good and must be preserved.

## 2.2 Google Search Console issue

Observed from Search Console:

```text
Known pages: ~30
Indexed: 6
Not indexed: 24
  - Redirect pages: 2
  - Discovered – currently not indexed: 22
```

Most of the 22 discovered/not-indexed URLs are `/oblast/...` pages.

This means a major part of the new SEO structure is not yet participating in organic ranking.

## 2.3 Regional pages are currently too similar

Example regional page structure is approximately:

```text
H1: Кадастрова карта Рівненської області

На цій сторінці можна перейти до інтерактивної карти...

Дані в базі KadastrView
Статистика з’явиться, коли для регіону буде достатньо...

Як користуватися картою
1. ...
2. ...
3. ...
```

When the same structure/text is repeated across 20+ oblasts with only the oblast name changed, Google has little reason to index every URL.

**Do not solve this by generating generic AI paragraphs with the oblast name inserted.** The differentiation should primarily come from real structured data and useful navigation.

---

# 3. Competitive patterns to learn from

Do not copy competitor UI or text. Reproduce the useful information architecture principles.

## 3.1 Kadastrova.com

Google indexes individual parcel pages such as:

```text
/nomer/{cadastral_number}
```

Typical parcel page contains:

- cadastral number;
- address/location when available;
- land category;
- purpose;
- ownership type when available;
- use;
- area in hectares / sotkas / m²;
- map location;
- breadcrumbs;
- nearby parcels with crawlable links.

This creates large long-tail coverage and deep internal linking.

## 3.2 OpenDataBot

Uses hierarchical location pages:

```text
Ukraine cadastral page
  -> oblast
      -> district / city / locality
          -> cadastral numbers
```

Oblast pages expose districts and cities. District pages expose localities. Locality pages expose lists of parcel numbers with pagination.

Important lesson: Google is already willing to index hierarchical cadastral/location pages in this niche when they contain useful structured content.

---

# 4. Required target information architecture

Implement the following conceptual hierarchy.

```text
/
├── /oblast
│   ├── /oblast/rivnenska
│   ├── /oblast/lvivska
│   └── ...
│
├── /location/{location_slug_or_code}
│   ├── districts / communities / cities / villages depending on available dataset
│   └── parcel listings
│
└── /parcel/{cadastral_number}
```

The exact URL naming can be adapted to the existing routing/domain model, but URLs must be:

- stable;
- deterministic;
- human-readable where practical;
- canonical;
- server-renderable;
- linked with normal `<a href>` links.

### Recommended parcel URL

Prefer:

```text
/parcel/5624685900:01:001:0123
```

If the framework or server has issues with `:` inside paths, encode safely but maintain one canonical URL format.

Do **not** create several accessible URL variants for the same parcel.

---

# 5. Phase 0 — Repository audit before coding

The coding agent MUST inspect the project before modifying anything.

Determine:

- framework(s) and versions;
- server-side rendering / SPA architecture;
- database schema;
- how cadastral data is currently stored;
- how map/search obtains parcel data;
- whether regions, locations and parcel metadata already exist;
- current routes;
- current SEO/meta generation;
- current sitemap implementation;
- current robots.txt;
- canonical handling;
- deployment environment;
- cache layer;
- database indexes relevant to parcel lookup.

Do not replace existing architecture unnecessarily.

Produce a short implementation note in the PR/commit describing what was found and which existing components are being reused.

---

# 6. Phase 1 — Fix indexability foundation

This phase must be completed **before mass-creating parcel pages**.

## 6.1 Validate HTTP responses

For every indexable route ensure:

```text
HTTP 200
Content-Type: text/html
```

Do not return a soft-404 page with status 200.

For missing entities:

```text
HTTP 404
```

For permanently renamed/moved URLs:

```text
HTTP 301
```

Avoid redirect chains.

## 6.2 Server-render critical SEO content

Important content must be available in the initial HTML response:

- `<title>`;
- meta description;
- canonical;
- H1;
- breadcrumbs;
- region/locality/parcel facts;
- indexable internal links.

Google must not need user interaction or a client-only API request to discover the primary content.

Interactive map functionality may remain client-side.

## 6.3 Canonical

Every indexable page must include one self-referencing canonical, e.g.:

```html
<link rel="canonical" href="https://kadastrview.online/oblast/rivnenska">
```

Parcel page:

```html
<link rel="canonical" href="https://kadastrview.online/parcel/5624685900:01:001:0123">
```

Canonical requirements:

- absolute HTTPS URL;
- one canonical only;
- no tracking/query parameters;
- canonical page itself returns 200;
- sitemap URL must match canonical URL.

## 6.4 robots meta

Indexable pages:

```html
<meta name="robots" content="index,follow">
```

Low-value or incomplete generated pages:

```html
<meta name="robots" content="noindex,follow">
```

Do not rely on robots.txt to hide pages that should be `noindex`; Google needs to crawl the page to see the directive.

## 6.5 robots.txt

Audit existing robots.txt.

Requirements:

- do not block `/oblast/`;
- do not block `/location/` if implemented;
- do not block `/parcel/` for indexable parcel pages;
- block irrelevant internal/API/admin/search-noise routes where appropriate;
- reference sitemap index.

Expected concept:

```text
User-agent: *
Allow: /

Sitemap: https://kadastrview.online/sitemap.xml
```

Add specific `Disallow` only for confirmed low-value technical paths.

## 6.6 XML sitemap architecture

Do not place millions of URLs in one sitemap.

Create sitemap index:

```text
/sitemap.xml
```

which points to logical sitemap files, for example:

```text
/sitemaps/static.xml
/sitemaps/oblasts.xml
/sitemaps/locations-1.xml
/sitemaps/parcels-1.xml
/sitemaps/parcels-2.xml
...
```

Respect standard limits:

- maximum 50,000 URLs per sitemap;
- maximum 50 MB uncompressed per sitemap.

Only include canonical, 200, `index,follow` URLs.

Never include:

- redirect URLs;
- 404 URLs;
- `noindex` URLs;
- empty parcel pages;
- duplicate variants.

Use `<lastmod>` only when there is a real meaningful content/data change. Do not set every URL to the current timestamp on every sitemap generation.

---

# 7. Phase 2 — Upgrade oblast pages

Existing `/oblast/{slug}` pages must be made meaningfully unique.

## 7.1 Required content model

Each oblast page should obtain as much real data as is available:

```text
oblast name
oblast identifier/code
number of known parcels
number of locations represented
number of districts/communities represented
aggregate area if meaningful
most common land categories
most common purposes
major cities / localities
recent dataset update date
```

Missing values should not create empty repetitive sections.

## 7.2 Required page structure

Example:

```text
Breadcrumbs
Україна → Області → Рівненська область

H1
Кадастрова карта Рівненської області

Short useful intro

[Open map / search]

H2: Земельні ділянки Рівненської області
- real statistics from DB

H2: Населені пункти / райони / громади
- crawlable links

H2: Популярні типи земель / призначення
- only if real data exists

H2: Як знайти ділянку в Рівненській області
- concise instructions

H2: Корисна інформація
- relevant internal articles

Data freshness / disclaimer
```

## 7.3 Unique title/meta

Title pattern:

```text
Кадастрова карта {OBLAST_GENITIVE} — земельні ділянки онлайн | KadastrView
```

Keep titles naturally sized. Do not mechanically force identical long templates if they truncate badly.

Meta description should use available real data where useful, e.g. number of parcels/localities. Avoid fake or unverifiable claims.

## 7.4 Empty oblast policy

An oblast page with effectively no region-specific data beyond the region name is weak.

If an oblast has insufficient unique data:

- keep it accessible for users if needed;
- use `noindex,follow` temporarily;
- exclude it from XML sitemap;
- automatically switch to `index,follow` only after a defined quality threshold is satisfied.

### Suggested minimum indexability threshold

Index oblast when ALL are true:

```text
valid oblast entity exists
page returns 200
unique H1/title/canonical exists
at least one meaningful region-specific dataset block exists
AND at least one of:
  >= N known parcels
  >= N localities
  >= N districts/communities
```

Choose sensible N values after inspecting dataset size. Store threshold in configuration rather than hardcoding throughout views.

---

# 8. Phase 3 — Add location hierarchy

This is a major topical-authority layer.

The exact administrative hierarchy depends on data availability. Do not invent geography.

Possible entities:

```text
oblast
rayon
hromada
city
settlement
village
other cadastral territory
```

## 8.1 Location route

Recommended generic route:

```text
/location/{slug-or-code}
```

A code-based route is acceptable where cadastral codes are more reliable than names.

The route should map to one canonical location entity.

## 8.2 Location page content

Required where available:

- location name;
- location type;
- parent oblast;
- parent district/community;
- known parcel count;
- child locations;
- parcel listing;
- pagination;
- map/search link;
- breadcrumbs;
- data freshness.

Example hierarchy:

```text
Україна
→ Львівська область
→ Львівський район
→ м. Львів
→ parcel
```

## 8.3 Pagination

For large parcel lists use crawlable pagination:

```text
/location/foo?page=2
```

Rules:

- each page returns 200 when it has data;
- empty/out-of-range page returns 404 or redirects only if technically justified;
- links are standard anchor links;
- do not use infinite-scroll-only discovery;
- canonical pagination pages to themselves when they contain unique list content;
- avoid indexing huge combinations of filters/sorts.

## 8.4 Faceted navigation

Do **not** allow Google to freely index every combination such as:

```text
?area_from=
?area_to=
?purpose=
?ownership=
?sort=
?mapBounds=
```

Default rule:

- parameterized search/filter URLs: `noindex,follow`;
- do not include them in sitemaps;
- optionally canonical to stable category/location page where semantically appropriate.

Only create indexable filtered landing pages later when search demand and unique content justify them.

---

# 9. Phase 4 — Parcel detail pages

This is the most important programmatic SEO addition.

## 9.1 Route

```text
GET /parcel/{cadastralNumber}
```

Validate the cadastral number format.

Do not create a page from arbitrary user input unless a corresponding parcel record actually exists.

## 9.2 Minimum parcel data model

Reuse existing schema when possible. Ensure the system can expose:

```text
id
cadastral_number
address nullable
oblast_id nullable
location_id nullable
district/community nullable
category nullable
purpose nullable
ownership_type nullable
use_type nullable
area_hectares nullable
area_m2 nullable
geometry/centroid nullable
source/source_date nullable
data_updated_at nullable
```

Do not duplicate the authoritative parcel dataset merely for SEO if it already exists in another storage model. Add indexes/views/materialized aggregates as needed.

Database indexes should at minimum support fast lookup by:

```text
cadastral_number UNIQUE/INDEX
oblast_id
location_id
```

Additional geospatial indexes depend on current DB and geometry usage.

## 9.3 Parcel indexability quality gate

Not every known cadastral number deserves an indexable page.

A parcel page can be indexed only when:

```text
parcel exists
cadastral_number is valid
page returns 200
not marked deleted/invalid
contains meaningful data beyond only the number
```

Suggested quality rule:

At least **2–3 useful attributes** besides cadastral number, for example:

- geometry/location;
- area;
- purpose;
- category;
- address/locality;
- ownership type.

If below threshold:

```text
noindex,follow
exclude from sitemap
```

Do not publish millions of pages containing only:

```text
"Ділянка {number}"
"Дані відсутні"
```

## 9.4 Parcel page structure

```text
Breadcrumbs
Україна → Область → Район/місто → Ділянка {number}

H1
Земельна ділянка {CADASTRAL_NUMBER}

Short description
Кадастрова карта України — інформація про земельну ділянку...

H2 Інформація про земельну ділянку
- cadastral number
- area
- address/location
- category
- purpose
- use
- ownership type where legally/publicly available
- dataset freshness/source

H2 Розташування на карті
- interactive map
- optional static/SSR textual coordinates/location context

H2 Ділянки поруч
- crawlable links to real nearby parcels

H2 Кадастрова карта {region/location}
- internal link back up hierarchy

Disclaimer / data source
```

Do not add fields that are not actually supported by the data.

## 9.5 Parcel title/meta

Recommended title:

```text
{CADASTRAL_NUMBER} — земельна ділянка на кадастровій карті | KadastrView
```

If a location is known and title remains reasonable:

```text
{CADASTRAL_NUMBER} — земельна ділянка, {CITY/OBLAST} | KadastrView
```

Meta description can incorporate area, location and purpose where available.

## 9.6 Nearby parcels

Implement related parcels using real spatial or cadastral proximity.

Priority:

1. geospatial nearest neighbors if geometry exists;
2. same cadastral quarter/block if reliable;
3. same locality as a fallback.

Limit visible related links, e.g. 10–30 relevant parcels. Do not dump hundreds of links on every page.

Links must be server-rendered anchors.

## 9.7 Data source transparency

Every parcel page should show:

- source name/type;
- data freshness date where known;
- clear disclaimer that KadastrView is not the official state registry;
- instruction to use official documents for legally significant actions.

This improves user trust and reduces the chance of presenting stale cadastral data as authoritative.

---

# 10. Internal linking requirements

Internal linking must form an intentional graph.

## 10.1 Home

Home should link to:

- oblast directory;
- important informational guides;
- optionally selected major/popular regions based on real demand.

Do not link thousands of parcel URLs directly from home.

## 10.2 Oblast directory

`/oblast` → every eligible oblast.

## 10.3 Oblast page

Oblast → districts/communities/cities/localities within it.

Optionally show a small set of real parcels/recent/popular locations if useful.

## 10.4 Location page

Location → child locations and parcel pages.

## 10.5 Parcel page

Parcel →

- parent locality;
- parent oblast;
- nearby parcels;
- relevant explanatory content.

## 10.6 Breadcrumbs

Use visible HTML breadcrumbs and `BreadcrumbList` structured data.

Example:

```text
Головна > Рівненська область > Рівне > 5610100000:...
```

---

# 11. Structured data

Use schema.org only when markup accurately represents visible page content.

## 11.1 BreadcrumbList

Add to:

- oblast pages;
- location pages;
- parcel pages;
- guides where appropriate.

## 11.2 WebSite / Organization

On home page use appropriate `WebSite` and organization/site identity markup if not already present.

## 11.3 FAQPage

Do not add FAQ structured data mechanically to every page merely for SEO.

If a page contains a real visible FAQ and current Google policies make the markup appropriate, it can be used. The visible user content must match the JSON-LD.

Do not fabricate FAQs per region solely to create uniqueness.

---

# 12. Content quality rules for programmatic pages

This section is mandatory.

## NEVER

- create fake statistics;
- create invented local facts;
- create generic AI paragraphs with only the place name changed;
- claim data is current when date is unknown;
- expose personal/non-public information;
- create indexable empty search results;
- create pages for random malformed cadastral numbers;
- index every filter/search parameter;
- create multiple aliases for the same location without canonicals/redirects;
- generate pages faster than data and quality checks can support.

## Prefer

- facts derived from the project database;
- counts/aggregates generated from real parcel data;
- real administrative hierarchy;
- unique lists of child locations;
- unique parcel datasets;
- useful user instructions;
- source/freshness transparency.

---

# 13. Crawl and scaling strategy

Do not release millions of parcel pages into sitemaps on day one.

## Recommended staged rollout

### Stage A

```text
Home
Oblast directory
All high-quality oblast pages
Core guides
```

Goal: confirm reliable indexation.

### Stage B

Add the strongest location pages with substantial parcel data.

Example initial target:

```text
100–500 location pages
```

### Stage C

Add a limited batch of high-quality parcel pages.

Example:

```text
5,000–20,000 parcel URLs
```

Monitor crawl/indexing before expanding.

### Stage D

Scale based on evidence from Search Console and server logs.

Do not expand if the majority of submitted URLs become:

```text
Discovered – currently not indexed
Crawled – currently not indexed
Duplicate
Soft 404
```

---

# 14. Sitemap eligibility service

Implement a central reusable rule/service, e.g. conceptually:

```text
SeoIndexabilityService
```

Methods may conceptually include:

```text
isOblastIndexable(oblast)
isLocationIndexable(location)
isParcelIndexable(parcel)
canonicalUrl(entity)
seoMetadata(entity)
```

Views, meta robots and sitemap generation must use the **same eligibility logic**.

Avoid the situation where:

```text
sitemap says index
page says noindex
```

or vice versa.

---

# 15. Aggregates / performance

Do not calculate expensive region statistics on every request across millions of parcel rows.

Use one of:

- cached aggregate tables;
- materialized views;
- scheduled aggregation jobs;
- application cache with explicit invalidation/TTL.

Possible aggregate model:

```text
location_id
parcel_count
total_area
category_counts
purpose_counts
last_data_update
computed_at
```

Oblast aggregates can be derived similarly.

Page TTFB must remain reasonable after programmatic SEO is added.

---

# 16. Search page policy

Interactive cadastral search is useful for users but generally should not create uncontrolled indexable URLs.

Examples:

```text
/search?q=...
/map?bounds=...
/map?zoom=...
```

Default:

```text
noindex,follow
```

Do not add these parameter URLs to sitemap.

When an exact cadastral number exists, search result should link to the canonical `/parcel/{number}` detail page.

---

# 17. Error and duplicate handling

Implement deterministic handling for:

## Invalid cadastral number

```text
404
noindex
```

## Valid-format number, no parcel record

Prefer true 404 unless the product specifically needs a user-facing search state. Do not create indexable empty parcel pages.

## Duplicate parcel record

Resolve internally to one canonical parcel entity/URL.

## Old slug for renamed location

301 → current canonical location slug.

## Upper/lowercase or trailing slash duplicates

Choose one global convention and 301 all variants.

---

# 18. Technical page metadata helper

Centralize SEO metadata generation instead of hardcoding titles in many components/controllers.

Conceptual structure:

```text
SeoMeta
- title
- description
- canonical
- robots
- og:title
- og:description
- og:url
```

Entity-specific metadata generators:

```text
HomeSeo
OblastSeo
LocationSeo
ParcelSeo
ArticleSeo
```

Meta description must degrade gracefully when optional data is unavailable.

---

# 19. Open Graph / shareability

Parcel and regional pages should expose basic OG metadata:

```text
og:title
og:description
og:url
og:type=website
```

Use an existing suitable default image or generated map preview only if the project already has a reliable mechanism. Do not block core SEO work on OG image generation.

---

# 20. Accessibility / semantic HTML

SEO components must remain semantically correct:

- exactly one primary H1 per page;
- logical H2/H3 hierarchy;
- anchors for navigation rather than click-only `<div>` elements;
- accessible link labels;
- useful table markup for parcel facts where appropriate;
- map must not be the only representation of important textual facts.

---

# 21. Core Web Vitals / performance constraints

Programmatic SEO must not make the site substantially slower.

Agent must check:

- excessive map JS on text-first SEO pages;
- lazy-loading heavy map components below primary content where appropriate;
- image sizing;
- font loading;
- JS bundle growth;
- DB query count per request;
- N+1 queries in nearby parcels / hierarchy;
- page cache opportunities.

Target good CWV where feasible, but do not remove useful content to chase a synthetic score.

---

# 22. Tests to implement

Add automated tests appropriate to the project's stack.

## 22.1 Oblast SEO test

For an eligible oblast verify:

```text
GET route = 200
title contains correct oblast
one H1
canonical is self-referencing
robots allows indexing
real unique aggregate/location content exists
```

For an insufficient-data oblast verify:

```text
page remains usable
robots = noindex,follow
not emitted in sitemap
```

## 22.2 Parcel SEO test

Eligible parcel:

```text
200
correct cadastral number
self canonical
index,follow
listed in parcel sitemap
real parcel fields rendered
parent links rendered
```

Insufficient parcel:

```text
200 or product-defined status
noindex,follow
NOT in sitemap
```

Unknown parcel:

```text
404
```

## 22.3 Sitemap tests

Verify:

- only 200 canonical indexable URLs;
- no redirect URLs;
- no noindex URLs;
- correct XML;
- URL count limits;
- stable lastmod behavior.

## 22.4 Duplicate URL tests

Test:

- trailing slash behavior;
- encoded cadastral number variants;
- case normalization where applicable;
- obsolete slugs.

---

# 23. Manual QA checklist before deployment

For at least:

- home page;
- `/oblast`;
- 3 oblasts with different data quantities;
- 3 locations;
- 5 parcel pages;
- one missing parcel;
- one noindex low-data parcel;

Check:

```text
[ ] HTTP status
[ ] rendered source contains SEO content
[ ] title
[ ] description
[ ] H1
[ ] canonical
[ ] robots meta
[ ] breadcrumbs
[ ] JSON-LD validity
[ ] parent/child internal links
[ ] no broken links
[ ] sitemap membership matches indexability
[ ] mobile rendering
[ ] no major console/server errors
```

---

# 24. Deployment strategy

Deploy incrementally.

## Release 1

- audit/fix robots;
- sitemap index;
- canonical/meta rules;
- centralized indexability logic;
- improve oblast pages;
- unique real-data aggregates;
- noindex low-value oblasts.

## Release 2

- location hierarchy;
- location sitemap;
- breadcrumb graph;
- pagination.

## Release 3

- parcel detail pages;
- nearby parcels;
- parcel sitemap batches;
- quality gate.

## Release 4

- optimize based on Search Console and crawl behavior;
- expand sitemap batches only when indexation quality is acceptable.

---

# 25. Search Console monitoring after deployment

Do not judge SEO solely by manual Google searches.

Track weekly:

```text
Indexed pages
Submitted vs indexed sitemap pages
Discovered – currently not indexed
Crawled – currently not indexed
Impressions
Clicks
Average position
Query count
Landing page count receiving impressions
```

Primary query group:

```text
кадастрова карта україни
кадастрова карта україни онлайн
публічна кадастрова карта
кадастр онлайн
```

Regional groups:

```text
кадастрова карта рівненська область
кадастрова карта львівська область
...
```

Long-tail:

```text
exact cadastral numbers
city / district cadastral map queries
```

---

# 26. Success criteria

## Technical success

Within normal recrawl/indexing delay:

- important region URLs become crawlable and increasingly indexed;
- sitemap contains only eligible pages;
- `Discovered – currently not indexed` does not grow proportionally with every deployment;
- no mass duplicate/soft-404/noindex sitemap conflicts;
- server performance remains stable.

## SEO directional success

Over several weeks/months, expect growth in:

- total impressions;
- number of queries;
- number of ranking landing pages;
- regional long-tail impressions;
- cadastral-number impressions;
- average position for relevant clusters.

Do **not** treat TOP-10 for one keyword as the only success condition.

---

# 27. Priority backlog for the coding agent

## P0 — do first

```text
[ ] Inspect repository architecture and current SEO implementation
[ ] Audit robots.txt
[ ] Audit sitemap implementation
[ ] Audit canonical implementation
[ ] Confirm SSR/server-rendered HTML for SEO content
[ ] Implement centralized SeoIndexabilityService (or equivalent)
[ ] Ensure sitemap and robots meta use identical eligibility rules
[ ] Improve /oblast/{slug} using real unique region data
[ ] Add noindex for empty/near-empty oblast pages until quality threshold is met
[ ] Add crawlable parent/child internal linking
[ ] Add automated SEO route tests
```

## P1 — high impact

```text
[ ] Implement location hierarchy/data model reuse
[ ] Create indexable location pages with real child/parcel data
[ ] Add crawlable pagination
[ ] Add BreadcrumbList
[ ] Add location sitemap(s)
[ ] Implement parcel detail route
[ ] Render useful parcel data server-side
[ ] Implement parcel quality/indexability gate
[ ] Add nearby parcel links
[ ] Add parcel sitemap batching
```

## P2 — scaling / optimization

```text
[ ] Precomputed regional/location aggregates
[ ] DB/index optimization
[ ] Sitemap generation optimization
[ ] Cache SEO landing pages/aggregates where useful
[ ] Server-log crawl analysis if infrastructure permits
[ ] Expand parcel batches based on indexing quality
```

## P3 — later SEO expansion

Only after the core hierarchy is working:

```text
[ ] Additional factual guides based on real user queries
[ ] Curated indexable category/purpose landing pages when there is demonstrated demand
[ ] Better related-location navigation
[ ] Enhanced OG/social previews
```

---

# 28. Explicit non-goals

The coding agent must NOT:

```text
- rewrite the entire home page again without evidence
- keyword-stuff content
- bulk-generate AI location articles
- submit millions of URLs immediately
- create fake locality pages
- index search/filter combinations
- index empty parcel records
- hide duplicate problems only with canonical tags when routes should actually redirect
- remove legal/data-source disclaimers
```

---

# 29. Recommended implementation decision flow

For every potential SEO URL:

```text
Does entity exist?
  NO -> 404
  YES
    |
Does page contain sufficient unique useful data?
  NO -> accessible if product needs it, but noindex + exclude sitemap
  YES
    |
Is URL canonical and response 200?
  NO -> fix URL/status
  YES
    |
index,follow
include sitemap
add parent/child internal links
```

---

# 30. Instructions to the coding AI agent

Use this procedure:

1. **Inspect, do not guess.** Find the current routing, data and rendering architecture.
2. Reuse existing parcel/map data models whenever possible.
3. Implement **Phase 1 and Phase 2 first**. Do not jump directly to millions of parcel pages.
4. Keep all SEO eligibility logic centralized.
5. Make every indexable page useful without requiring JavaScript to reveal its primary textual data.
6. Generate SEO content from factual database values, not filler prose.
7. Add tests for every new route/indexability rule.
8. Keep backwards compatibility with existing map/search functionality.
9. Do not change unrelated application behavior.
10. After implementation, output a concise report containing:

```text
- files changed
- routes added/changed
- database migrations/indexes added
- sitemap changes
- robots/canonical changes
- indexability thresholds used
- pages intentionally kept noindex
- tests added
- manual deployment/cron steps
- risks / future follow-up
```

---

# 31. Reference observations used to define this plan

The following public patterns were observed during research in September 2026:

- KadastrView homepage already targets cadastral-map intent and links to informational pages and the oblast directory.
- KadastrView `/oblast` exposes oblasts as normal crawlable links.
- A current KadastrView oblast page contains very little unique regional information when region statistics are unavailable.
- Kadastrova.com exposes crawlable parcel-detail pages containing cadastral-number-specific factual data and related/nearby parcel links.
- OpenDataBot exposes a deeper hierarchy from region to districts/localities and lists cadastral numbers on locality pages.

These competitor patterns are **research inputs**, not templates to copy. KadastrView should build its own UX/content around its own dataset and capabilities.

---

# 32. Final implementation priority

If engineering time is limited, implement in exactly this order:

```text
1. Indexability correctness
2. Unique high-quality oblast pages
3. Location hierarchy
4. High-quality parcel detail pages
5. Internal linking
6. Batched XML sitemaps
7. Gradual scale-up
8. Backlinks/content marketing outside codebase
```

The most important strategic principle is:

> **Do not optimize for the number of generated pages. Optimize for the number of genuinely useful pages that Google chooses to index and users can navigate.**

