import { MongoClient } from 'mongodb';
import { eligibleOblastSlugs, regionStatsFor } from './region-stats.mjs';
import { canonicalParcelPath, isCadastralNumber, isOblastIndexable, isParcelIndexable } from './seo-indexability.mjs';
import { findIndexablePublicParcel, relatedPublicParcels, relatedPublicParcelsInCommunity } from './seo-parcel-data.mjs';
import { communityPageData, communityPath, indexableCommunityPages, isCommunityIndexable, validCommunityCode } from './community-page-data.mjs';
import { districtPageData, districtPath, indexableDistrictPages, isDistrictIndexable } from './district-page-data.mjs';
import { OBLASTS, oblastBySlug, oblastSlugByName } from './geo-seo-regions.mjs';

const siteUrl = 'https://kadastrview.online';
const indexRobots = 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1';
const noIndexRobots = 'noindex,follow';
const pageHeaders = { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=60, s-maxage=60, must-revalidate', 'netlify-cache-tag': 'seo-pages' };
let mongoClientPromise;
let mongoUnavailableUntil = 0;

export async function handler(event, context = {}) {
    context.callbackWaitsForEmptyEventLoop = false;
    if (!['GET', 'HEAD'].includes(event.httpMethod)) return htmlResponse('Method not allowed', 405, noIndexRobots);
    try {
        const path = normalizedPath(event.path);
        if (path.startsWith('dilyanka/')) return parcelSeoPage(decodeURIComponent(path.slice('dilyanka/'.length)));
        return contentPage(path);
    } catch (error) {
        console.error(error);
        return errorPage(500, 'Тимчасова помилка сервісу', 'Спробуйте оновити сторінку пізніше.');
    }
}

async function parcelSeoPage(cadastralNumber) {
    const normalized = normalizeCadastralNumber(cadastralNumber);
    if (!isCadastralNumber(normalized)) return errorPage(404, 'Ділянку не знайдено', 'Перевірте формат кадастрового номера та спробуйте ще раз.');
    const db = await mongoDb();
    const resource = await findIndexablePublicParcel(db, normalized);
    if (!resource) return errorPage(404, 'Ділянку не знайдено', 'У базі KadastrView немає достатньо публічних даних для цієї сторінки. Скористайтеся пошуком на карті.');
    if (!isParcelIndexable(resource)) return errorPage(404, 'Недостатньо даних про ділянку', 'Сторінка буде доступна, коли для ділянки з’являться достатні відкриті дані.');
    const canonicalPath = canonicalParcelPath(resource.cadastralNumber);
    const related = await relatedPublicParcels(db, resource);
    const communityRelated = related.length ? [] : await relatedPublicParcelsInCommunity(db, resource);
    const region = resource.regionSlug ? oblastBySlug.get(resource.regionSlug) : null;
    const community = resource.community;
    const breadcrumbs = [['Кадастрова карта', '/'], ...(region ? [[region.name, `/oblast/${resource.regionSlug}`]] : []), ...(community ? [[community.name, communityPath(community.katottg)]] : []), ['Земельна ділянка', canonicalPath]];
    const rows = [['Кадастровий номер', resource.cadastralNumber], ['Площа в записі оренди', `${formatArea(resource.areaHectares)} га`], ['Громада (визначено за координатами)', community?.name], ['Район', community?.district], ['Область', community?.oblast], ['Тип права', resource.useType], ['Код використання землі', resource.purpose], ['Розташування', resource.address], ['Джерело', resource.sourceName]].filter(([, value]) => value);
    const nearby = related.length ? related : communityRelated;
    const relatedMarkup = nearby.length ? `<h2>${related.length ? 'Інші ділянки за цією адресою' : 'Інші ділянки в цій громаді'}</h2><ul>${nearby.map((item) => `<li><a href="${canonicalParcelPath(item.cadastralNumber)}">${escapeHtml(item.cadastralNumber)}</a> — ${escapeHtml(formatArea(item.areaHectares))} га</li>`).join('')}</ul>` : '';
    const mapLink = '#app';
    const reportCta = `<section class="seo-cta" aria-labelledby="parcel-report-title"><h2 id="parcel-report-title">Замовити звіт по ділянці</h2><p>На інтерактивній карті доступне оформлення платного звіту для кадастрового номера ${escapeHtml(resource.cadastralNumber)}.</p><p><a href="${mapLink}">Відкрити карту та замовити звіт</a></p></section>`;
    return pageResponse({ canonicalPath, title: `Ділянка ${resource.cadastralNumber}: площа та розташування | KadastrView`, description: parcelDescription(resource), heading: `Земельна ділянка ${resource.cadastralNumber}`, breadcrumbs, body: `<p>${escapeHtml(parcelDescription(resource))}</p><dl class="seo-facts">${rows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(String(value))}</dd></div>`).join('')}</dl><p><a href="${mapLink}">Відкрити ділянку на інтерактивній карті</a>. Для юридично значущих дій перевіряйте відомості в офіційних реєстрах.</p>${reportCta}${relatedMarkup}${relatedLinks([...(community ? [[`Ділянки ${community.name} громади`, communityPath(community.katottg)]] : []), ['Пошук земельної ділянки за кадастровим номером', '/guides/poshuk-za-kadastrovym-nomerom'], ['Джерела та обмеження даних', '/data-sources']])}`, structuredData: parcelSchema(resource, canonicalPath, breadcrumbs) });
}

async function contentPage(path) {
    if (path === 'oblast') return pageResponse(await regionsHubPage());
    const pages = { about: aboutPage(), 'data-sources': dataSourcesPage(), contact: contactPage(), privacy: privacyPage(), terms: termsPage(), guides: guidesHubPage(), 'guides/kadastrovyi-nomer': cadastralNumberGuide(), 'guides/poshuk-za-kadastrovym-nomerom': searchGuide(), 'guides/yak-znayty-dilyanku': findParcelGuide() };
    if (pages[path]) return pageResponse(pages[path]);
    const oblastMatch = path.match(/^oblast\/([a-z-]+)$/);
    if (oblastMatch && oblastBySlug.has(oblastMatch[1])) return pageResponse(await regionPage(oblastMatch[1]));
    const districtMatch = path.match(/^raion\/([a-z-]+)\/([a-z0-9-]+)$/);
    if (districtMatch) return districtPage(districtMatch[1], districtMatch[2]);
    const communityMatch = path.match(/^hromada\/(UA\d{17})$/);
    if (communityMatch) return communityPage(communityMatch[1]);
    return errorPage(404, 'Сторінку не знайдено', 'Перейдіть на головну сторінку KadastrView, щоб скористатися кадастровою картою.');
}

async function communityPage(katottg) {
    if (!validCommunityCode(katottg)) return errorPage(404, 'Громаду не знайдено', 'Перевірте адресу сторінки громади.');
    const data = await communityPageData(await mongoDb(), katottg);
    if (!isCommunityIndexable(data)) return errorPage(404, 'Громаду не знайдено', 'Для цієї громади ще недостатньо координатно перевірених публічних даних.');
    const canonicalPath = communityPath(katottg);
    const oblastSlug = oblastSlugByName.get(data.oblast) ?? null;
    const breadcrumbs = [['Області України', '/oblast'], ...(oblastSlug ? [[data.oblast, `/oblast/${oblastSlug}`]] : []), [data.name, canonicalPath]];
    const district = data.district ? `<p>Район: ${escapeHtml(data.district)}.</p>` : '';
    const landUses = data.landUses.length ? `<h2>Поширені коди використання землі</h2><ul>${data.landUses.map((item) => `<li>${escapeHtml(item.name)} — ${formatInteger(item.count)} ділянок</li>`).join('')}</ul>` : '';
    const parcels = `<h2>Ділянки з перевіреною прив’язкою</h2><ul>${data.parcels.map((parcel) => `<li><a href="${canonicalParcelPath(parcel.cadastralNumber)}">${escapeHtml(parcel.cadastralNumber)}</a> — ${escapeHtml(formatArea(parcel.areaHectares))} га${parcel.purpose ? `, код ${escapeHtml(parcel.purpose)}` : ''}</li>`).join('')}</ul>`;
    const facts = [['Ділянок з повними публічними даними', formatInteger(data.parcelCount)], ['Сумарна площа у доступних записах', `${formatArea(data.totalArea)} га`]];
    const body = `<p>На сторінці зібрано відкриті записи про земельні ділянки, координати яких потрапляють у межі ${escapeHtml(data.name)}. Прив’язка громади визначена геопросторовим перетином центроїда ділянки з межею громади.</p>${district}<dl class="seo-facts">${facts.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl>${landUses}${parcels}<p>Показники відображають лише доступні публічні записи KadastrView та не є офіційною статистикою громади.</p>${relatedLinks([...(oblastSlug ? [[`Кадастрова карта ${data.oblast}`, `/oblast/${oblastSlug}`]] : []), ['Пошук земельної ділянки', '/guides/poshuk-za-kadastrovym-nomerom'], ['Джерела та обмеження', '/data-sources']])}`;
    return pageResponse({ canonicalPath, title: `Земельні ділянки: ${data.name} | KadastrView`, description: `Земельні ділянки в межах ${data.name} (${data.oblast}): ${formatInteger(data.parcelCount)} координатно перевірених публічних записів, площа та коди використання землі.`, heading: `Земельні ділянки: ${data.name}`, breadcrumbs, body, structuredData: pageSchema({ canonicalPath, title: `Земельні ділянки: ${data.name}`, description: `Відкриті дані земельних ділянок у межах ${data.name}.`, breadcrumbs }) });
}

async function districtPage(oblastSlug, districtSlug) {
    const oblast = oblastBySlug.get(oblastSlug);
    if (!oblast) return errorPage(404, 'Район не знайдено', 'Перевірте адресу сторінки району.');
    const data = await districtPageData(await mongoDb(), oblast.name, districtSlug, oblastSlug);
    if (!isDistrictIndexable(data) || districtPath(oblastSlug, data.district) !== `/raion/${oblastSlug}/${districtSlug}`) {
        return errorPage(404, 'Район не знайдено', 'Для цього району ще недостатньо координатно перевірених публічних даних.');
    }
    const canonicalPath = districtPath(oblastSlug, data.district);
    const breadcrumbs = [['Області України', '/oblast'], [oblast.name, `/oblast/${oblastSlug}`], [data.district, canonicalPath]];
    const facts = [['Ділянок з повними публічними даними', formatInteger(data.parcelCount)], ['Сумарна площа у доступних записах', `${formatArea(data.totalArea)} га`], ['Громад із достатніми даними', formatInteger(data.communities.length)]];
    const landUses = data.landUses.length ? `<h2>Поширені коди використання землі</h2><ul>${data.landUses.map((item) => `<li>${escapeHtml(item.name)} — ${formatInteger(item.count)} ділянок</li>`).join('')}</ul>` : '';
    const communities = data.communities.length ? `<h2>Громади району з перевіреними даними</h2><ul>${data.communities.map((community) => `<li><a href="${communityPath(community.katottg)}">${escapeHtml(community.name)}</a> — ${formatInteger(community.parcelCount)} ділянок</li>`).join('')}</ul>` : '';
    const parcels = `<h2>Приклади ділянок у районі</h2><ul>${data.parcels.map((parcel) => `<li><a href="${canonicalParcelPath(parcel.cadastralNumber)}">${escapeHtml(parcel.cadastralNumber)}</a> — ${escapeHtml(formatArea(parcel.areaHectares))} га${parcel.purpose ? `, код ${escapeHtml(parcel.purpose)}` : ''}</li>`).join('')}</ul>`;
    const description = `Земельні ділянки ${data.district}, ${oblast.name}: ${formatInteger(data.parcelCount)} координатно перевірених публічних записів, площа та коди використання землі.`;
    const body = `<p>На сторінці зібрано доступні публічні записи про ділянки, центроїди яких геопросторово віднесено до громад ${escapeHtml(data.district)}.</p><dl class="seo-facts">${facts.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl>${landUses}${communities}${parcels}<p>Показники охоплюють лише доступні публічні записи KadastrView і не є офіційною статистикою району.</p>${relatedLinks([[`Кадастрова карта ${oblast.name}`, `/oblast/${oblastSlug}`], ['Пошук земельної ділянки', '/guides/poshuk-za-kadastrovym-nomerom'], ['Джерела та обмеження', '/data-sources']])}`;
    return pageResponse({ canonicalPath, title: `Земельні ділянки ${data.district} — ${oblast.name} | KadastrView`, description, heading: `Земельні ділянки: ${data.district}`, breadcrumbs, body, structuredData: pageSchema({ canonicalPath, title: `Земельні ділянки ${data.district}`, description, breadcrumbs }) });
}

function commonPage({ canonicalPath, title, description, heading, body, breadcrumbs = [], robots = indexRobots }) { return { canonicalPath, title, description, heading, body, breadcrumbs, robots, structuredData: pageSchema({ canonicalPath, title, description, breadcrumbs }) }; }
function guidesHubPage() { return commonPage({ canonicalPath: '/guides', title: 'Довідник про кадастрову карту та земельні ділянки', description: 'Практичні пояснення: кадастровий номер, пошук земельної ділянки та перевірка меж на карті.', heading: 'Довідник KadastrView', breadcrumbs: [['Довідник', '/guides']], body: `<p>Короткі інструкції, що допомагають користуватися кадастровою картою та правильно інтерпретувати відкриті дані про землю.</p><div class="seo-cards"><article><h2><a href="/guides/kadastrovyi-nomer">Що таке кадастровий номер</a></h2><p>Будова номера земельної ділянки та для чого він потрібен.</p></article><article><h2><a href="/guides/poshuk-za-kadastrovym-nomerom">Пошук за кадастровим номером</a></h2><p>Як знайти межі, площу й доступні відомості про ділянку.</p></article><article><h2><a href="/guides/yak-znayty-dilyanku">Як знайти земельну ділянку</a></h2><p>Що робити, якщо номер не знаходиться, та як перевірити результат.</p></article></div>${relatedLinks([['Кадастрові карти областей', '/oblast'], ['Джерела даних KadastrView', '/data-sources']])}` }); }
function cadastralNumberGuide() { return commonPage({ canonicalPath: '/guides/kadastrovyi-nomer', title: 'Що таке кадастровий номер земельної ділянки', description: 'Пояснюємо, що таке кадастровий номер, як він виглядає та як використати його для пошуку земельної ділянки.', heading: 'Що таке кадастровий номер', breadcrumbs: [['Довідник', '/guides'], ['Кадастровий номер', '/guides/kadastrovyi-nomer']], body: `<p>Кадастровий номер — унікальний ідентифікатор земельної ділянки в кадастрі. Зазвичай він складається з цифр, розділених двокрапками, наприклад: <strong>5624685900:01:001:0123</strong>.</p><h2>Для чого він потрібен</h2><p>За номером можна знайти ділянку на карті, звірити її межі, площу, цільове призначення та інші доступні довідкові дані.</p><h2>Як використати номер</h2><ol><li>Скопіюйте номер без зайвих пробілів.</li><li>Введіть його в поле пошуку на карті.</li><li>Зіставте результат із відомими вам адресою та площею.</li></ol>${relatedLinks([['Пошук земельної ділянки за кадастровим номером', '/guides/poshuk-za-kadastrovym-nomerom'], ['Як перевірити земельну ділянку на карті', '/guides/yak-znayty-dilyanku']])}` }); }
function searchGuide() { return commonPage({ canonicalPath: '/guides/poshuk-za-kadastrovym-nomerom', title: 'Пошук земельної ділянки за кадастровим номером', description: 'Як знайти земельну ділянку за кадастровим номером: покрокова інструкція з перевірки меж, площі та призначення.', heading: 'Пошук земельної ділянки за кадастровим номером', breadcrumbs: [['Довідник', '/guides'], ['Пошук за кадастровим номером', '/guides/poshuk-za-kadastrovym-nomerom']], body: `<p>KadastrView допомагає відкрити ділянку на карті за її кадастровим номером і переглянути доступні геодані.</p><ol><li>Введіть кадастровий номер у рядок пошуку.</li><li>Оберіть знайдену ділянку на карті.</li><li>Перевірте межі, площу, призначення та розташування.</li><li>За потреби відкрийте її окреме посилання.</li></ol><h2>Якщо ділянка не знаходиться</h2><p>Перевірте формат номера. Дані можуть бути тимчасово відсутніми в підключених відкритих шарах або потребувати уточнення в офіційному реєстрі.</p>${relatedLinks([['Що таке кадастровий номер', '/guides/kadastrovyi-nomer'], ['Джерела й обмеження даних', '/data-sources']])}` }); }
function findParcelGuide() { return commonPage({ canonicalPath: '/guides/yak-znayty-dilyanku', title: 'Як знайти та перевірити земельну ділянку на карті', description: 'Практична інструкція, як знайти земельну ділянку на кадастровій карті й перевірити межі, площу та розташування.', heading: 'Як знайти земельну ділянку на карті', breadcrumbs: [['Довідник', '/guides'], ['Як знайти ділянку', '/guides/yak-znayty-dilyanku']], body: `<p>Найнадійніше шукати ділянку за кадастровим номером. Якщо ви вже знайшли її на карті, порівняйте межі з документами, адресою та відомою площею.</p><h2>Що варто перевірити</h2><ul><li>чи збігається кадастровий номер;</li><li>чи відповідає площа вашим документам;</li><li>чи логічно розташовані межі;</li><li>яке цільове призначення показують доступні дані.</li></ul><p>Для правочинів, судових або реєстраційних дій отримуйте офіційні витяги та звертайтеся до фахівців.</p>${relatedLinks([['Пошук за кадастровим номером', '/guides/poshuk-za-kadastrovym-nomerom'], ['Кадастрові карти областей', '/oblast']])}` }); }
async function regionsHubPage() {
    const eligible = new Set(await eligibleOblastSlugs(await mongoDb()).catch(() => []));
    const indexedOblasts = OBLASTS.filter(([slug]) => eligible.has(slug));
    const regionLinks = indexedOblasts.length
        ? `<ul class="seo-link-grid">${indexedOblasts.map(([slug, name]) => `<li><a href="/oblast/${slug}">${escapeHtml(name)}</a></li>`).join('')}</ul>`
        : '<p>Регіональні сторінки публікуються після перевірки достатності та якості відкритих кадастрових даних. Наразі скористайтеся пошуком на карті або довідковими матеріалами.</p>';

    return commonPage({ canonicalPath: '/oblast', title: 'Кадастрові карти областей України', description: 'Добірка перевірених регіональних сторінок KadastrView і довідкові матеріали для пошуку земельних ділянок.', heading: 'Кадастрові карти областей України', breadcrumbs: [['Області України', '/oblast']], body: `<p>На цій сторінці публікуються лише регіони з достатнім обсягом перевірених кадастрових даних.</p>${regionLinks}${relatedLinks([['Як знайти земельну ділянку', '/guides/yak-znayty-dilyanku'], ['Довідник KadastrView', '/guides']])}` });
}
async function regionPage(slug) {
    const oblast = oblastBySlug.get(slug);
    const canonicalPath = `/oblast/${slug}`;
    const db = await mongoDb();
    const stats = await regionStatsFor(db, slug).catch((error) => {
        console.error('Region statistics unavailable', error);
        return null;
    });
    const indexable = isOblastIndexable(stats);
    const statistics = indexable
        ? regionStatisticsMarkup(stats)
        : '<p>Для цього регіону в KadastrView поки недостатньо перевірених кадастрових записів, щоб публікувати пошукову сторінку зі статистикою.</p>';
    const communities = indexable ? (await indexableCommunityPages(db).catch(() => [])).filter((item) => item.oblast === oblast.name).slice(0, 30) : [];
    const communityLinks = communities.length ? `<h2>Громади з координатно перевіреними даними</h2><ul class="seo-link-grid">${communities.map((item) => `<li><a href="${communityPath(item.katottg)}">${escapeHtml(item.name)}</a> — ${formatInteger(item.parcelCount)} ділянок</li>`).join('')}</ul>` : '';
    const districts = indexable ? (await indexableDistrictPages(db, oblastSlugByName).catch(() => [])).filter((item) => item.oblastSlug === slug) : [];
    const districtLinks = districts.length ? `<h2>Райони з координатно перевіреними даними</h2><ul class="seo-link-grid">${districts.map((item) => `<li><a href="${districtPath(item.oblastSlug, item.district)}">${escapeHtml(item.district)}</a> — ${formatInteger(item.parcelCount)} ділянок</li>`).join('')}</ul>` : '';

    return commonPage({ canonicalPath, robots: indexable ? indexRobots : noIndexRobots, title: `Кадастрова карта ${oblast.genitive} — земельні ділянки онлайн | KadastrView`, description: indexable ? `Кадастрова карта ${oblast.genitive}: ${formatInteger(stats.parcelCount)} перевірених земельних ділянок у базі KadastrView, пошук за кадастровим номером та перегляд меж на карті.` : `Кадастрова карта ${oblast.genitive}: інтерактивний пошук земельних ділянок за кадастровим номером і перегляд меж на карті.`, heading: `Кадастрова карта ${oblast.genitive}`, breadcrumbs: [['Області України', '/oblast'], [oblast.name, canonicalPath]], body: `<p>На цій сторінці можна перейти до інтерактивної карти для пошуку земельної ділянки в межах ${escapeHtml(oblast.genitive)}.</p><h2>Дані в базі KadastrView</h2>${statistics}${districtLinks}${communityLinks}<h2>Як знайти ділянку в регіоні</h2><ol><li>Введіть кадастровий номер ділянки.</li><li>Перевірте її межі, площу та розташування.</li><li>Зіставте інформацію з документами або замовте офіційний витяг для юридично значущих дій.</li></ol>${relatedLinks([['Усі кадастрові карти областей', '/oblast'], ['Пошук за кадастровим номером', '/guides/poshuk-za-kadastrovym-nomerom'], ['Джерела даних', '/data-sources']])}` });
}

function regionStatisticsMarkup(stats) {
    const factRows = [
        ['Доступних ділянок', formatInteger(stats.parcelCount)],
    ];
    if (stats.totalArea > 0) {
        factRows.push(['Сумарна площа', `${formatArea(stats.totalArea)} га`]);
    }
    const categories = stats.categories.length ? `<h3>Поширені коди використання землі</h3><ul>${stats.categories.map((item) => `<li>${escapeHtml(item.name)} — ${formatInteger(item.count)}</li>`).join('')}</ul>` : '';
    const purposes = stats.purposes.length ? `<h3>Населені пункти з найбільшою кількістю записів</h3><ul>${stats.purposes.map((item) => `<li>${escapeHtml(item.name)} — ${formatInteger(item.count)}</li>`).join('')}</ul>` : '';

    const updated = stats.latestUpdate ? `<p>Останнє завантаження записів у вибірці: ${escapeHtml(formatDate(stats.latestUpdate))}.</p>` : '';
    return `<p>Наведені показники обчислені лише за доступними публічними записами KadastrView і не є офіційною статистикою регіону.</p><p>Вибірка містить ${escapeHtml(formatInteger(stats.parcelCount))} записів із валідним кадастровим номером, адресою, площею та кодом використання землі.</p><dl class="seo-facts">${factRows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl>${categories}${purposes}${updated}`;
}
function aboutPage() { return commonPage({ canonicalPath: '/about', title: 'Про KadastrView', description: 'KadastrView — незалежний інформаційний сервіс для пошуку та перегляду земельних ділянок на кадастровій карті України.', heading: 'Про KadastrView', breadcrumbs: [['Про сервіс', '/about']], body: `<p>KadastrView — незалежний інформаційний сервіс для зручного пошуку земельних ділянок і перегляду доступних відкритих геоданих на карті України.</p><h2>Для кого сервіс</h2><p>Для власників, покупців, орендарів, фахівців з нерухомості, землевпорядників та всіх, кому потрібно швидко зорієнтуватися за кадастровим номером.</p><h2>Важливо</h2><p>KadastrView не є офіційним сайтом Держгеокадастру та не замінює державні реєстри, офіційні витяги або професійну юридичну консультацію.</p>${relatedLinks([['Джерела даних', '/data-sources'], ['Контакти', '/contact']])}` }); }
function dataSourcesPage() { return commonPage({ canonicalPath: '/data-sources', title: 'Джерела даних та обмеження KadastrView', description: 'Звідки KadastrView отримує геодані, які є обмеження та де отримати офіційну інформацію про земельну ділянку.', heading: 'Джерела даних та обмеження', breadcrumbs: [['Джерела даних', '/data-sources']], body: `<p>KadastrView використовує доступні відкриті геопросторові дані, зокрема кадастрові шари, OpenStreetMap і оприлюднені набори даних. Частина інформації завантажується через зовнішні джерела та може оновлюватися з різною періодичністю.</p><h2>Обмеження</h2><p>Відображені межі та атрибути мають довідковий характер, можуть бути неповними або неактуальними. Для юридично значущих рішень отримуйте документи з <a href="https://e.land.gov.ua/" rel="noopener noreferrer">офіційних сервісів Держгеокадастру</a> та інших уповноважених реєстрів.</p><p>KadastrView не є заміною офіційного витягу, державної реєстрації чи консультації землевпорядника або юриста.</p>${relatedLinks([['Про KadastrView', '/about'], ['Як перевірити земельну ділянку', '/guides/yak-znayty-dilyanku']])}` }); }
function contactPage() { return commonPage({ canonicalPath: '/contact', title: 'Контакти KadastrView', description: 'Контактна сторінка сервісу KadastrView.', heading: 'Контакти', breadcrumbs: [['Контакти', '/contact']], body: `<p>З питань роботи сервісу, даних або партнерства напишіть нам на <a href="mailto:hello@kadastrview.online">hello@kadastrview.online</a>.</p><p>Не надсилайте на цю адресу документи з персональними даними, якщо це не є необхідним для вашого звернення.</p>${relatedLinks([['Про сервіс', '/about'], ['Політика приватності', '/privacy']])}` }); }
function privacyPage() { return commonPage({ canonicalPath: '/privacy', title: 'Політика приватності KadastrView', description: 'Політика приватності сервісу KadastrView.', heading: 'Політика приватності', breadcrumbs: [['Політика приватності', '/privacy']], body: `<p>KadastrView обробляє лише дані, необхідні для роботи сервісу, звернень користувачів і виконання замовлених послуг. Платіжні дані обробляє платіжний провайдер.</p><p>Для роботи карти можуть використовуватися технічні дані браузера та аналітика. Не вводьте у форму пошуку надмірні персональні дані.</p><p>З питань щодо персональних даних звертайтеся на <a href="mailto:hello@kadastrview.online">hello@kadastrview.online</a>.</p>${relatedLinks([['Умови користування', '/terms'], ['Контакти', '/contact']])}` }); }
function termsPage() { return commonPage({ canonicalPath: '/terms', title: 'Умови користування KadastrView', description: 'Умови користування кадастровою картою KadastrView.', heading: 'Умови користування', breadcrumbs: [['Умови користування', '/terms']], body: `<p>KadastrView надає довідковий доступ до карти та доступних відкритих даних. Користувач самостійно перевіряє важливу інформацію в офіційних джерелах.</p><p>Не використовуйте відомості з карти як єдину підставу для укладення правочину, визначення меж або інших юридично значущих дій.</p>${relatedLinks([['Джерела та обмеження', '/data-sources'], ['Політика приватності', '/privacy']])}` }); }

function pageResponse(page) { return htmlResponse(renderBasePage(page), 200, page.robots ?? indexRobots); }
function errorPage(statusCode, heading, message) { return htmlResponse(renderBasePage({ canonicalPath: null, title: `${heading} — KadastrView`, description: message, heading, body: `<p>${escapeHtml(message)}</p><p><a href="/">Перейти до кадастрової карти</a></p>`, structuredData: websiteSchema(), breadcrumbs: [], robots: noIndexRobots }), statusCode, noIndexRobots); }
function renderBasePage({ canonicalPath, title, description, heading, body, structuredData, breadcrumbs = [], robots = indexRobots }) { const canonicalUrl = canonicalPath ? `${siteUrl}${canonicalPath}` : null; const jsonLd = JSON.stringify(structuredData).replace(/</g, '\\u003c'); const assets = pageAssets(); return `<!doctype html><html lang="uk"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover"><meta name="theme-color" content="#1f6f54"><meta name="description" content="${escapeHtml(description)}"><meta name="robots" content="${escapeHtml(robots)}">${canonicalUrl ? `<link rel="canonical" href="${escapeHtml(canonicalUrl)}">` : ''}<link rel="icon" href="/favicon.svg" type="image/svg+xml">${assets.stylesheet ? `<link rel="stylesheet" href="${assets.stylesheet}">` : ''}<meta property="og:locale" content="uk_UA"><meta property="og:type" content="website"><meta property="og:site_name" content="KadastrView"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}">${canonicalUrl ? `<meta property="og:url" content="${escapeHtml(canonicalUrl)}">` : ''}<meta property="og:image" content="${siteUrl}/og-image.png"><meta name="twitter:card" content="summary_large_image"><script type="application/ld+json">${jsonLd}</script><title>${escapeHtml(title)}</title></head><body><section class="seo-document"><a class="seo-skip" href="#seo-main">Перейти до змісту</a><header class="seo-header"><a href="/" class="seo-brand">KadastrView</a><nav aria-label="Основна навігація"><a href="/guides">Довідник</a><a href="/oblast">Області</a><a href="/data-sources">Джерела даних</a></nav></header><main id="seo-main"><nav class="breadcrumbs" aria-label="Навігаційний ланцюжок"><a href="/">Головна</a>${breadcrumbs.map(([label, href]) => ` <span aria-hidden="true">/</span> <a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`).join('')}</nav><article class="seo-article"><h1>${escapeHtml(heading)}</h1>${body}</article></main><footer class="seo-footer"><p>KadastrView — незалежний інформаційний сервіс, не офіційний сайт Держгеокадастру.</p><nav><a href="/about">Про сервіс</a><a href="/data-sources">Джерела даних</a><a href="/contact">Контакти</a><a href="/privacy">Приватність</a><a href="/terms">Умови</a></nav></footer></section><div id="app"></div><script type="module" src="${assets.script}"></script></body></html>`; }
function relatedLinks(links) { return `<nav class="seo-related" aria-label="Пов’язані матеріали"><h2>Корисні матеріали</h2><ul>${links.map(([label, href]) => `<li><a href="${escapeHtml(href)}">${escapeHtml(label)}</a></li>`).join('')}</ul></nav>`; }
function pageSchema({ canonicalPath, title, description, breadcrumbs }) { const url = `${siteUrl}${canonicalPath}`; return { '@context': 'https://schema.org', '@graph': [websiteSchema(), { '@type': 'WebPage', '@id': url, url, name: title, description, inLanguage: 'uk-UA', isPartOf: { '@id': `${siteUrl}/#website` } }, breadcrumbSchema(breadcrumbs)] }; }
function breadcrumbSchema(breadcrumbs) { return { '@type': 'BreadcrumbList', itemListElement: [['Головна', '/'], ...breadcrumbs].map(([name, path], index) => ({ '@type': 'ListItem', position: index + 1, name, item: `${siteUrl}${path}` })) }; }
function parcelSchema(parcel, canonicalPath, breadcrumbs = []) { const url = `${siteUrl}${canonicalPath}`; return { '@context': 'https://schema.org', '@graph': [websiteSchema(), breadcrumbSchema(breadcrumbs), { '@type': 'Place', '@id': `${url}#parcel`, name: `Земельна ділянка ${parcel.cadastralNumber}`, url, description: parcelDescription(parcel), address: parcel.address, additionalProperty: [{ '@type': 'PropertyValue', name: 'Кадастровий номер', value: parcel.cadastralNumber }, { '@type': 'PropertyValue', name: 'Площа в записі оренди', value: `${formatArea(parcel.areaHectares)} га` }, { '@type': 'PropertyValue', name: 'Код використання землі', value: parcel.purpose }, ...(parcel.community ? [{ '@type': 'PropertyValue', name: 'Громада', value: parcel.community.name }, { '@type': 'PropertyValue', name: 'Область', value: parcel.community.oblast }] : [])] }] }; }
function websiteSchema() { return { '@type': 'WebSite', '@id': `${siteUrl}/#website`, name: 'KadastrView', alternateName: 'Кадастрова карта України онлайн', url: `${siteUrl}/`, inLanguage: 'uk-UA' }; }
function htmlResponse(body, statusCode, robots) { return { statusCode, headers: { ...pageHeaders, 'x-robots-tag': robots }, body }; }
function pageAssets() { return process.env.NETLIFY_DEV === 'true' ? { script: '/resources/js/app.ts', stylesheet: null } : { script: '/assets/app.js', stylesheet: '/assets/app.css' }; }
function normalizedPath(path) { return String(path ?? '').replace(/^\/\.netlify\/functions\/seo-page\/?/, '').replace(/^\/+/, '').replace(/\/+$/, ''); }
function normalizeCadastralNumber(value) { return String(value ?? '').trim().replace(/\s+/g, ''); }
function parcelDescription(parcel) { return [`Земельна ділянка ${parcel.cadastralNumber} на кадастровій карті України`, `площа в записі оренди ${formatArea(parcel.areaHectares)} га`, parcel.community?.name ? `громада: ${parcel.community.name}` : null, parcel.purpose ? `код використання: ${parcel.purpose}` : null, parcel.address ? `розташування: ${parcel.address}` : null].filter(Boolean).join(', ') + '. Перегляньте межі та доступні публічні відомості в KadastrView.'; }
function formatArea(value) { const number = Number(value); return Number.isFinite(number) ? number.toLocaleString('uk-UA', { maximumFractionDigits: 4 }) : String(value); }
function formatInteger(value) { return Number(value).toLocaleString('uk-UA', { maximumFractionDigits: 0 }); }
function formatDate(value) { const date = new Date(value); return Number.isNaN(date.valueOf()) ? String(value) : date.toLocaleDateString('uk-UA'); }
function escapeHtml(value) { return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;'); }
async function mongoDb() { const uri = process.env.MONGODB_URI; if (!uri || Date.now() < mongoUnavailableUntil) return null; mongoClientPromise ??= MongoClient.connect(uri, { maxPoolSize: 3, serverSelectionTimeoutMS: 4500, connectTimeoutMS: 4500, socketTimeoutMS: 10000 }); try { const client = await mongoClientPromise; return client.db(process.env.MONGODB_DATABASE ?? 'kadastr_view'); } catch (error) { mongoClientPromise = null; mongoUnavailableUntil = Date.now() + 60000; console.error('MongoDB connection unavailable', error); return null; } }
