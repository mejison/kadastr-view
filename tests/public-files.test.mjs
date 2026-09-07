import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const root = new URL('..', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

describe('public SEO assets and configuration', () => {
    it('keeps homepage SEO content and crawlable hub links in source HTML', async () => {
        const homepage = await read('index.html');

        expect(homepage).toContain('<title>Кадастрова карта України онлайн — KadastrView</title>');
        expect(homepage).toContain('<h1>Кадастрова карта України онлайн</h1>');
        expect(homepage).toContain('href="/guides/poshuk-za-kadastrovym-nomerom"');
        expect(homepage).toContain('href="/oblast"');
    });

    it('advertises the dynamic eligibility-aware page sitemap to crawlers', async () => {
        const [robots, sitemap, config] = await Promise.all([
            read('public/robots.txt'),
            read('public/sitemap.xml'),
            read('netlify.toml'),
        ]);

        expect(robots).toContain('Sitemap: https://kadastrview.online/sitemap.xml');
        expect(sitemap).toContain('https://kadastrview.online/sitemap-pages.xml');
        expect(config).toContain('to = "/.netlify/functions/sitemap-pages"');
        expect(config).toContain('from = "/sitemap-parcels.xml"');
        expect(config).toContain('to = "/.netlify/functions/sitemap-parcels"');
        expect(config).toContain('from = "/parcel/*"');
    });

    it('routes SEO pages to Netlify server rendering', async () => {
        const config = await read('netlify.toml');

        expect(config).toContain('from = "/guides/*"');
        expect(config).toContain('from = "/oblast/*"');
        expect(config).toContain('from = "/about"');
    });
});
