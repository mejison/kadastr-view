import { describe, expect, it, vi } from 'vitest';
import { clearRegionStatsCache, regionCodeForSlug, regionStatsFor, regionStatsPipeline } from '../netlify/functions/region-stats.mjs';

describe('regional MongoDB statistics', () => {
    it('maps region slugs to cadastral prefixes', () => {
        expect(regionCodeForSlug('rivnenska')).toBe('56');
        expect(regionCodeForSlug('kyiv')).toBe('80');
        expect(regionCodeForSlug('unknown')).toBeNull();
    });

    it('builds an aggregation scoped to the cadastral prefix', () => {
        const pipeline = regionStatsPipeline('56');

        expect(pipeline[0]).toEqual({
            $match: {
                is_active: { $ne: false },
                cadastral_number_normalized: { $regex: '^56' },
            },
        });
        expect(pipeline[1].$facet).toHaveProperty('summary');
        expect(pipeline[1].$facet).toHaveProperty('categories');
        expect(pipeline[1].$facet).toHaveProperty('purposes');
    });

    it('returns only real aggregate values and caches the result', async () => {
        clearRegionStatsCache();
        const toArray = vi.fn().mockResolvedValue([{
            summary: [{ parcelCount: 2, totalArea: 4.5, latestUpdate: new Date('2026-09-01') }],
            categories: [{ name: 'Сільськогосподарські землі', count: 2 }],
            purposes: [{ name: 'Для садівництва', count: 1 }],
        }]);
        const aggregate = vi.fn(() => ({ toArray }));
        const db = { collection: vi.fn(() => ({ aggregate })) };

        const first = await regionStatsFor(db, 'rivnenska');
        const second = await regionStatsFor(db, 'rivnenska');

        expect(first).toMatchObject({ parcelCount: 2, totalArea: 4.5 });
        expect(first.categories).toEqual([{ name: 'Сільськогосподарські землі', count: 2 }]);
        expect(second).toEqual(first);
        expect(aggregate).toHaveBeenCalledTimes(1);
    });

    it('does not invent a statistic where there are no parcels', async () => {
        clearRegionStatsCache();
        const db = { collection: () => ({ aggregate: () => ({ toArray: async () => [{ summary: [], categories: [], purposes: [] }] }) }) };

        await expect(regionStatsFor(db, 'rivnenska')).resolves.toBeNull();
    });
});
