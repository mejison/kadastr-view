import { describe, expect, it } from 'vitest';
import { buildKatottgIndex, locationForCadastralNumber, publisherSupportsCommunity } from '../scripts/location-enrichment.mjs';

const units = [
    { id: 'UA26000000000000001', name: 'Івано-Франківська', type: 'область', level: 1, parent_id: null, koatuu: '2600000000' },
    { id: 'UA26040000000000002', name: 'Івано-Франківський', type: 'район', level: 2, parent_id: 'UA26000000000000001', koatuu: '2620000000' },
    { id: 'UA26040150000000003', name: 'Єзупільська', type: 'територіальна громада', level: 3, parent_id: 'UA26040000000000002', koatuu: '2625855300' },
    { id: 'UA26040150010000004', name: 'Єзупіль', type: 'селище міського типу', level: 4, parent_id: 'UA26040150000000003', koatuu: '2625855300' },
];

describe('local KATOTTG enrichment', () => {
    it('maps a cadastral KOATUU prefix into the full current hierarchy', () => {
        const location = locationForCadastralNumber('2625855300:01:003:0634', buildKatottgIndex(units));

        expect(location).toMatchObject({
            koatuu: '2625855300',
            oblast: { name: 'Івано-Франківська' },
            district: { name: 'Івано-Франківський' },
            community: { name: 'Єзупільська' },
            settlement: { name: 'Єзупіль' },
            confidence: 'high',
        });
    });

    it('does not invent a location for an invalid or unknown cadastral number', () => {
        const index = buildKatottgIndex(units);
        expect(locationForCadastralNumber('bad-number', index)).toBeNull();
        expect(locationForCadastralNumber('9999999999:01:003:0634', index)).toBeNull();
        expect(locationForCadastralNumber('2600000001:01:003:0634', index)).toMatchObject({
            oblast: { name: 'Івано-Франківська' },
            community: null,
            confidence: 'low',
        });
    });

    it('uses publisher only as corroboration, not as a source of guessed geography', () => {
        const community = { name: 'Єзупільська' };
        expect(publisherSupportsCommunity(['Єзупільська селищна рада'], community)).toBe(true);
        expect(publisherSupportsCommunity(['Інша сільська рада'], community)).toBe(false);
    });

    it('does not persist a non-code legacy KOATUU placeholder', () => {
        const changed = units.map((unit) => unit.level === 2 ? { ...unit, koatuu: 'Новий район' } : unit);
        const location = locationForCadastralNumber('2625855300:01:003:0634', buildKatottgIndex(changed));
        expect(location.district.koatuu).toBeNull();
    });
});
