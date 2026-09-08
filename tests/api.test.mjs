import { describe, expect, it } from 'vitest';
import { handler } from '../netlify/functions/api.mjs';

function request(path, method = 'GET') {
    return handler({
        httpMethod: method,
        path,
        rawUrl: `https://kadastrview.online${path}`,
        headers: {},
    });
}

describe('public API contracts', () => {
    it('serves stable map configuration', async () => {
        const response = await request('/api/v1/map/config');
        const payload = JSON.parse(response.body);

        expect(response.statusCode).toBe(200);
        expect(payload.data.tile_endpoint).toBe('https://tiles.kadastrview.online/kadastr/v1/{z}/{x}/{y}.pbf');
        expect(payload.data.locale).toBe('uk');
    });

    it('serves the available map layers and paid services', async () => {
        const layers = JSON.parse((await request('/api/v1/layers')).body);
        const services = JSON.parse((await request('/api/v1/services')).body);

        expect(layers.data).toEqual(expect.arrayContaining([
            expect.objectContaining({ slug: 'osm' }),
            expect.objectContaining({ slug: 'kadastrview-pbf' }),
        ]));
        expect(services.data).toEqual(expect.arrayContaining([
            expect.objectContaining({ id: 'dzk_extract', price: 100 }),
        ]));
    });

    it('returns correct errors for unsupported API calls', async () => {
        expect((await request('/api/v1/not-found')).statusCode).toBe(404);
        expect((await request('/api/v1/map/config', 'PUT')).statusCode).toBe(405);
    });

});
