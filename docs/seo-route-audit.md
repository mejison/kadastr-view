# SEO route audit

Updated: 2026-09-01. This is the intended post-release indexation policy. Validate the HTTP column against the deployed preview before publishing.

| Route group | Status | Indexable | Canonical | Sitemap | Internal link | Server HTML | Type |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/` | 200 | yes | self | yes | sitewide | yes | homepage |
| `/guides` | 200 | yes | self | yes | homepage, footer | yes | guide hub |
| `/guides/kadastrovyi-nomer` | 200 | yes | self | yes | guide hub, homepage | yes | guide |
| `/guides/poshuk-za-kadastrovym-nomerom` | 200 | yes | self | yes | guide hub, homepage | yes | guide |
| `/guides/yak-znayty-dilyanku` | 200 | yes | self | yes | guide hub, homepage | yes | guide |
| `/oblast` | 200 | yes | self | yes | homepage, guide pages | yes | region hub |
| `/oblast/:slug` (27 allowlisted slugs) | 200 | yes | self | yes | region hub | yes | region page |
| `/about`, `/data-sources`, `/contact`, `/privacy`, `/terms` | 200 | yes | self | yes | footer | yes | trust/legal |
| `/dilyanka/:number` with complete known data | 200 | yes | self | no | direct/shared links | yes | parcel page |
| `/dilyanka/:number` invalid, unknown or incomplete | 404 | no | homepage fallback only | no | n/a | yes | error |
| `/raion/*`, `/hromada/*`, `/settlement/*` | 404 | no | homepage fallback only | no | n/a | yes | unsupported location |
| `/api/*`, `/.netlify/*` | API | no | n/a | no | n/a | no | utility |

## Parcel policy

A parcel page can be indexed only when the cadastral number is valid, the parcel exists in MongoDB, its area is positive, a location or land attribute is present, and usable geometry/centroid data exists. No parcel URL is included in the primary sitemap.

## Canonical policy

Canonical URLs use `https://kadastrview.online/path` without a trailing slash or query parameters. The Netlify redirects normalize `www` and trailing slash variants. Application and tracking query parameters are not represented in canonical URLs.

## Search Console follow-up

The repository does not contain the Search Console export, so the two redirect URLs and 22 `Discovered – currently not indexed` URLs cannot be identified from source code. After deployment, export them and append their exact URL, class, inspection result and action to `docs/seo-gsc-follow-up.md`.
