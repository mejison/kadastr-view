import { describe, expect, it } from 'vitest';
import { SEO_INDEXABILITY, canonicalParcelPath, isCadastralNumber, isOblastIndexable, isParcelIndexable } from '../netlify/functions/seo-indexability.mjs';

describe('central SEO indexability policy', () => {
    it('accepts only canonical cadastral number syntax', () => {
        expect(isCadastralNumber('5624685900:01:001:0123')).toBe(true);
        expect(isCadastralNumber('74538382B84610439401970')).toBe(false);
        expect(canonicalParcelPath('5624685900:01:001:0123')).toBe('/dilyanka/5624685900:01:001:0123');
    });

    it('requires three useful attributes before a parcel is indexable', () => {
        const parcel = {
            cadastralNumber: '5624685900:01:001:0123',
            centroid: { lat: 50.6, lng: 26.2 },
            areaHectares: 1.5,
            address: 'Рівненська область',
        };

        expect(isParcelIndexable(parcel)).toBe(true);
        expect(isParcelIndexable({ ...parcel, address: null, areaHectares: 0 })).toBe(false);
    });

    it('uses the same explicit threshold for oblast eligibility', () => {
        expect(isOblastIndexable({ parcelCount: SEO_INDEXABILITY.oblastMinimumKnownParcels })).toBe(true);
        expect(isOblastIndexable({ parcelCount: SEO_INDEXABILITY.oblastMinimumKnownParcels - 1 })).toBe(false);
    });
});
