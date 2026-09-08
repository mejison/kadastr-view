import { describe, expect, it } from 'vitest';
import { DISTRICT_MINIMUM_PUBLIC_PARCELS, districtPath, districtSlug, isDistrictIndexable } from '../netlify/functions/district-page-data.mjs';

describe('district SEO quality gate', () => {
    it('creates a stable nested path from a Ukrainian district name', () => {
        expect(districtSlug('Кам’янець-Подільський район')).toBe('kamianets-podilskyi-raion');
        expect(districtPath('khmelnytska', 'Кам’янець-Подільський район')).toBe('/raion/khmelnytska/kamianets-podilskyi-raion');
    });

    it('keeps districts out of the index until their public data passes the gate', () => {
        const base = { oblast: 'Вінницька область', district: 'Вінницький район', oblastSlug: 'vinnytska' };
        expect(isDistrictIndexable({ ...base, parcelCount: DISTRICT_MINIMUM_PUBLIC_PARCELS - 1 })).toBe(false);
        expect(isDistrictIndexable({ ...base, parcelCount: DISTRICT_MINIMUM_PUBLIC_PARCELS })).toBe(true);
    });
});
