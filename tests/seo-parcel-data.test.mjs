import { describe, expect, it } from 'vitest';
import { publicParcelFromOpenRight } from '../netlify/functions/seo-parcel-data.mjs';
import { isParcelIndexable } from '../netlify/functions/seo-indexability.mjs';
import { sitemapParcelUrls } from '../netlify/functions/sitemap-parcels.mjs';

const publicRecord = {
    cadastral_number_normalized: '5624685900:01:001:0123',
    address: 'Рівненська область, приклад',
    lease_area: '1.25',
    land_use: '01.02',
    right_type: 'Оренда',
    source_name: 'Відкриті дані',
    imported_at: '2026-09-06T10:00:00.000Z',
};

describe('public parcel SEO data', () => {
    it('uses only non-personal public fields and passes the quality gate', () => {
        const parcel = publicParcelFromOpenRight({ ...publicRecord, tenant: 'Не публікувати', landlord: 'Не публікувати' });

        expect(parcel).toMatchObject({ cadastralNumber: '5624685900:01:001:0123', areaHectares: 1.25, purpose: '01.02', regionSlug: 'rivnenska' });
        expect(parcel).not.toHaveProperty('tenant');
        expect(parcel).not.toHaveProperty('landlord');
        expect(isParcelIndexable(parcel)).toBe(true);
    });

    it('emits canonical eligible parcel URLs with a valid lastmod', () => {
        expect(sitemapParcelUrls([{ cadastralNumber: publicRecord.cadastral_number_normalized, latestUpdate: publicRecord.imported_at }])).toEqual([{
            loc: 'https://kadastrview.online/dilyanka/5624685900:01:001:0123',
            lastmod: '2026-09-06',
        }]);
    });
});
