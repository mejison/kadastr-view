import { describe, expect, it } from 'vitest';
import { handler } from '../netlify/functions/seo-page.mjs';

async function page(path) {
    return handler({ httpMethod: 'GET', path, rawUrl: `https://kadastrview.online${path}` });
}

function expectSeoDocument(response, canonicalPath, robots = /^index,follow/) {
    expect(response.statusCode).toBe(200);
    expect(response.headers['x-robots-tag']).toMatch(robots);
    expect(response.body).toContain(`name="robots" content="${response.headers['x-robots-tag']}"`);
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
        ['/about', '/about'],
        ['/data-sources', '/data-sources'],
    ])('renders %s with canonical HTML', async (path, canonicalPath) => {
        expectSeoDocument(await page(path), canonicalPath);
    });

    it('keeps a low-data oblast usable but noindex', async () => {
        const response = await page('/oblast/rivnenska');

        expectSeoDocument(response, '/oblast/rivnenska', /^noindex,follow$/);
        expect(response.body).toContain('недостатньо перевірених кадастрових записів');
    });

    it('returns a noindex 404 instead of a thin parcel page', async () => {
        const response = await page('/dilyanka/not-a-number');

        expect(response.statusCode).toBe(404);
        expect(response.headers['x-robots-tag']).toBe('noindex,follow');
        expect(response.body).toContain('name="robots" content="noindex,follow"');
        expect(response.body).not.toContain('rel="canonical"');
        expect(response.body).toContain('<h1>Ділянку не знайдено</h1>');
    });

    it('does not create unsupported location pages', async () => {
        const response = await page('/raion/unknown');

        expect(response.statusCode).toBe(404);
        expect(response.headers['x-robots-tag']).toBe('noindex,follow');
    });

    it('keeps an unknown community route out of the index', async () => {
        const response = await page('/hromada/UA05020110000052014');

        expect(response.statusCode).toBe(404);
        expect(response.headers['x-robots-tag']).toBe('noindex,follow');
    });
});
