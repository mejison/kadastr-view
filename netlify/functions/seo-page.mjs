import { MongoClient } from 'mongodb';

const siteUrl = 'https://kadastrview.online';
const pageHeaders = {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'public, max-age=300, s-maxage=3600',
};

let mongoClientPromise;
let mongoUnavailableUntil = 0;

export async function handler(event, context = {}) {
    context.callbackWaitsForEmptyEventLoop = false;

    if (event.httpMethod !== 'GET' && event.httpMethod !== 'HEAD') {
        return htmlResponse('Method not allowed', 405);
    }

    try {
        const path = normalizedPath(event.path);

        if (path.startsWith('dilyanka/')) {
            return parcelSeoPage(decodeURIComponent(path.replace(/^dilyanka\/+/, '')));
        }

        return territorySeoPage(path);
    } catch (error) {
        console.error(error);

        return htmlResponse(renderBasePage({
            canonicalPath: '/',
            title: 'KadastrView - кадастрова карта України онлайн',
            description: 'KadastrView - кадастрова карта України онлайн: пошук земельних ділянок за кадастровим номером, межі, площа, власність, призначення та супутникові шари.',
            heading: 'Кадастрова карта України онлайн',
            body: '<p>Пошук земельних ділянок за кадастровим номером, перегляд меж, площі, форми власності, цільового призначення та адреси.</p>',
            structuredData: websiteSchema(),
        }), 200);
    }
}

async function parcelSeoPage(cadastralNumber) {
    const normalized = normalizeCadastralNumber(cadastralNumber);
    const parcel = await findParcel(normalized);
    const resource = parcel ? parcelToResource(parcel) : demoParcel(normalized);
    const title = `Земельна ділянка ${resource.cadastral_number} - KadastrView`;
    const description = parcelDescription(resource);
    const canonicalPath = `/dilyanka/${encodeURIComponent(resource.cadastral_number).replace(/%3A/gi, ':')}`;
    const rows = [
        ['Кадастровий номер', resource.cadastral_number],
        ['Площа', resource.area.declared ? `${formatArea(resource.area.declared)} га` : 'Дані відсутні'],
        ['Форма власності', resource.ownership_type?.name ?? 'Дані відсутні'],
        ['Цільове призначення', resource.purpose?.name ?? resource.purpose?.code ?? 'Дані відсутні'],
        ['Категорія земель', resource.land_category?.name ?? 'Дані відсутні'],
        ['Адреса', resource.address ?? 'Україна'],
    ];
    const body = `
        <p>${escapeHtml(description)}</p>
        <dl>
            ${rows.map(([label, value]) => `
                <div>
                    <dt>${escapeHtml(label)}</dt>
                    <dd>${escapeHtml(String(value))}</dd>
                </div>
            `).join('')}
        </dl>
        <p>Інтерактивна карта нижче відкриє межі цієї ділянки, якщо геометрія доступна у поточних відкритих шарах або базі KadastrView.</p>
    `;

    return htmlResponse(renderBasePage({
        canonicalPath,
        title,
        description,
        heading: `Земельна ділянка ${resource.cadastral_number}`,
        body,
        structuredData: parcelSchema(resource, canonicalPath),
    }));
}

function territorySeoPage(path) {
    const [type, ...slugParts] = path.split('/').filter(Boolean);
    const slug = slugParts.join('/');
    const territory = territoryLabel(type, slug);

    if (!territory) {
        return htmlResponse(renderBasePage({
            canonicalPath: '/',
            title: 'KadastrView - кадастрова карта України онлайн',
            description: 'Кадастрова карта України онлайн: пошук земельних ділянок за кадастровим номером, межі, площа, власність і призначення.',
            heading: 'Кадастрова карта України онлайн',
            body: '<p>Знайдіть земельну ділянку за кадастровим номером і перегляньте межі на інтерактивній карті України.</p>',
            structuredData: websiteSchema(),
        }));
    }

    const title = `Кадастрова карта ${territory.genitive} - KadastrView`;
    const description = `Кадастрова карта ${territory.genitive}: пошук земельних ділянок, межі, площа, форма власності, цільове призначення та відкриті кадастрові шари.`;

    return htmlResponse(renderBasePage({
        canonicalPath: `/${type}/${encodeURIComponent(slug)}`,
        title,
        description,
        heading: `Кадастрова карта ${territory.genitive}`,
        body: `
            <p>${escapeHtml(description)}</p>
            <p>Введіть кадастровий номер у пошук KadastrView, щоб перейти до конкретної земельної ділянки на карті.</p>
        `,
        structuredData: websiteSchema(),
    }));
}

function renderBasePage({ canonicalPath, title, description, heading, body, structuredData }) {
    const canonicalUrl = `${siteUrl}${canonicalPath}`;
    const jsonLd = JSON.stringify(structuredData).replace(/</g, '\\u003c');
    const assets = pageAssets();

    return `<!doctype html>
<html lang="uk">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
        <meta name="theme-color" content="#1f6f54">
        <meta name="description" content="${escapeHtml(description)}">
        <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">
        <meta name="application-name" content="KadastrView">
        <meta name="apple-mobile-web-app-title" content="KadastrView">
        <meta name="format-detection" content="telephone=no">
        <meta name="geo.region" content="UA">
        <meta name="geo.placename" content="Україна">
        <link rel="canonical" href="${escapeHtml(canonicalUrl)}">
        <link rel="icon" href="/favicon.svg" type="image/svg+xml">
        <link rel="icon" href="/favicon-48.png" type="image/png" sizes="48x48">
        <link rel="apple-touch-icon" href="/apple-touch-icon.png">
        <link rel="manifest" href="/site.webmanifest">
        <style>
            html, body, #app { height: 100%; min-height: 100%; }
            body { margin: 0; background: #f4f1e8; }
            .seo-static {
                position: absolute;
                width: 1px;
                height: 1px;
                overflow: hidden;
                clip: rect(0 0 0 0);
                white-space: nowrap;
                clip-path: inset(50%);
            }
        </style>
        ${assets.stylesheet ? `<link rel="stylesheet" href="${assets.stylesheet}">` : ''}
        <meta property="og:locale" content="uk_UA">
        <meta property="og:type" content="website">
        <meta property="og:site_name" content="KadastrView">
        <meta property="og:title" content="${escapeHtml(title)}">
        <meta property="og:description" content="${escapeHtml(description)}">
        <meta property="og:url" content="${escapeHtml(canonicalUrl)}">
        <meta property="og:image" content="${siteUrl}/og-image.png">
        <meta property="og:image:type" content="image/png">
        <meta property="og:image:width" content="1200">
        <meta property="og:image:height" content="630">
        <meta name="twitter:card" content="summary_large_image">
        <meta name="twitter:title" content="${escapeHtml(title)}">
        <meta name="twitter:description" content="${escapeHtml(description)}">
        <meta name="twitter:image" content="${siteUrl}/og-image.png">
        <script type="application/ld+json">${jsonLd}</script>
        <title>${escapeHtml(title)}</title>
    </head>
    <body>
        <section class="seo-static" aria-label="${escapeHtml(heading)}">
            <h1>${escapeHtml(heading)}</h1>
            ${body}
        </section>
        <div id="app"></div>
        <script type="module" src="${assets.script}"></script>
    </body>
</html>`;
}

function pageAssets() {
    return process.env.NETLIFY_DEV === 'true'
        ? { script: '/resources/js/app.ts', stylesheet: null }
        : { script: '/assets/app.js', stylesheet: '/assets/app.css' };
}

function htmlResponse(body, statusCode = 200) {
    return { statusCode, headers: pageHeaders, body };
}

function normalizedPath(path) {
    return String(path ?? '')
        .replace(/^\/\.netlify\/functions\/seo-page\/?/, '')
        .replace(/^\/+/, '')
        .replace(/\/+$/, '');
}

async function findParcel(normalizedNumber) {
    const db = await mongoDb();

    if (!db || normalizedNumber === '') {
        return null;
    }

    return db.collection('parcels').findOne({
        $or: [
            { cadastral_number_normalized: normalizedNumber },
            { cadastral_number: normalizedNumber },
            { cadnum: normalizedNumber },
        ],
    });
}

function parcelToResource(parcel) {
    return {
        cadastral_number: parcel.cadastral_number ?? parcel.cadnum ?? '',
        area: {
            declared: parcel.area_declared ?? parcel.area ?? 0,
            unit: parcel.unit ?? 'га',
        },
        ownership_type: parcel.ownership_type ? { name: parcel.ownership_type } : null,
        land_category: parcel.land_category ? { name: parcel.land_category } : null,
        purpose: parcel.purpose_code ? { code: parcel.purpose_code, name: parcel.purpose_name ?? null } : null,
        address: parcel.address ?? 'Україна',
        centroid: parcel.centroid ?? centroidFromGeometry(parcel.geometry ?? parcel.geometries?.find?.((item) => item.is_current !== false)?.geometry),
        source: {
            updated_at: parcel.source_updated_at ?? parcel.updated_at ?? null,
        },
    };
}

function demoParcel(cadastralNumber) {
    return {
        cadastral_number: cadastralNumber,
        area: { declared: 0, unit: 'га' },
        ownership_type: null,
        land_category: null,
        purpose: null,
        address: 'Україна',
        centroid: null,
        source: { updated_at: null },
    };
}

function parcelDescription(parcel) {
    const parts = [
        `Земельна ділянка ${parcel.cadastral_number} на кадастровій карті України`,
        parcel.area.declared ? `площа ${formatArea(parcel.area.declared)} га` : null,
        parcel.ownership_type?.name ? `форма власності: ${parcel.ownership_type.name}` : null,
        parcel.land_category?.name ? `категорія: ${parcel.land_category.name}` : null,
        parcel.address ? `адреса: ${parcel.address}` : null,
    ].filter(Boolean);

    return `${parts.join(', ')}. Перегляньте межі, призначення та розташування ділянки в KadastrView.`;
}

function parcelSchema(parcel, canonicalPath) {
    const url = `${siteUrl}${canonicalPath}`;
    const geo = parcel.centroid?.lat && parcel.centroid?.lng
        ? {
            '@type': 'GeoCoordinates',
            latitude: parcel.centroid.lat,
            longitude: parcel.centroid.lng,
        }
        : undefined;

    return {
        '@context': 'https://schema.org',
        '@graph': [
            websiteSchema(),
            {
                '@type': 'Place',
                '@id': `${url}#parcel`,
                name: `Земельна ділянка ${parcel.cadastral_number}`,
                url,
                description: parcelDescription(parcel),
                address: parcel.address,
                geo,
                additionalProperty: [
                    { '@type': 'PropertyValue', name: 'Кадастровий номер', value: parcel.cadastral_number },
                    { '@type': 'PropertyValue', name: 'Площа', value: parcel.area.declared ? `${formatArea(parcel.area.declared)} га` : 'Дані відсутні' },
                    { '@type': 'PropertyValue', name: 'Форма власності', value: parcel.ownership_type?.name ?? 'Дані відсутні' },
                    { '@type': 'PropertyValue', name: 'Категорія земель', value: parcel.land_category?.name ?? 'Дані відсутні' },
                ],
            },
        ],
    };
}

function websiteSchema() {
    return {
        '@type': 'WebSite',
        '@id': `${siteUrl}/#website`,
        name: 'KadastrView',
        alternateName: 'Кадастрова карта України онлайн',
        url: `${siteUrl}/`,
        inLanguage: 'uk-UA',
        potentialAction: {
            '@type': 'SearchAction',
            target: `${siteUrl}/dilyanka/{search_term_string}`,
            'query-input': 'required name=search_term_string',
        },
    };
}

function territoryLabel(type, slug) {
    const oblastNames = {
        vinnytska: 'Вінницької області',
        volynska: 'Волинської області',
        dnipropetrovska: 'Дніпропетровської області',
        donetska: 'Донецької області',
        zhytomyrska: 'Житомирської області',
        zakarpatska: 'Закарпатської області',
        zaporizka: 'Запорізької області',
        'ivano-frankivska': 'Івано-Франківської області',
        kyivska: 'Київської області',
        kirovohradska: 'Кіровоградської області',
        luhanska: 'Луганської області',
        lvivska: 'Львівської області',
        mykolaivska: 'Миколаївської області',
        odeska: 'Одеської області',
        poltavska: 'Полтавської області',
        rivnenska: 'Рівненської області',
        sumska: 'Сумської області',
        ternopilska: 'Тернопільської області',
        kharkivska: 'Харківської області',
        khersonska: 'Херсонської області',
        khmelnytska: 'Хмельницької області',
        cherkaska: 'Черкаської області',
        chernivetska: 'Чернівецької області',
        chernihivska: 'Чернігівської області',
        crimea: 'Автономної Республіки Крим',
        kyiv: 'міста Києва',
        sevastopol: 'міста Севастополя',
    };
    const name = slug
        ? slug.split('/').at(-1).replace(/-/g, ' ')
        : '';

    if (!name) {
        return null;
    }

    if (type === 'oblast' && oblastNames[slug]) {
        return { genitive: oblastNames[slug] };
    }

    const titleName = name.replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
    const labels = {
        oblast: `${titleName} області`,
        raion: `${titleName} району`,
        hromada: `${titleName} громади`,
        settlement: `населеного пункту ${titleName}`,
    };

    return labels[type] ? { genitive: labels[type] } : null;
}

function centroidFromGeometry(geometry) {
    if (!geometry) {
        return null;
    }

    const coordinates = [];
    collectCoordinates(geometry.coordinates, coordinates);

    if (coordinates.length === 0) {
        return null;
    }

    const sums = coordinates.reduce((carry, point) => {
        carry.lng += point[0];
        carry.lat += point[1];
        return carry;
    }, { lat: 0, lng: 0 });

    return {
        lat: sums.lat / coordinates.length,
        lng: sums.lng / coordinates.length,
    };
}

function collectCoordinates(value, output) {
    if (!Array.isArray(value)) {
        return;
    }

    if (typeof value[0] === 'number' && typeof value[1] === 'number') {
        output.push(value);
        return;
    }

    value.forEach((item) => collectCoordinates(item, output));
}

function normalizeCadastralNumber(value) {
    return String(value ?? '').trim().replace(/\s+/g, '');
}

function formatArea(value) {
    const number = Number(value);

    return Number.isFinite(number)
        ? number.toLocaleString('uk-UA', { maximumFractionDigits: 4 })
        : String(value);
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

async function mongoDb() {
    const uri = process.env.MONGODB_URI;

    if (!uri) {
        return null;
    }

    if (Date.now() < mongoUnavailableUntil) {
        return null;
    }

    mongoClientPromise ??= MongoClient.connect(uri, {
        maxPoolSize: 3,
        serverSelectionTimeoutMS: 4500,
        connectTimeoutMS: 4500,
        socketTimeoutMS: 10000,
    });

    try {
        const client = await mongoClientPromise;

        return client.db(process.env.MONGODB_DATABASE ?? 'kadastr_view');
    } catch (error) {
        mongoClientPromise = null;
        mongoUnavailableUntil = Date.now() + 60000;
        console.error('MongoDB connection unavailable', error);

        return null;
    }
}
