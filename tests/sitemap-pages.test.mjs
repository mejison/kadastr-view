import { describe, expect, it } from 'vitest';
import { sitemapUrls } from '../netlify/functions/sitemap-pages.mjs';

describe('eligibility-aware page sitemap', () => {
    it('contains fixed canonical pages and only supplied eligible oblasts', () => {
        const urls = sitemapUrls(['rivnenska', 'vinnytska', 'rivnenska']);
        const locations = urls.map((item) => item.loc);

        expect(locations).toContain('https://kadastrview.online/guides');
        expect(locations).toContain('https://kadastrview.online/oblast/rivnenska');
        expect(locations).toContain('https://kadastrview.online/oblast/vinnytska');
        expect(locations.filter((url) => url.endsWith('/oblast/rivnenska'))).toHaveLength(1);
        expect(locations.some((url) => url.includes('/dilyanka/'))).toBe(false);
    });
});
