<template>
    <main class="app-shell">
        <section class="map-surface">
            <div ref="mapContainer" class="map-canvas" aria-label="Інтерактивна карта України"></div>

            <header class="topbar">
                <div class="brand-block">
                    <span class="status-dot"></span>
                    <div>
                        <p class="eyebrow">Карта земельних ділянок</p>
                        <h1>Kadastr View</h1>
                    </div>
                </div>

                <div class="search-wrap">
                    <form class="search-panel" @submit.prevent="submitSearch">
                        <Search class="search-icon" :size="18" aria-hidden="true" />
                        <label class="search-field">
                            <input
                                v-model="searchQuery"
                                inputmode="numeric"
                                placeholder="5624685900:01:001:0123"
                                aria-label="Пошук за кадастровим номером"
                            >
                            <span v-if="searchStatus" class="search-status">{{ searchStatus }}</span>
                        </label>
                        <button type="submit">Знайти</button>
                    </form>
                </div>
            </header>

            <aside class="parcel-panel">
                <div class="panel-header">
                    <MapPinned :size="19" aria-hidden="true" />
                    <div>
                        <p class="eyebrow">Вибрана ділянка</p>
                        <h2>{{ selectedParcel?.cadastral_number ?? 'Демо-ділянка' }}</h2>
                    </div>
                </div>

                <dl class="parcel-grid">
                    <div>
                        <dt>Площа</dt>
                        <dd>{{ selectedParcel?.area.declared ?? '—' }} га</dd>
                    </div>
                    <div>
                        <dt>Статус</dt>
                        <dd>{{ selectedParcel?.freshness_status ?? 'demo' }}</dd>
                    </div>
                    <div>
                        <dt>Джерело</dt>
                        <dd>{{ selectedParcel?.source.name ?? 'Seed dataset' }}</dd>
                    </div>
                    <div>
                        <dt>Оновлено</dt>
                        <dd>{{ selectedParcel?.source.updated_at ?? '2026-07-14' }}</dd>
                    </div>
                </dl>

                <p class="disclaimer">
                    Поточний шар містить відкриті довідкові геодані. Це не офіційний кадастровий витяг.
                </p>
            </aside>

            <aside :class="['legend-panel', { 'is-collapsed': legendCollapsed }]" aria-label="Умовні позначення карти">
                <header class="legend-header">
                    <h2>Умовні позначення</h2>
                    <button
                        type="button"
                        class="legend-toggle"
                        :title="legendCollapsed ? 'Розгорнути легенду' : 'Згорнути легенду'"
                        @click="legendCollapsed = !legendCollapsed"
                    >
                        <ChevronLeft :size="18" aria-hidden="true" />
                    </button>
                </header>

                <ul v-if="!legendCollapsed" class="legend-list">
                    <li v-for="item in legendItems" :key="item.label">
                        <span :class="['legend-symbol', item.kind]" :style="{ '--legend-color': item.color }"></span>
                        <span>{{ item.label }}</span>
                    </li>
                </ul>
            </aside>

            <div
                v-if="hoverTooltip"
                class="map-tooltip"
                :style="{ transform: `translate(${hoverTooltip.x}px, ${hoverTooltip.y}px)` }"
                role="tooltip"
            >
                <dl>
                    <div v-for="row in hoverTooltip.rows" :key="row.label">
                        <dt>{{ row.label }}:</dt>
                        <dd>{{ row.value }}</dd>
                    </div>
                </dl>
            </div>
        </section>
    </main>
</template>

<script setup lang="ts">
import { onMounted, ref, shallowRef } from 'vue';
import {
    ChevronLeft,
    MapPinned,
    Search,
} from '@lucide/vue';
import maplibregl, { LngLatBounds } from 'maplibre-gl';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import { absoluteApiUrl, apiUrl } from './api';

type Parcel = {
    cadastral_number: string;
    area: { declared: number; calculated: number; unit: string };
    freshness_status: string;
    source: { name: string; updated_at: string; official: boolean };
    centroid: { lat: number; lng: number };
};

type RenderedMapFeature = Feature<Geometry> & {
    source?: string;
};

type TooltipRow = {
    label: string;
    value: string;
};

type HoverTooltip = {
    x: number;
    y: number;
    rows: TooltipRow[];
};

type ExternalLookup = {
    centroid: {
        lat: number;
        lng: number;
    };
    source_url: string;
};

type RegionHint = {
    center: [number, number];
    zoom: number;
    name: string;
};

const mapContainer = ref<HTMLDivElement | null>(null);
const mapInstance = shallowRef<maplibregl.Map | null>(null);
const searchQuery = ref('');
const searchStatus = ref('');
const selectedParcel = ref<Parcel | null>(null);
const hoverTooltip = ref<HoverTooltip | null>(null);
const legendCollapsed = ref(false);
const mapStatus = ref('завантаження карти');
const externalKadastrEnabled = true;
const cadastralRegionHints: Record<string, RegionHint> = {
    '01': { center: [34.35, 45.2], zoom: 9, name: 'АР Крим' },
    '05': { center: [28.47, 49.23], zoom: 9, name: 'Вінницька область' },
    '07': { center: [25.32, 50.75], zoom: 9, name: 'Волинська область' },
    '12': { center: [35.05, 48.46], zoom: 9, name: 'Дніпропетровська область' },
    '14': { center: [37.8, 48.02], zoom: 9, name: 'Донецька область' },
    '18': { center: [28.66, 50.25], zoom: 9, name: 'Житомирська область' },
    '21': { center: [22.3, 48.62], zoom: 9, name: 'Закарпатська область' },
    '23': { center: [35.17, 47.84], zoom: 9, name: 'Запорізька область' },
    '26': { center: [24.71, 48.92], zoom: 9, name: 'Івано-Франківська область' },
    '32': { center: [30.52, 50.35], zoom: 9, name: 'Київська область' },
    '35': { center: [32.26, 48.51], zoom: 9, name: 'Кіровоградська область' },
    '44': { center: [39.31, 48.57], zoom: 9, name: 'Луганська область' },
    '46': { center: [24.03, 49.84], zoom: 9, name: 'Львівська область' },
    '48': { center: [31.99, 46.98], zoom: 9, name: 'Миколаївська область' },
    '51': { center: [30.73, 46.48], zoom: 9, name: 'Одеська область' },
    '53': { center: [34.55, 49.59], zoom: 9, name: 'Полтавська область' },
    '56': { center: [26.25, 50.62], zoom: 9, name: 'Рівненська область' },
    '59': { center: [34.8, 50.91], zoom: 9, name: 'Сумська область' },
    '61': { center: [25.59, 49.55], zoom: 9, name: 'Тернопільська область' },
    '63': { center: [36.23, 49.99], zoom: 9, name: 'Харківська область' },
    '65': { center: [32.62, 46.64], zoom: 9, name: 'Херсонська область' },
    '68': { center: [26.99, 49.42], zoom: 9, name: 'Хмельницька область' },
    '71': { center: [32.06, 49.44], zoom: 9, name: 'Черкаська область' },
    '73': { center: [25.94, 48.29], zoom: 9, name: 'Чернівецька область' },
    '74': { center: [31.29, 51.5], zoom: 9, name: 'Чернігівська область' },
    '80': { center: [30.52, 50.45], zoom: 11, name: 'Київ' },
    '85': { center: [33.52, 44.61], zoom: 11, name: 'Севастополь' },
};
const legendItems = [
    { label: 'Державна / комунальна власність', color: '#3388ff', kind: 'swatch' },
    { label: 'Приватна власність', color: '#e69f00', kind: 'swatch' },
    { label: 'Форма власності невідома', color: '#94a3b8', kind: 'swatch' },
    { label: 'Водний ресурс', color: '#74b9ff', kind: 'swatch' },
    { label: 'Вибрана ділянка', color: '#d90b12', kind: 'swatch' },
];

onMounted(() => {
    if (!mapContainer.value) {
        return;
    }

    const map = new maplibregl.Map({
        container: mapContainer.value,
        style: {
            version: 8,
            sources: {
                osm: {
                    type: 'raster',
                    tiles: [
                        'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
                        'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
                        'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
                    ],
                    tileSize: 256,
                    attribution: '© OpenStreetMap contributors',
                },
            },
            layers: [
                {
                    id: 'map-background',
                    type: 'background',
                    paint: {
                        'background-color': '#cfded2',
                    },
                },
                {
                    id: 'osm',
                    type: 'raster',
                    source: 'osm',
                    paint: {
                        'raster-opacity': 1,
                    },
                },
            ],
        },
        center: [31.1656, 48.3794],
        zoom: 5.2,
        maxZoom: 22,
    });

    mapInstance.value = map;
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');

    map.on('error', (event) => {
        console.error('MapLibre error', event.error);
        mapStatus.value = 'помилка карти';
    });

    map.once('load', async () => {
        mapStatus.value = 'карта готова';
        addExternalKadastrLayer(map);
        const geojson = await loadParcelLayer();
        bindMapInteractions(map);

        if (geojson.features.length > 0) {
            map.fitBounds(boundsForFeatures(geojson.features), { padding: 72, duration: 0 });
        }
    });
});

async function searchParcel(zoomToGeometry = true, knownFeature?: Feature<Geometry>) {
    const manualQuery = searchQuery.value.trim();

    if (manualQuery === '') {
        searchStatus.value = '';
        return;
    }

    searchStatus.value = 'Шукаю ділянку...';

    const response = await fetch(apiUrl(`/api/v1/parcels/${encodeURIComponent(manualQuery)}`));
    const payload = await response.json();

    const geometryResponse = await fetch(apiUrl(`/api/v1/parcels/${encodeURIComponent(manualQuery)}/geometry`));
    const geometryPayload = await geometryResponse.json();
    const feature = geometryPayload.data as Feature<Geometry> | null;

    let renderedFeature = knownFeature ? (knownFeature as RenderedMapFeature) : findVisibleFeatureByNumber(manualQuery);
    let selectedFeature = renderedFeature ?? (feature?.geometry ? feature : null);

    if (!selectedFeature?.geometry && zoomToGeometry) {
        renderedFeature = await findFeatureAfterExternalLookup(manualQuery);
        selectedFeature = renderedFeature;
    }

    if (!selectedFeature?.geometry && zoomToGeometry) {
        renderedFeature = await findFeatureAfterRegionalJump(manualQuery);
        selectedFeature = renderedFeature;
    }

    if (selectedFeature?.geometry) {
        highlightSelectedFeature(selectedFeature);
        selectedParcel.value = renderedFeature
            ? parcelFromFeature(renderedFeature, manualQuery)
            : payload.data;
        searchStatus.value = 'Знайдено';
    } else {
        searchStatus.value = 'Не знайдено. Потрібен глобальний індекс ділянок';
    }

    if (zoomToGeometry && selectedFeature?.geometry && mapInstance.value) {
        mapInstance.value.fitBounds(boundsForGeometry(selectedFeature.geometry), {
            padding: 92,
            maxZoom: 16,
            duration: 700,
        });
    }
}

async function findFeatureAfterExternalLookup(cadastralNumber: string): Promise<RenderedMapFeature | null> {
    const map = mapInstance.value;

    if (!map) {
        return null;
    }

    searchStatus.value = 'Шукаю координати ділянки...';

    const response = await fetch(apiUrl(`/api/v1/search/cadastral-lookup?number=${encodeURIComponent(cadastralNumber)}`));

    if (!response.ok) {
        return null;
    }

    const payload = await response.json() as { data: ExternalLookup | null };

    if (!payload.data) {
        return null;
    }

    map.easeTo({
        center: [payload.data.centroid.lng, payload.data.centroid.lat],
        zoom: 16,
        duration: 700,
    });

    await waitForMapIdle(map);
    await sleep(600);
    searchStatus.value = 'Перевіряю ділянку в завантажених tiles...';

    return retryVisibleFeatureSearch(cadastralNumber, 5);
}

async function findFeatureAfterRegionalJump(cadastralNumber: string): Promise<RenderedMapFeature | null> {
    const map = mapInstance.value;
    const hint = regionHintForCadastralNumber(cadastralNumber);

    if (!map || !hint) {
        return null;
    }

    searchStatus.value = `Переходжу в ${hint.name}...`;
    map.easeTo({
        center: hint.center,
        zoom: hint.zoom,
        duration: 650,
    });

    await waitForMapIdle(map);
    await sleep(350);
    searchStatus.value = 'Перевіряю завантажені кадастрові tiles...';

    let feature = await retryVisibleFeatureSearch(cadastralNumber, 3);

    if (feature?.geometry) {
        return feature;
    }

    searchStatus.value = `Наближаю ${hint.name} для детальніших tiles...`;
    map.easeTo({
        center: hint.center,
        zoom: Math.max(hint.zoom, 11.5),
        duration: 650,
    });

    await waitForMapIdle(map);
    await sleep(500);
    feature = await retryVisibleFeatureSearch(cadastralNumber, 3);

    return feature;
}

function regionHintForCadastralNumber(cadastralNumber: string): RegionHint | null {
    const normalizedNumber = cadastralNumber.replace(/\D/g, '');

    return cadastralRegionHints[normalizedNumber.slice(0, 2)] ?? null;
}

function waitForMapIdle(map: maplibregl.Map): Promise<void> {
    return new Promise((resolve) => {
        map.once('idle', () => resolve());
    });
}

async function retryVisibleFeatureSearch(cadastralNumber: string, attempts: number): Promise<RenderedMapFeature | null> {
    for (let index = 0; index < attempts; index++) {
        const feature = findVisibleFeatureByNumber(cadastralNumber);

        if (feature?.geometry) {
            return feature;
        }

        await sleep(250);
    }

    return null;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        window.setTimeout(resolve, ms);
    });
}

async function submitSearch() {
    await searchParcel(true);
}

function bindMapInteractions(map: maplibregl.Map): void {
    map.on('click', async (event) => {
        const feature = findInteractiveFeature(map, event.point);

        if (!feature?.geometry) {
            return;
        }

        await selectRenderedFeature(feature);
    });

    map.on('mousemove', (event) => {
        const feature = findInteractiveFeature(map, event.point);
        const hasFeature = Boolean(feature?.geometry);

        map.getCanvas().style.cursor = hasFeature ? 'pointer' : '';
        hoverTooltip.value = feature?.geometry ? tooltipFromFeature(feature, event.point) : null;
        updateHoveredFeature(feature?.geometry ? feature : null);
    });

    map.on('mouseleave', () => {
        map.getCanvas().style.cursor = '';
        hoverTooltip.value = null;
        updateHoveredFeature(null);
    });
}

function findInteractiveFeature(map: maplibregl.Map, point: maplibregl.PointLike): RenderedMapFeature | undefined {
    const zoom = map.getZoom();
    const layerPriority = zoom >= 11
        ? ['external-kadastr-land-fill', 'external-kadastr-polygons-fill']
        : ['external-kadastr-polygons-fill', 'parcel-fill'];

    for (const layerId of layerPriority) {
        if (!map.getLayer(layerId)) {
            continue;
        }

        const feature = map.queryRenderedFeatures(point, { layers: [layerId] })[0] as RenderedMapFeature | undefined;

        if (feature?.geometry) {
            return feature;
        }
    }

    return undefined;
}

function tooltipFromFeature(feature: RenderedMapFeature, point: maplibregl.PointLike): HoverTooltip {
    const properties = feature.properties ?? {};
    const cadastralNumber = stringProperty(properties.cadastral_number)
        ?? stringProperty(properties.cadnum)
        ?? stringProperty(properties.cad_num)
        ?? stringProperty(properties.parcels)
        ?? stringProperty(properties.id)
        ?? stringProperty(properties.address)
        ?? 'Вибраний полігон';
    const purpose = stringProperty(properties.purpose)
        ?? stringProperty(properties.purpose_code)
        ?? stringProperty(properties.use)
        ?? stringProperty(properties.landuse);
    const category = stringProperty(properties.category)
        ?? stringProperty(properties.land_category)
        ?? stringProperty(properties.source_name)
        ?? (feature.source === 'external-kadastr' ? 'Кадастровий шар' : null);
    const ownership = stringProperty(properties.ownership)
        ?? stringProperty(properties.ownership_type)
        ?? ownershipLabel(stringProperty(properties.ownership_category));
    const area = formatArea(numericProperty(properties.area_declared) ?? numericProperty(properties.area));

    const rows = [
        { label: 'Номер', value: cadastralNumber },
        purpose ? { label: 'Призначення', value: purpose } : null,
        category ? { label: 'Категорія', value: category } : null,
        ownership ? { label: 'Власність', value: ownership } : null,
        area ? { label: 'Площа', value: area } : null,
    ].filter((row): row is TooltipRow => row !== null);

    const { x, y } = point as { x: number; y: number };

    return {
        x: x + 18,
        y: y + 18,
        rows,
    };
}

async function selectRenderedFeature(feature: RenderedMapFeature): Promise<void> {
    const properties = feature.properties ?? {};
    const selectedFeature = toPlainFeature(feature);
    const cadastralNumber = stringProperty(properties.cadastral_number)
        ?? stringProperty(properties.cadnum)
        ?? stringProperty(properties.cad_num)
        ?? stringProperty(properties.parcels)
        ?? stringProperty(properties.id)
        ?? 'Вибраний полігон';

    highlightSelectedFeature(selectedFeature);
    searchStatus.value = '';

    if (stringProperty(properties.cadastral_number)) {
        await searchParcel(false, selectedFeature);

        return;
    }

    selectedParcel.value = parcelFromFeature(feature, cadastralNumber);
}

function findVisibleFeatureByNumber(cadastralNumber: string): RenderedMapFeature | null {
    const map = mapInstance.value;

    if (!map) {
        return null;
    }

    const normalizedNumber = cadastralNumber.replace(/\s+/g, '');
    const layers = [
        'external-kadastr-land-fill',
        'external-kadastr-polygons-fill',
        'parcel-fill',
    ];

    for (const layerId of layers) {
        if (!map.getLayer(layerId)) {
            continue;
        }

        const match = map.queryRenderedFeatures({ layers: [layerId] })
            .find((feature) => featureMatchesNumber(feature as RenderedMapFeature, normalizedNumber)) as RenderedMapFeature | undefined;

        if (match?.geometry) {
            return match;
        }
    }

    return null;
}

function featureMatchesNumber(feature: RenderedMapFeature, normalizedNumber: string): boolean {
    const properties = feature.properties ?? {};
    const candidates = [
        properties.cadastral_number,
        properties.cadnum,
        properties.cad_num,
        properties.parcels,
        properties.id,
    ];

    return candidates.some((value) => stringProperty(value)?.replace(/\s+/g, '') === normalizedNumber);
}

function parcelFromFeature(feature: RenderedMapFeature, cadastralNumber: string): Parcel {
    const properties = feature.properties ?? {};
    const ownership = stringProperty(properties.ownership)
        ?? stringProperty(properties.ownership_type)
        ?? ownershipLabel(stringProperty(properties.ownership_category));
    const sourceName = stringProperty(properties.source_name)
        ?? (feature.source === 'external-kadastr' ? 'kadastrova-karta vector tiles' : 'Відкритий геошар');

    return {
        cadastral_number: cadastralNumber,
        area: {
            declared: numericProperty(properties.area_declared) ?? numericProperty(properties.area) ?? 0,
            calculated: 0,
            unit: 'ha',
        },
        freshness_status: ownership ?? 'open_reference',
        source: {
            name: sourceName,
            updated_at: '2026-07-14',
            official: false,
        },
        centroid: { lat: 0, lng: 0 },
    };
}

function stringProperty(value: unknown): string | null {
    if (typeof value !== 'string' && typeof value !== 'number') {
        return null;
    }

    const normalized = String(value).trim();

    return normalized === '' ? null : normalized;
}

function numericProperty(value: unknown): number | null {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }

    if (typeof value !== 'string') {
        return null;
    }

    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : null;
}

function formatArea(value: number | null): string | null {
    if (value === null) {
        return null;
    }

    const formatted = new Intl.NumberFormat('uk-UA', {
        maximumFractionDigits: 4,
    }).format(value);

    return `${formatted} га`;
}

function ownershipLabel(category: string | null): string | null {
    if (category === 'state_communal') {
        return 'Державна / комунальна власність';
    }

    if (category === 'private') {
        return 'Приватна власність';
    }

    if (category === 'water_resource') {
        return 'Водний ресурс';
    }

    if (category === 'unknown') {
        return 'Форма власності невідома';
    }

    return null;
}

async function loadParcelLayer(): Promise<FeatureCollection> {
    const response = await fetch(apiUrl('/api/v1/parcels.geojson?limit=12000'));
    const geojson = await response.json() as FeatureCollection;
    const map = mapInstance.value;

    if (!map) {
        return geojson;
    }

    map.addSource('parcels', {
        type: 'geojson',
        data: geojson,
    });

    map.addSource('selected-parcel', {
        type: 'geojson',
        data: emptyFeatureCollection(),
    });

    map.addSource('hovered-parcel', {
        type: 'geojson',
        data: emptyFeatureCollection(),
    });

    map.addLayer({
        id: 'parcel-fill',
        type: 'fill',
        source: 'parcels',
        filter: ['!=', ['get', 'source_name'], 'geoBoundaries Ukraine ADM2'],
        maxzoom: 11,
        paint: {
            'fill-color': [
                'case',
                ['==', ['get', 'ownership_category'], 'state_communal'],
                '#3388ff',
                ['==', ['get', 'ownership_category'], 'private'],
                '#e69f00',
                ['==', ['get', 'ownership_category'], 'water_resource'],
                '#74b9ff',
                '#94a3b8',
            ],
            'fill-opacity': [
                'interpolate',
                ['linear'],
                ['zoom'],
                5,
                0.08,
                10,
                0.12,
                14,
                0.18,
            ],
        },
    });

    map.addLayer({
        id: 'parcel-line',
        type: 'line',
        source: 'parcels',
        filter: ['!=', ['get', 'source_name'], 'geoBoundaries Ukraine ADM2'],
        maxzoom: 11,
        paint: {
            'line-color': [
                'case',
                ['==', ['get', 'ownership_category'], 'state_communal'],
                '#3388ff',
                ['==', ['get', 'ownership_category'], 'private'],
                '#e69f00',
                ['==', ['get', 'ownership_category'], 'water_resource'],
                '#3d9cff',
                '#94a3b8',
            ],
            'line-width': [
                'interpolate',
                ['linear'],
                ['zoom'],
                5,
                0.35,
                10,
                0.55,
                14,
                0.9,
            ],
            'line-opacity': [
                'interpolate',
                ['linear'],
                ['zoom'],
                5,
                0.42,
                10,
                0.68,
                14,
                0.88,
            ],
        },
    });

    map.addLayer({
        id: 'parcel-admin-line',
        type: 'line',
        source: 'parcels',
        filter: ['==', ['get', 'source_name'], 'geoBoundaries Ukraine ADM2'],
        paint: {
            'line-color': '#355a42',
            'line-width': [
                'interpolate',
                ['linear'],
                ['zoom'],
                5,
                0.8,
                10,
                1.2,
                14,
                1.8,
            ],
            'line-opacity': [
                'interpolate',
                ['linear'],
                ['zoom'],
                5,
                0.42,
                10,
                0.28,
                14,
                0.18,
            ],
        },
    });

    map.addLayer({
        id: 'parcel-hover-fill',
        type: 'fill',
        source: 'hovered-parcel',
        paint: {
            'fill-color': '#5fb8d2',
            'fill-opacity': 0.42,
        },
    });

    map.addLayer({
        id: 'parcel-hover-line',
        type: 'line',
        source: 'hovered-parcel',
        paint: {
            'line-color': '#2c8fb0',
            'line-width': [
                'interpolate',
                ['linear'],
                ['zoom'],
                5,
                1.4,
                12,
                2.4,
                16,
                3.4,
            ],
            'line-opacity': 0.95,
        },
    });

    map.addLayer({
        id: 'parcel-selected-fill',
        type: 'fill',
        source: 'selected-parcel',
        paint: {
            'fill-color': '#d90b12',
            'fill-opacity': 0.34,
        },
    });

    map.addLayer({
        id: 'parcel-selected-line',
        type: 'line',
        source: 'selected-parcel',
        paint: {
            'line-color': '#d90b12',
            'line-width': [
                'interpolate',
                ['linear'],
                ['zoom'],
                5,
                1.8,
                10,
                3,
                14,
                4.5,
            ],
            'line-opacity': 1,
        },
    });

    return geojson;
}

function addExternalKadastrLayer(map: maplibregl.Map): void {
    if (!externalKadastrEnabled || map.getSource('external-kadastr')) {
        return;
    }

    map.addSource('external-kadastr', {
        type: 'vector',
        tiles: [absoluteApiUrl('/api/v1/tiles/kadastr/{z}/{x}/{y}.pbf')],
        minzoom: 3,
        maxzoom: 16,
        attribution: 'Кадастровий шар: kadastrova-karta.com',
    });

    map.addLayer({
        id: 'external-kadastr-polygons-fill',
        type: 'fill',
        source: 'external-kadastr',
        'source-layer': 'polygons',
        minzoom: 3,
        maxzoom: 12,
        paint: {
            'fill-color': cadastralOwnershipFillColor(),
            'fill-opacity': 0.12,
        },
    });

    map.addLayer({
        id: 'external-kadastr-polygons-line',
        type: 'line',
        source: 'external-kadastr',
        'source-layer': 'polygons',
        minzoom: 3,
        maxzoom: 12,
        paint: {
            'line-color': cadastralOwnershipLineColor(),
            'line-width': [
                'interpolate',
                ['linear'],
                ['zoom'],
                5,
                0.35,
                11,
                0.85,
            ],
            'line-opacity': 0.72,
        },
    });

    map.addLayer({
        id: 'external-kadastr-land-fill',
        type: 'fill',
        source: 'external-kadastr',
        'source-layer': 'land_polygons',
        minzoom: 11,
        paint: {
            'fill-color': cadastralOwnershipFillColor(),
            'fill-opacity': [
                'case',
                ['boolean', ['feature-state', 'hover'], false],
                0.6,
                0.2,
            ],
        },
    });

    map.addLayer({
        id: 'external-kadastr-land-line',
        type: 'line',
        source: 'external-kadastr',
        'source-layer': 'land_polygons',
        minzoom: 11,
        paint: {
            'line-color': cadastralOwnershipLineColor(),
            'line-width': [
                'interpolate',
                ['linear'],
                ['zoom'],
                11,
                0.55,
                16,
                1.05,
            ],
            'line-opacity': 0.88,
        },
    });
}

function cadastralOwnershipFillColor(): maplibregl.ExpressionSpecification {
    return [
        'case',
        ['==', ['get', 'ownership'], null],
        'rgba(148, 163, 184, 1)',
        ['==', ['get', 'ownership'], 'Не визначено'],
        'rgba(148, 163, 184, 1)',
        [
            'in',
            ['get', 'ownership'],
            ['literal', ['Державна власність', 'Комунальна власність']],
        ],
        'rgba(51, 136, 255, 0.7)',
        'rgba(230, 159, 0, 0.7)',
    ];
}

function cadastralOwnershipLineColor(): maplibregl.ExpressionSpecification {
    return [
        'case',
        ['==', ['get', 'ownership'], null],
        'rgba(163, 163, 163, 1)',
        ['==', ['get', 'ownership'], 'Не визначено'],
        'rgba(163, 163, 163, 1)',
        [
            'in',
            ['get', 'ownership'],
            ['literal', ['Державна власність', 'Комунальна власність']],
        ],
        'rgba(51, 136, 255, 0.8)',
        'rgba(230, 159, 0, 0.9)',
    ];
}

function highlightSelectedFeature(feature: Feature<Geometry>): void {
    const map = mapInstance.value;

    if (!map || !feature.geometry) {
        return;
    }

    const selectedSource = map.getSource('selected-parcel') as maplibregl.GeoJSONSource | undefined;
    const selectedCollection: FeatureCollection = {
        type: 'FeatureCollection',
        features: [toPlainFeature(feature)],
    };

    if (selectedSource) {
        selectedSource.setData(selectedCollection);
        moveLayerToTop(map, 'parcel-selected-fill');
        moveLayerToTop(map, 'parcel-selected-line');
    }
}

function moveLayerToTop(map: maplibregl.Map, layerId: string): void {
    if (map.getLayer(layerId)) {
        map.moveLayer(layerId);
    }
}

function updateHoveredFeature(feature: Feature<Geometry> | null): void {
    const map = mapInstance.value;

    if (!map) {
        return;
    }

    const hoveredSource = map.getSource('hovered-parcel') as maplibregl.GeoJSONSource | undefined;

    if (!hoveredSource) {
        return;
    }

    hoveredSource.setData(feature?.geometry ? {
        type: 'FeatureCollection',
        features: [toPlainFeature(feature)],
    } : emptyFeatureCollection());
}

function toPlainFeature(feature: Feature<Geometry>): Feature<Geometry> {
    return {
        type: 'Feature',
        id: feature.id,
        geometry: structuredClone(feature.geometry),
        properties: { ...(feature.properties ?? {}) },
    };
}

function emptyFeatureCollection(): FeatureCollection {
    return {
        type: 'FeatureCollection',
        features: [],
    };
}

function boundsForFeatures(features: Feature<Geometry>[]): LngLatBounds {
    const bounds = new LngLatBounds();

    for (const feature of features) {
        extendBounds(bounds, feature.geometry);
    }

    return bounds;
}

function boundsForGeometry(geometry: Geometry): LngLatBounds {
    const bounds = new LngLatBounds();
    extendBounds(bounds, geometry);

    return bounds;
}

function extendBounds(bounds: LngLatBounds, geometry: Geometry): void {
    if (geometry.type === 'Polygon') {
        for (const ring of geometry.coordinates) {
            for (const point of ring) {
                bounds.extend([point[0], point[1]]);
            }
        }
    }

    if (geometry.type === 'MultiPolygon') {
        for (const polygon of geometry.coordinates) {
            for (const ring of polygon) {
                for (const point of ring) {
                    bounds.extend([point[0], point[1]]);
                }
            }
        }
    }
}

</script>
