const whitespace = /\s+/g;

export function normalizeText(value) {
    return String(value ?? '')
        .toLocaleLowerCase('uk-UA')
        .replace(/[’`ʼ]/g, "'")
        .replace(/['.-]/g, ' ')
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(whitespace, ' ')
        .trim();
}

export function normalizeCouncilName(value) {
    return normalizeText(value)
        .replace(/(^|\s)(міська|селищна|сільська)\s+рада(?=\s|$)/gu, ' ')
        .replace(/(^|\s)територіальна\s+громада(?=\s|$)/gu, ' ')
        .replace(whitespace, ' ')
        .trim();
}

export function buildKatottgIndex(units) {
    const byId = new Map(units.map((unit) => [unit.id, unit]));
    const byKoatuu = new Map();
    const oblastByPrefix = new Map();

    for (const unit of units) {
        const code = String(unit.koatuu ?? '').trim();
        if (!/^\d{10}$/.test(code)) continue;
        const list = byKoatuu.get(code) ?? [];
        list.push(unit);
        byKoatuu.set(code, list);
        if (unit.level === 1) oblastByPrefix.set(code.slice(0, 2), unit);
    }

    return { byId, byKoatuu, oblastByPrefix };
}

function ancestors(unit, byId) {
    const result = [];
    let current = unit;

    while (current) {
        result.push(current);
        current = current.parent_id ? byId.get(current.parent_id) : null;
    }

    return result;
}

function unitForLevel(units, level) {
    return units.find((unit) => unit.level === level) ?? null;
}

function publicUnit(unit) {
    if (!unit) return null;
    const koatuu = String(unit.koatuu ?? '').trim();
    return {
        id: unit.id,
        name: unit.name,
        type: unit.type,
        koatuu: /^\d{10}$/.test(koatuu) ? koatuu : null,
    };
}

/**
 * Matches the historical KOATUU component embedded in a cadastral number to
 * the current KATOTTG hierarchy. It intentionally does not guess when the
 * classifier cannot identify a settlement.
 */
export function locationForCadastralNumber(cadastralNumber, index) {
    const normalized = String(cadastralNumber ?? '').trim();
    const match = normalized.match(/^(\d{10}):\d{2}:\d{3}:\d{4}$/);
    if (!match) return null;

    const koatuu = match[1];
    const directUnits = index.byKoatuu.get(koatuu) ?? [];
    if (directUnits.length === 0) {
        const oblast = index.oblastByPrefix.get(koatuu.slice(0, 2));
        if (!oblast) return null;
        return {
            cadastral_number: normalized,
            koatuu,
            oblast: publicUnit(oblast),
            district: null,
            community: null,
            settlement: null,
            matched_by: 'cadastral-oblast-prefix',
            confidence: 'low',
        };
    }

    // Prefer the fourth-level settlement; a KOATUU code may legitimately map
    // to both a hromada and its administrative centre.
    const anchor = unitForLevel(directUnits, 4) ?? unitForLevel(directUnits, 3) ?? directUnits[0];
    const hierarchy = ancestors(anchor, index.byId);

    return {
        cadastral_number: normalized,
        koatuu,
        oblast: publicUnit(unitForLevel(hierarchy, 1)),
        district: publicUnit(unitForLevel(hierarchy, 2)),
        community: publicUnit(unitForLevel(hierarchy, 3)),
        settlement: publicUnit(unitForLevel(hierarchy, 4)),
        matched_by: anchor.level === 4 ? 'koatuu-prefix-settlement' : 'koatuu-prefix-community',
        confidence: anchor.level === 4 ? 'high' : 'medium',
    };
}

export function publisherSupportsCommunity(publishers, community) {
    if (!community?.name || !Array.isArray(publishers) || publishers.length === 0) return null;
    const expected = normalizeCouncilName(community.name);
    if (!expected) return null;
    return publishers.some((publisher) => normalizeCouncilName(publisher) === expected);
}
