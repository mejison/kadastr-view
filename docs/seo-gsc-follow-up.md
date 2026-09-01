# Search Console and reputation follow-up

These checks require the site owner's authenticated accounts and cannot be executed from the repository.

1. In Search Console, export the two URLs reported as `Page with redirect`. Confirm each reaches one 301 and a logical canonical destination.
2. Export all 22 URLs reported as `Discovered – currently not indexed`. Classify each with the route policy in `seo-route-audit.md`; do not request indexing for low-value, duplicate or invalid parcel URLs.
3. For each remaining important URL run **URL Inspection → Test Live URL**, then request indexing after the release.
4. Submit `https://kadastrview.online/sitemap.xml` after deployment and monitor index coverage weekly.
5. Record weekly indexed pages, excluded pages, clicks, impressions, CTR, position, top queries and landing pages. Segment homepage, guides, regions and parcels.
6. Review Security issues and Manual actions. Expected result: no issues detected.
7. If any external reputation provider flags the domain, verify HTTPS and content integrity first, then use that provider's false-positive review process.

## Query clusters to track

- Core map: `кадастрова карта`, `кадастрова карта україни`, `публічна кадастрова карта`.
- Cadastral number: `кадастровий номер`, `пошук за кадастровим номером`, `перевірити кадастровий номер`.
- Parcel information: `земельна ділянка`, `карта земельних ділянок`, `перевірити земельну ділянку`, `межі земельної ділянки`.
