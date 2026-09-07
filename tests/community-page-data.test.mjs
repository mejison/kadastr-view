import { describe, expect, it } from 'vitest';
import { COMMUNITY_MINIMUM_PUBLIC_PARCELS, communityFromLocation, communityPath, isCommunityIndexable, validCommunityCode } from '../netlify/functions/community-page-data.mjs';

const location = {
    spatial: {
        confidence: 'high',
        community: {
            katottg: 'UA05020110000052014',
            name: 'Липовецька  територіальна громада',
            oblast: 'Вінницька область',
            district: 'Вінницький район',
        },
    },
};

describe('community SEO quality gate', () => {
    it('uses a stable KATOTTH route only for spatially confirmed communities', () => {
        expect(validCommunityCode('UA05020110000052014')).toBe(true);
        expect(communityPath('UA05020110000052014')).toBe('/hromada/UA05020110000052014');
        expect(communityFromLocation(location)).toMatchObject({ name: 'Липовецька територіальна громада', oblast: 'Вінницька область' });
        expect(communityFromLocation({ spatial: { ...location.spatial, confidence: 'medium' } })).toBeNull();
    });

    it('does not index a page until it contains enough public parcel records', () => {
        const base = communityFromLocation(location);
        expect(isCommunityIndexable({ ...base, parcelCount: COMMUNITY_MINIMUM_PUBLIC_PARCELS - 1 })).toBe(false);
        expect(isCommunityIndexable({ ...base, parcelCount: COMMUNITY_MINIMUM_PUBLIC_PARCELS })).toBe(true);
    });
});
