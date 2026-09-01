import { describe, expect, it } from 'vitest';
import { handler } from '../netlify/functions/seo-page.mjs';

async function page(path) {
    return handler({ httpMethod: 'GET', path, rawUrl: `https://kadastrview.online${path}` });
}

function expectSeoDocument(response, canonicalPath) {
    expect(response.statusCode).toBe(200);
    expect(response.headers['x-robots-tag']).toMatch(/^index, follow/);
    expect(response.body).toContain('<title>');
    expect(response.body).toContain('name="description"');
    expect(response.body).toContain(`rel="canonical" href="https://kadastrview.online${canonicalPath}"`);
    expect(response.body).toContain('<h1>');
}

describe('server-rendered SEO pages', () => {
    it.each([
        ['/guides', '/guides'],
        ['/guides/kadastrovyi-nomer', '/guides/kadastrovyi-nomer'],
        ['/oblast', '/oblast'],
        ['/oblast/rivnenska', '/oblast/rivnenska'],
        ['/about', '/about'],
        ['/data-sources', '/data-sources'],
    ])('renders %s with canonical HTML', async (path, canonicalPath) => {
        expectSeoDocument(await page(path), canonicalPath);
    });

    it('returns a noindex 404 instead of a thin parcel page', async () => {
        const response = await page('/dilyanka/not-a-number');

        expect(response.statusCode).toBe(404);
        expect(response.headers['x-robots-tag']).toBe('noindex, follow');
        expect(response.body).toContain('<h1>Ділянку не знайдено</h1>');
    });

    it('does not create unsupported location pages', async () => {
        const response = await page('/raion/unknown');

        expect(response.statusCode).toBe(404);
        expect(response.headers['x-robots-tag']).toBe('noindex, follow');
    });
});
