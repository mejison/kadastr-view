import { describe, expect, it } from 'vitest';
import { centroidFromHtml, communityForPoint, geometryContainsPoint } from '../scripts/spatial-location.mjs';

const feature = { id: 7, properties: { OBJECTID: 7, Gromada: 'Тестова', Rayon: 'Тестовий', Oblast: 'Тестова область', katottg: 'UA00000000000000000', Vyd_gromady: 'міська' }, geometry: { type: 'Polygon', coordinates: [[[30, 50], [31, 50], [31, 51], [30, 51], [30, 50]]] } };

describe('centroid spatial matching', () => {
    it('extracts valid map coordinates from the current parcel page markup', () => {
        expect(centroidFromHtml('<div data-map-parcel-lat-value="49.0432" data-map-parcel-lng-value="28.5744">')).toEqual({ lat: 49.0432, lng: 28.5744 });
        expect(centroidFromHtml('<div>')).toBeNull();
    });
    it('matches a point into a community polygon', () => {
        expect(geometryContainsPoint(feature.geometry, [30.5, 50.5])).toBe(true);
        expect(communityForPoint({ lng: 30.5, lat: 50.5 }, [feature])).toMatchObject({ name: 'Тестова', katottg: 'UA00000000000000000' });
    });
    it('supports the complete community GeoJSON property names', () => {
        const sourceFeature = { ...feature, properties: { name: 'Пісочинська територіальна громада', district_name: 'Харківський район', oblast_name: 'Харківська область', katotth: 'UA63120210000075842', type: 'селищна територіальна громада' } };
        expect(communityForPoint({ lng: 30.5, lat: 50.5 }, [sourceFeature])).toMatchObject({ name: 'Пісочинська територіальна громада', district: 'Харківський район', oblast: 'Харківська область', katottg: 'UA63120210000075842' });
    });
});
