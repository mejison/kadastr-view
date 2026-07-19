<template>
    <main class="app-shell">
        <section class="map-surface">
            <section class="seo-summary" aria-label="Про сервіс KadastrView">
                <h2>Кадастрова карта України онлайн</h2>
                <p>
                    KadastrView допомагає знайти земельну ділянку за кадастровим номером,
                    переглянути межі, площу, форму власності, цільове призначення, категорію земель,
                    адресу та відкриті довідкові геодані на інтерактивній кадастровій карті України.
                </p>
                <p>
                    Карта підтримує дорожній, світлий, рельєфний і супутниковий шари, персональні сторінки
                    ділянок за адресою /dilyanka/ та схему меж для швидкої перевірки земельної ділянки.
                </p>
            </section>

            <div ref="mapContainer" class="map-canvas" aria-label="Інтерактивна карта України"></div>

            <header class="topbar" @pointerenter="clearMapHoverState">
                <div class="topbar-left">
                    <div class="brand-block">
                        <img class="brand-logo" src="/favicon.svg" alt="" aria-hidden="true">
                        <div>
                            <p class="eyebrow">Карта земельних ділянок</p>
                            <h1>KadastrView</h1>
                        </div>
                    </div>

                    <button type="button" class="listing-board-open" @click="openListingBoard">
                        <Newspaper :size="17" aria-hidden="true" />
                        <span>Дошка оголошень</span>
                    </button>
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

            <aside
                v-if="listingBoardOpen"
                class="listing-board-panel"
                aria-label="Дошка оголошень"
                @pointerenter="clearMapHoverState"
            >
                <header class="listing-board-top">
                    <h2>{{ selectedBoardListing ? 'Оголошення' : 'Дошка оголошень' }}</h2>
                    <button
                        type="button"
                        title="Закрити дошку оголошень"
                        aria-label="Закрити дошку оголошень"
                        @click="closeListingBoard"
                    >
                        <X :size="18" aria-hidden="true" />
                    </button>
                </header>

                <div v-if="selectedBoardListing" class="listing-board-scroll">
                    <button type="button" class="listing-detail-back" @click="selectedBoardListing = null">
                        <ArrowLeft :size="17" aria-hidden="true" />
                        <span>До списку оголошень</span>
                    </button>

                    <article class="listing-detail-card">
                        <div class="listing-detail-media">
                            <img v-if="listingPhotoUrl(selectedBoardListing)" :src="listingPhotoUrl(selectedBoardListing) ?? undefined" alt="">
                            <span
                                v-else
                                :class="['listing-board-card-placeholder', `is-${selectedBoardListing.listingType}`]"
                                aria-hidden="true"
                            >
                                <span>
                                    <component :is="listingTypeIcon(selectedBoardListing.listingType)" :size="42" aria-hidden="true" />
                                </span>
                            </span>
                            <span :class="['listing-board-card-badge', `is-${selectedBoardListing.listingType}`]">
                                <component :is="listingTypeIcon(selectedBoardListing.listingType)" :size="15" aria-hidden="true" />
                                <span>{{ listingTypeShortLabel(selectedBoardListing.listingType) }}</span>
                            </span>
                        </div>

                        <div class="listing-detail-body">
                            <strong class="listing-detail-price">{{ listingPriceLabel(selectedBoardListing) }}</strong>
                            <h3>{{ selectedBoardListing.title }}</h3>
                            <div class="listing-detail-meta">
                                <span>
                                    <MapPinned :size="15" aria-hidden="true" />
                                    {{ selectedBoardListing.cadastralNumber }}
                                </span>
                                <span v-if="selectedBoardListing.area">Площа: {{ selectedBoardListing.area }}</span>
                                <span v-if="listingDateLabel(selectedBoardListing.createdAt)">Дата: {{ listingDateLabel(selectedBoardListing.createdAt) }}</span>
                            </div>
                            <p v-if="selectedBoardListing.description">{{ selectedBoardListing.description }}</p>
                        </div>
                    </article>

                    <section class="listing-detail-contact" aria-label="Контакти продавця">
                        <h3>Контакти продавця</h3>
                        <strong>{{ listingContactName(selectedBoardListing) }}</strong>
                        <a
                            v-if="listingContactPhone(selectedBoardListing)"
                            :href="`tel:${listingContactPhone(selectedBoardListing)}`"
                            class="listing-detail-action is-primary"
                        >
                            <Phone :size="17" aria-hidden="true" />
                            <span>{{ listingContactPhone(selectedBoardListing) }}</span>
                        </a>
                        <a
                            v-if="listingContactEmail(selectedBoardListing)"
                            :href="`mailto:${listingContactEmail(selectedBoardListing)}`"
                            class="listing-detail-action"
                        >
                            <Mail :size="17" aria-hidden="true" />
                            <span>Написати на пошту</span>
                        </a>
                        <button type="button" class="listing-detail-action" @click="focusListing(selectedBoardListing)">
                            <MapPinned :size="17" aria-hidden="true" />
                            <span>Показати на карті</span>
                        </button>
                    </section>
                </div>

                <div v-else class="listing-board-scroll">
                    <section class="listing-board-hero">
                        <h3>Земельні ділянки</h3>
                        <p>Продаж та оренда земельних ділянок по всій Україні</p>
                        <div class="listing-board-search-row">
                            <label class="listing-board-search">
                                <Search :size="18" aria-hidden="true" />
                                <input
                                    v-model="listingBoardSearch"
                                    placeholder="Пошук за кадастровим номером або назвою..."
                                    aria-label="Пошук оголошень"
                                >
                            </label>
                            <button type="button" class="listing-board-sell" @click="startListingFromBoard">
                                <Plus :size="18" aria-hidden="true" />
                                <span>Продати свою ділянку</span>
                            </button>
                        </div>
                    </section>

                    <div class="listing-board-filters" aria-label="Фільтри оголошень">
                        <button
                            v-for="filter in listingBoardFilters"
                            :key="filter.id"
                            type="button"
                            :class="{ 'is-active': listingBoardTypeFilter === filter.id }"
                            @click="listingBoardTypeFilter = filter.id"
                        >
                            <component v-if="filter.icon" :is="filter.icon" :size="15" aria-hidden="true" />
                            <span>{{ filter.label }}</span>
                        </button>
                    </div>

                    <p v-if="listingBoardStatus" class="listing-board-status">{{ listingBoardStatus }}</p>

                    <div v-if="listingsLoading" class="listing-board-empty">
                        <LoaderCircle class="is-spinning" :size="34" aria-hidden="true" />
                        <strong>Завантажуємо оголошення</strong>
                    </div>

                    <div v-else-if="filteredParcelListings.length === 0" class="listing-board-empty">
                        <SearchX :size="42" aria-hidden="true" />
                        <strong>Оголошень поки немає</strong>
                        <span>Спробуйте змінити фільтри або зайдіть пізніше</span>
                    </div>

                    <div v-else class="listing-board-list">
                        <p class="listing-board-count">{{ filteredParcelListings.length }} {{ listingCountWord(filteredParcelListings.length) }}</p>
                        <button
                            v-for="listing in filteredParcelListings"
                            :key="listing.id"
                            type="button"
                            class="listing-board-card"
                            @click="openListingDetails(listing)"
                        >
                            <span class="listing-board-card-media">
                                <img v-if="listingPhotoUrl(listing)" :src="listingPhotoUrl(listing) ?? undefined" alt="">
                                <span
                                    v-else
                                    :class="['listing-board-card-placeholder', `is-${listing.listingType}`]"
                                    aria-hidden="true"
                                >
                                    <span>
                                        <component :is="listingTypeIcon(listing.listingType)" :size="34" aria-hidden="true" />
                                    </span>
                                </span>
                                <span :class="['listing-board-card-badge', `is-${listing.listingType}`]">
                                    <component :is="listingTypeIcon(listing.listingType)" :size="15" aria-hidden="true" />
                                    <span>{{ listingTypeShortLabel(listing.listingType) }}</span>
                                </span>
                            </span>
                            <span class="listing-board-card-body">
                                <strong class="listing-board-card-price">{{ listingPriceLabel(listing) }}</strong>
                                <strong class="listing-board-card-title">{{ listing.title }}</strong>
                                <span class="listing-board-card-number">
                                    <MapPinned :size="14" aria-hidden="true" />
                                    <span>{{ listing.cadastralNumber }}</span>
                                </span>
                                <span v-if="listing.area" class="listing-board-card-area">Площа: {{ listing.area }}</span>
                                <span class="listing-board-card-footer">
                                    <strong>{{ listingContactName(listing) }}</strong>
                                    <span>{{ listingDateLabel(listing.createdAt) }}</span>
                                </span>
                            </span>
                        </button>
                    </div>
                </div>
            </aside>

            <aside v-if="selectedParcel" class="parcel-panel" @pointerenter="clearMapHoverState">
                <div class="panel-header">
                    <div class="panel-title">
                        <MapPinned :size="19" aria-hidden="true" />
                        <div>
                            <p class="eyebrow">Вибрана ділянка</p>
                            <h2>{{ selectedParcel.cadastral_number }}</h2>
                        </div>
                    </div>
                    <button
                        type="button"
                        class="panel-close"
                        title="Закрити картку ділянки"
                        aria-label="Закрити картку ділянки"
                        @click="closeSelectedParcel"
                    >
                        <X :size="18" aria-hidden="true" />
                    </button>
                </div>

                <div class="parcel-panel-body">
                    <dl class="parcel-grid">
                        <div>
                            <dt>Площа</dt>
                            <dd>{{ selectedParcel.area.declared }} га</dd>
                        </div>
                        <div>
                            <dt>Форма власності</dt>
                            <dd>{{ parcelOwnership(selectedParcel) }}</dd>
                        </div>
                        <div class="is-wide">
                            <dt>Цільове призначення</dt>
                            <dd>{{ parcelPurpose(selectedParcel) }}</dd>
                        </div>
                        <div class="is-wide">
                            <dt>Вид використання</dt>
                            <dd>{{ parcelUseType(selectedParcel) }}</dd>
                        </div>
                        <div class="is-wide">
                            <dt>Категорія</dt>
                            <dd>{{ parcelCategory(selectedParcel) }}</dd>
                        </div>
                        <div class="is-wide">
                            <dt>Адреса</dt>
                            <dd>{{ parcelAddress(selectedParcel) }}</dd>
                        </div>
                    </dl>

                    <section v-if="shouldShowParcelRights(selectedParcel)" class="parcel-rights" aria-label="Оренда та речові права">
                        <div class="parcel-rights-header">
                            <h3>Оренда / речові права</h3>
                            <span>{{ parcelRightsStatus(selectedParcel) }}</span>
                        </div>
                        <dl v-if="parcelRightsRows(selectedParcel).length > 0" class="parcel-rights-list">
                            <div v-for="row in parcelRightsRows(selectedParcel)" :key="row.label">
                                <dt>{{ row.label }}</dt>
                                <dd>{{ row.value }}</dd>
                            </div>
                        </dl>
                        <p v-else>
                            У підключених відкритих наборах для цієї ділянки поки немає даних про оренду або інші речові права.
                        </p>
                    </section>

                    <section v-if="selectedSketch" class="parcel-sketch" aria-label="Схема меж ділянки">
                        <div class="parcel-sketch-actions">
                            <button
                                type="button"
                                title="Скачати схему ділянки"
                                @click="downloadSelectedSketch"
                            >
                                <Download :size="16" aria-hidden="true" />
                            </button>
                        </div>
                        <svg class="parcel-sketch-diagram" viewBox="0 0 260 190" role="img" aria-label="Контур вибраної ділянки">
                            <g v-for="(ring, ringIndex) in selectedSketch.rings" :key="`${ringIndex}-${ring.points}`">
                                <polygon :class="{ 'is-hole': ring.isHole }" :points="ring.points" />
                                <polyline :class="{ 'is-hole': ring.isHole }" :points="closedSketchRingPoints(ring.points)" />
                            </g>
                            <g v-for="point in selectedSketch.vertices" :key="point.label">
                                <circle :cx="point.x" :cy="point.y" r="4" />
                                <text :x="point.labelX" :y="point.labelY" :text-anchor="point.anchor">{{ point.label }}</text>
                            </g>
                        </svg>
                        <div class="parcel-sketch-summary">
                            <span>Площа: <strong>{{ selectedSketch.area }}</strong></span>
                            <span>Периметр: <strong>{{ selectedSketch.perimeter }}</strong></span>
                        </div>
                    </section>

                    <section class="parcel-actions" aria-label="Дії з ділянкою">
                        <a
                            class="parcel-action is-primary"
                            :href="selectedRouteUrl"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            <Route :size="17" aria-hidden="true" />
                            <span>Прокласти маршрут</span>
                        </a>
                        <button type="button" class="parcel-action" @click="copySelectedParcelLink">
                            <Copy :size="17" aria-hidden="true" />
                            <span>Копіювати посилання</span>
                        </button>
                        <button type="button" class="parcel-action" @click="shareSelectedParcel">
                            <Share2 :size="17" aria-hidden="true" />
                            <span>Поділитися</span>
                        </button>
                        <button type="button" class="parcel-action is-listing" @click="openListingWizard">
                            <Plus :size="17" aria-hidden="true" />
                            <span>Додати оголошення</span>
                        </button>
                        <button type="button" class="parcel-action" @click="downloadSelectedParcelGeoJson">
                            <FileJson :size="17" aria-hidden="true" />
                            <span>Завантажити GeoJSON</span>
                        </button>
                        <button type="button" class="parcel-action" @click="downloadSelectedParcelKml">
                            <FileDown :size="17" aria-hidden="true" />
                            <span>Завантажити KML</span>
                        </button>
                    </section>

                    <section
                        :class="['parcel-service-orders', { 'is-expanded': parcelServicesExpanded }]"
                        aria-label="Замовити документи та послуги"
                    >
                        <button
                            type="button"
                            class="parcel-service-toggle"
                            :aria-expanded="parcelServicesExpanded"
                            @click="parcelServicesExpanded = !parcelServicesExpanded"
                        >
                            <span>
                                <strong>Замовити послуги</strong>
                                <small>Витяг з ДЗК, ДРРП, НГО, кадастровий план</small>
                            </span>
                            <em>від 100₴</em>
                            <ChevronDown :size="18" aria-hidden="true" />
                        </button>
                        <div v-if="parcelServicesExpanded" class="parcel-service-body">
                            <div class="parcel-service-header">
                                <h3>Оформлення замовлення</h3>
                                <span>Оплата через Stripe</span>
                            </div>
                            <label class="parcel-service-contact">
                                <span>Email або телефон для отримання документа</span>
                                <input
                                    v-model="orderContact"
                                    autocomplete="email"
                                    placeholder="name@example.com або +380..."
                                >
                            </label>
                            <div class="parcel-service-grid">
                                <button
                                    v-for="service in parcelOrderServices"
                                    :key="service.id"
                                    type="button"
                                    class="parcel-service-button"
                                    :disabled="orderSubmittingServiceId === service.id"
                                    @click="createParcelServiceOrder(service.id)"
                                >
                                    <FileText v-if="orderSubmittingServiceId !== service.id" :size="16" aria-hidden="true" />
                                    <LoaderCircle v-else class="is-spinning" :size="16" aria-hidden="true" />
                                    <span>{{ service.title }}</span>
                                    <strong>{{ service.price }}₴</strong>
                                </button>
                            </div>
                            <p v-if="orderStatus" class="parcel-service-status">{{ orderStatus }}</p>
                        </div>
                    </section>
                </div>
            </aside>

            <aside
                :class="['layer-panel', { 'is-collapsed': layerPanelCollapsed }]"
                aria-label="Шари карти"
                @pointerenter="clearMapHoverState"
            >
                <header class="layer-header">
                    <h2 v-if="!layerPanelCollapsed">Шари карти</h2>
                    <button
                        type="button"
                        class="layer-toggle"
                        :title="layerPanelCollapsed ? 'Відкрити шари карти' : 'Згорнути шари карти'"
                        @click="layerPanelCollapsed = !layerPanelCollapsed"
                    >
                        <Layers v-if="layerPanelCollapsed" :size="20" aria-hidden="true" />
                        <X v-else :size="18" aria-hidden="true" />
                    </button>
                </header>

                <ul v-if="!layerPanelCollapsed" class="layer-list">
                    <li v-for="item in baseMaps" :key="item.id">
                        <button
                            type="button"
                            :class="{ 'is-active': selectedBaseMapId === item.id }"
                            @click="setBaseMap(item.id)"
                        >
                            <span :class="['layer-preview', item.preview]"></span>
                            <span>
                                <strong>{{ item.label }}</strong>
                                <small>{{ item.description }}</small>
                            </span>
                        </button>
                    </li>
                </ul>
            </aside>

            <div
                v-if="hoverTooltip"
                :class="['map-tooltip', `is-${hoverTooltip.placement}`]"
                :style="{
                    transform: `translate(${hoverTooltip.x}px, ${hoverTooltip.y}px)`,
                    '--tooltip-arrow-x': `${hoverTooltip.arrowX}px`,
                }"
                role="tooltip"
            >
                <dl>
                    <div v-for="row in hoverTooltip.rows" :key="row.label">
                        <dt>{{ row.label }}:</dt>
                        <dd>{{ row.value }}</dd>
                    </div>
                </dl>
            </div>

            <section v-if="listingWizardOpen" class="listing-wizard" aria-label="Додавання оголошення">
                <header class="listing-wizard-header">
                    <button type="button" class="listing-back" @click="listingStep === 1 ? closeListingWizard() : previousListingStep()">
                        <ArrowLeft :size="18" aria-hidden="true" />
                        <span>{{ listingStep === 1 ? 'Назад' : 'Попередній крок' }}</span>
                    </button>
                    <span class="listing-step-counter">{{ listingStep }} / {{ listingWizardSteps.length }}</span>
                </header>

                <div class="listing-progress" aria-hidden="true">
                    <span
                        v-for="(_, index) in listingWizardSteps"
                        :key="index"
                        :class="{ 'is-active': index < listingStep }"
                    ></span>
                </div>
                <p class="listing-step-label">{{ listingWizardSteps[listingStep - 1] }}</p>

                <div class="listing-wizard-body">
                    <article class="listing-parcel-card">
                        <MapPinned :size="22" aria-hidden="true" />
                        <span>
                            <small>Кадастровий номер</small>
                            <strong>{{ selectedParcel?.cadastral_number }}</strong>
                        </span>
                    </article>

                    <template v-if="listingStep === 1">
                        <h2>Оберіть тип оголошення</h2>
                        <div class="listing-type-list">
                            <button
                                v-for="option in listingTypeOptions"
                                :key="option.id"
                                type="button"
                                :class="['listing-type-option', { 'is-selected': listingDraft.listingType === option.id }]"
                                @click="listingDraft.listingType = option.id"
                            >
                                <span class="listing-type-icon">
                                    <component :is="option.icon" :size="22" aria-hidden="true" />
                                </span>
                                <strong>{{ option.title }}</strong>
                                <ChevronRight :size="18" aria-hidden="true" />
                            </button>
                        </div>
                    </template>

                    <template v-else-if="listingStep === 2">
                        <h2>Деталі оголошення</h2>
                        <div class="listing-form-card">
                            <label class="listing-field is-price">
                                <span>Ціна *</span>
                                <input v-model="listingDraft.price" inputmode="decimal" placeholder="125000">
                                <select v-model="listingDraft.currency">
                                    <option v-for="currency in listingCurrencyOptions" :key="currency" :value="currency">
                                        {{ currency }}
                                    </option>
                                </select>
                            </label>
                            <label class="listing-field">
                                <span>Назва оголошення *</span>
                                <input v-model="listingDraft.title" placeholder="напр. Ділянка біля озера">
                            </label>
                            <label class="listing-field">
                                <span>Площа</span>
                                <input v-model="listingDraft.area" placeholder="3.9774 га">
                            </label>
                            <label class="listing-field">
                                <span>Опис</span>
                                <textarea
                                    v-model="listingDraft.description"
                                    maxlength="2000"
                                    placeholder="Опишіть ділянку: розташування, комунікації, підʼїзд..."
                                ></textarea>
                                <small>{{ listingDraft.description.length }}/2000</small>
                            </label>
                        </div>
                    </template>

                    <template v-else-if="listingStep === 3">
                        <h2>Фотографії</h2>
                        <p class="listing-muted">Завантажте до 5 фото. На цьому етапі вони додаються як preview і метадані.</p>
                        <div class="listing-form-card">
                            <label class="listing-upload">
                                <input type="file" accept="image/*" multiple @change="handleListingPhotos">
                                <Upload :size="34" aria-hidden="true" />
                                <strong>Натисніть для вибору фото</strong>
                                <span>JPG, PNG, WebP - до 5 фото</span>
                                <small>{{ listingDraft.photos.length }}/5 вибрано</small>
                            </label>
                            <div v-if="listingPhotoPreviewUrls.length" class="listing-photo-grid">
                                <button
                                    v-for="(url, index) in listingPhotoPreviewUrls"
                                    :key="url"
                                    type="button"
                                    class="listing-photo-preview"
                                    @click="removeListingPhoto(index)"
                                >
                                    <img :src="url" alt="">
                                    <span>Прибрати</span>
                                </button>
                            </div>
                        </div>
                    </template>

                    <template v-else-if="listingStep === 4">
                        <h2>Контактна інформація</h2>
                        <div class="listing-form-card">
                            <label class="listing-field">
                                <span><User :size="15" aria-hidden="true" /> Ваше імʼя</span>
                                <input v-model="listingDraft.contactName" placeholder="Імʼя">
                            </label>
                            <label class="listing-field">
                                <span><Phone :size="15" aria-hidden="true" /> Телефон *</span>
                                <input v-model="listingDraft.contactPhone" inputmode="tel" placeholder="+380991234567">
                            </label>
                            <label class="listing-field">
                                <span><Mail :size="15" aria-hidden="true" /> Email</span>
                                <input v-model="listingDraft.contactEmail" autocomplete="email" placeholder="name@example.com">
                            </label>
                        </div>
                    </template>

                    <template v-else>
                        <h2>Перевірте дані</h2>
                        <div class="listing-review-card">
                            <div>
                                <small>Тип</small>
                                <strong>{{ selectedListingTypeTitle }}</strong>
                            </div>
                            <div>
                                <small>Ціна</small>
                                <strong>{{ listingDraft.price }} {{ listingDraft.currency }}</strong>
                            </div>
                            <div>
                                <small>Назва</small>
                                <strong>{{ listingDraft.title }}</strong>
                                <p v-if="listingDraft.description">{{ listingDraft.description }}</p>
                            </div>
                            <div>
                                <small>Площа</small>
                                <strong>{{ listingDraft.area || selectedParcel?.area.declared + ' га' }}</strong>
                            </div>
                            <div>
                                <small>Контакт</small>
                                <strong>{{ listingDraft.contactName || 'Без імені' }}</strong>
                                <span>{{ listingDraft.contactPhone }}</span>
                                <span v-if="listingDraft.contactEmail">{{ listingDraft.contactEmail }}</span>
                            </div>
                        </div>
                        <p class="listing-review-note">
                            <Check :size="17" aria-hidden="true" />
                            Публікація зʼявиться на карті одразу в тестовому режимі зі статусом перевірки.
                        </p>
                    </template>

                    <p v-if="listingSubmitStatus" class="listing-submit-status">{{ listingSubmitStatus }}</p>

                    <footer class="listing-wizard-actions">
                        <button type="button" class="listing-secondary" :disabled="listingSubmitting" @click="listingStep === 1 ? closeListingWizard() : previousListingStep()">
                            Назад
                        </button>
                        <button
                            v-if="listingStep < listingWizardSteps.length"
                            type="button"
                            class="listing-primary"
                            :disabled="!listingCanContinue"
                            @click="nextListingStep"
                        >
                            Далі
                            <ChevronRight :size="18" aria-hidden="true" />
                        </button>
                        <button
                            v-else
                            type="button"
                            class="listing-primary"
                            :disabled="listingSubmitting || !listingCanContinue"
                            @click="submitListing"
                        >
                            <LoaderCircle v-if="listingSubmitting" class="is-spinning" :size="18" aria-hidden="true" />
                            <span>{{ listingSubmitting ? 'Публікуємо...' : 'Опублікувати оголошення' }}</span>
                        </button>
                    </footer>
                </div>
            </section>

            <div v-if="paymentModal" class="payment-modal-backdrop" role="presentation" @click.self="closePaymentModal">
                <section
                    :class="['payment-modal', `is-${paymentModal.tone}`]"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="payment-modal-title"
                >
                    <button
                        type="button"
                        class="payment-modal-close"
                        title="Закрити"
                        aria-label="Закрити повідомлення про оплату"
                        @click="closePaymentModal"
                    >
                        <X :size="18" aria-hidden="true" />
                    </button>
                    <div class="payment-modal-icon">
                        <LoaderCircle v-if="paymentModal.tone === 'pending'" class="is-spinning" :size="22" aria-hidden="true" />
                        <FileText v-else :size="22" aria-hidden="true" />
                    </div>
                    <div class="payment-modal-copy">
                        <h2 id="payment-modal-title">{{ paymentModal.title }}</h2>
                        <p>{{ paymentModal.message }}</p>
                    </div>
                    <button type="button" class="payment-modal-action" @click="closePaymentModal">
                        Зрозуміло
                    </button>
                </section>
            </div>
        </section>
    </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch, type Component } from 'vue';
import {
    ArrowLeft,
    ChevronDown,
    ChevronRight,
    Check,
    CalendarClock,
    Copy,
    Download,
    FileText,
    FileDown,
    FileJson,
    Home,
    KeyRound,
    Layers,
    LoaderCircle,
    MapPinned,
    Newspaper,
    Plus,
    Route,
    Search,
    SearchX,
    Share2,
    Trees,
    Upload,
    User,
    Phone,
    Mail,
    X,
} from '@lucide/vue';
import maplibregl, { LngLatBounds } from 'maplibre-gl';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import { absoluteApiUrl, apiUrl } from './api';

type Parcel = {
    cadastral_number: string;
    area: { declared: number; calculated: number; unit: string };
    ownership_type?: { id: string | null; name: string | null } | null;
    land_category?: { id: string | null; name: string | null } | null;
    purpose?: { code: string | null; name: string | null } | null;
    address?: string | null;
    rights?: ParcelRights | null;
    freshness_status: string;
    source: { name: string; updated_at: string; official: boolean };
    centroid: { lat: number; lng: number };
};

type ParcelRights = {
    rightType?: string | null;
    tenant?: string | null;
    landlord?: string | null;
    landlordCode?: string | null;
    contractNumber?: string | null;
    contractDate?: string | null;
    registeredAt?: string | null;
    validUntil?: string | null;
    leaseArea?: string | null;
    landUse?: string | null;
    address?: string | null;
    source?: string | null;
    sourceUrl?: string | null;
    datasetName?: string | null;
    publisher?: string | null;
    updatedAt?: string | null;
};

type ParcelRightsRow = {
    label: string;
    value: string;
};

type ParcelOrderServiceId = 'dzk_extract' | 'drrp_extract' | 'valuation_extract' | 'cadastral_plan';

type ParcelOrderService = {
    id: ParcelOrderServiceId;
    title: string;
    price: number;
};

type ParcelOrder = {
    id: string;
    status: string;
    serviceTitle?: string | null;
};

type PaymentModal = {
    title: string;
    message: string;
    tone: 'success' | 'warning' | 'pending';
};

type ListingTypeId = 'land_sale' | 'land_with_house_sale' | 'land_rent' | 'long_term_lease';

type ListingCurrency = 'USD' | 'EUR' | 'UAH';

type ListingTypeOption = {
    id: ListingTypeId;
    title: string;
    icon: Component;
};

type ListingBoardFilter = {
    id: ListingTypeId | 'all';
    label: string;
    icon: Component | null;
};

type ListingDraft = {
    listingType: ListingTypeId | null;
    price: string;
    currency: ListingCurrency;
    title: string;
    area: string;
    description: string;
    contactName: string;
    contactPhone: string;
    contactEmail: string;
    photos: File[];
};

type ListingPhotoPayload = {
    name: string;
    size: number;
    type: string;
    url: string;
};

type ParcelListing = {
    id: string;
    cadastralNumber: string;
    listingType: ListingTypeId;
    title: string;
    description?: string | null;
    price: number;
    currency: ListingCurrency;
    area?: string | null;
    status: string;
    contact?: {
        name?: string | null;
        phone?: string | null;
        email?: string | null;
    } | null;
    photos?: Array<{
        url?: string | null;
        name?: string | null;
    }>;
    centroid?: { lat: number; lng: number } | null;
    createdAt?: string | null;
};

type RenderedMapFeature = Feature<Geometry> & {
    source?: string;
    sourceLayer?: string;
};

type TooltipRow = {
    label: string;
    value: string;
};

type HoverTooltip = {
    x: number;
    y: number;
    arrowX: number;
    placement: 'above' | 'below';
    rows: TooltipRow[];
};

type SketchVertex = {
    label: string;
    x: number;
    y: number;
    labelX: number;
    labelY: number;
    anchor: 'start' | 'middle' | 'end';
};

type SketchLabelBox = {
    left: number;
    right: number;
    top: number;
    bottom: number;
};

type SketchLabelPosition = Pick<SketchVertex, 'labelX' | 'labelY' | 'anchor'> & {
    box: SketchLabelBox;
};

type SketchEdge = {
    label: string;
    length: string;
};

type SketchRing = {
    points: string;
    isHole: boolean;
};

type ParcelSketch = {
    points: string;
    closedPoints: string;
    rings: SketchRing[];
    vertices: SketchVertex[];
    edges: SketchEdge[];
    area: string;
    perimeter: string;
    centroid: [number, number];
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

type TerritoryRoute = {
    type: 'oblast';
    slug: string;
    hint: RegionHint;
};

type SavedMapView = {
    center: [number, number];
    zoom: number;
    bearing: number;
    pitch: number;
};

type BaseMapId = 'osm' | 'light' | 'relief' | 'satellite';

type BaseMap = {
    id: BaseMapId;
    layerId: string;
    label: string;
    description: string;
    preview: string;
};

const mapContainer = ref<HTMLDivElement | null>(null);
const mapInstance = shallowRef<maplibregl.Map | null>(null);
const searchQuery = ref('');
const searchStatus = ref('');
const selectedParcel = ref<Parcel | null>(null);
const selectedSketch = ref<ParcelSketch | null>(null);
const selectedParcelFeature = ref<Feature<Geometry> | null>(null);
const hoverTooltip = ref<HoverTooltip | null>(null);
const layerPanelCollapsed = ref(true);
const selectedBaseMapId = ref<BaseMapId>('osm');
const mapStatus = ref('завантаження карти');
const orderContact = ref('');
const orderStatus = ref('');
const orderSubmittingServiceId = ref<ParcelOrderServiceId | null>(null);
const parcelServicesExpanded = ref(false);
const paymentModal = ref<PaymentModal | null>(null);
let geolocationFallbackActive = false;
let hoveredFeatureKey: string | null = null;
let hoverLayersRaised = false;
let pendingHoveredFeature: Feature<Geometry> | null = null;
let hoverAnimationFrame: number | null = null;
const externalKadastrEnabled = true;
const ukraineCenter: [number, number] = [31.1656, 48.3794];
const ukraineNavigationBounds: [[number, number], [number, number]] = [
    [20.2, 43.3],
    [41.6, 53.3],
];
const overviewParcelMinZoom = 8.5;
const externalPolygonMinZoom = 10.75;
const emptyExternalFeatureFilter: maplibregl.FilterSpecification = ['==', ['get', '__kadastr_view_empty__'], true];
const externalHoverLayerIds = [
    'external-kadastr-polygons-hover-fill',
    'external-kadastr-polygons-hover-line',
    'external-kadastr-land-hover-fill',
    'external-kadastr-land-hover-line',
];
const externalSelectedLayerIds = [
    'external-kadastr-polygons-selected-fill',
    'external-kadastr-polygons-selected-line',
    'external-kadastr-land-selected-fill',
    'external-kadastr-land-selected-line',
];
const hoverPerfEnabled = typeof window !== 'undefined' && window.localStorage.getItem('kadastrHoverPerf') === '1';
const hoverPerfStats = {
    count: 0,
    applyCount: 0,
    queryMs: 0,
    tooltipMs: 0,
    highlightMs: 0,
    applyMs: 0,
    totalMs: 0,
    slowestMs: 0,
};
const mapViewStorageKey = 'kadastr-view:map-view:v1';
const baseMapStorageKey = 'kadastr-view:base-map:v1';
const orderContactStorageKey = 'kadastr-view:order-contact:v1';
const parcelOrderServices: ParcelOrderService[] = [
    { id: 'dzk_extract', title: 'Витяг з ДЗК', price: 100 },
    { id: 'drrp_extract', title: 'Витяг з ДРРП', price: 300 },
    { id: 'valuation_extract', title: 'НГО', price: 100 },
    { id: 'cadastral_plan', title: 'Кадастровий план', price: 100 },
];
const listingWizardSteps = ['Тип оголошення', 'Деталі', 'Фото', 'Контакти', 'Перевірка'];
const listingTypeOptions: ListingTypeOption[] = [
    { id: 'land_sale', title: 'Продаж земельної ділянки', icon: Trees },
    { id: 'land_with_house_sale', title: 'Продаж ділянки з будинком', icon: Home },
    { id: 'land_rent', title: 'Оренда земельної ділянки', icon: KeyRound },
    { id: 'long_term_lease', title: 'Довгострокова оренда (лізинг)', icon: CalendarClock },
];
const listingBoardFilters: ListingBoardFilter[] = [
    { id: 'all', label: 'Усі', icon: null },
    { id: 'land_sale', label: 'Продаж землі', icon: Trees },
    { id: 'land_with_house_sale', label: 'Продаж з будинком', icon: Home },
    { id: 'land_rent', label: 'Оренда', icon: KeyRound },
    { id: 'long_term_lease', label: 'Лізинг', icon: CalendarClock },
];
const listingCurrencyOptions: ListingCurrency[] = ['USD', 'EUR', 'UAH'];

const listingWizardOpen = ref(false);
const listingStep = ref(1);
const listingSubmitting = ref(false);
const listingSubmitStatus = ref('');
const listingDraft = ref<ListingDraft>(emptyListingDraft());
const listingPhotoPreviewUrls = ref<string[]>([]);
const listingBoardOpen = ref(false);
const listingBoardSearch = ref('');
const listingBoardTypeFilter = ref<ListingBoardFilter['id']>('all');
const listingBoardStatus = ref('');
const parcelListings = ref<ParcelListing[]>([]);
const selectedBoardListing = ref<ParcelListing | null>(null);
const listingsLoading = ref(false);

const selectedListingTypeTitle = computed(() => {
    const type = listingDraft.value.listingType;

    return listingTypeOptions.find((option) => option.id === type)?.title ?? 'Тип не вибрано';
});

const listingCanContinue = computed(() => canContinueListingStep(listingStep.value));

const filteredParcelListings = computed(() => {
    const search = listingBoardSearch.value.trim().toLowerCase();

    return parcelListings.value.filter((listing) => {
        if (listingBoardTypeFilter.value !== 'all' && listing.listingType !== listingBoardTypeFilter.value) {
            return false;
        }

        if (!search) {
            return true;
        }

        return [
            listing.cadastralNumber,
            listing.title,
            listing.description ?? '',
            listing.area ?? '',
            listingTypeLabel(listing.listingType),
        ].some((value) => value.toLowerCase().includes(search));
    });
});

watch(selectedParcel, () => {
    if (paymentReturnParams().paymentState) {
        return;
    }

    parcelServicesExpanded.value = false;
    orderStatus.value = '';
});

const baseMaps: BaseMap[] = [
    {
        id: 'osm',
        layerId: 'base-osm',
        label: 'Дороги',
        description: 'OpenStreetMap',
        preview: 'is-osm',
    },
    {
        id: 'light',
        layerId: 'base-light',
        label: 'Світла',
        description: 'Carto Voyager',
        preview: 'is-light',
    },
    {
        id: 'relief',
        layerId: 'base-relief',
        label: 'Рельєф',
        description: 'OpenTopoMap',
        preview: 'is-relief',
    },
    {
        id: 'satellite',
        layerId: 'base-satellite',
        label: 'Супутник',
        description: 'Esri World Imagery',
        preview: 'is-satellite',
    },
];
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
const oblastRouteHints: Record<string, RegionHint> = {
    crimea: { center: [34.35, 45.2], zoom: 8.2, name: 'АР Крим' },
    vinnytska: { center: [28.47, 49.23], zoom: 8.2, name: 'Вінницька область' },
    volynska: { center: [25.32, 50.75], zoom: 8.4, name: 'Волинська область' },
    dnipropetrovska: { center: [35.05, 48.46], zoom: 8.1, name: 'Дніпропетровська область' },
    donetska: { center: [37.8, 48.02], zoom: 8.1, name: 'Донецька область' },
    zhytomyrska: { center: [28.66, 50.25], zoom: 8.2, name: 'Житомирська область' },
    zakarpatska: { center: [22.3, 48.62], zoom: 8.5, name: 'Закарпатська область' },
    zaporizka: { center: [35.17, 47.84], zoom: 8.2, name: 'Запорізька область' },
    'ivano-frankivska': { center: [24.71, 48.92], zoom: 8.5, name: 'Івано-Франківська область' },
    kyivska: { center: [30.52, 50.35], zoom: 8.2, name: 'Київська область' },
    kirovohradska: { center: [32.26, 48.51], zoom: 8.2, name: 'Кіровоградська область' },
    luhanska: { center: [39.31, 48.57], zoom: 8.2, name: 'Луганська область' },
    lvivska: { center: [24.03, 49.84], zoom: 8.2, name: 'Львівська область' },
    mykolaivska: { center: [31.99, 46.98], zoom: 8.2, name: 'Миколаївська область' },
    odeska: { center: [30.73, 46.48], zoom: 7.9, name: 'Одеська область' },
    poltavska: { center: [34.55, 49.59], zoom: 8.2, name: 'Полтавська область' },
    rivnenska: { center: [26.25, 50.62], zoom: 8.4, name: 'Рівненська область' },
    sumska: { center: [34.8, 50.91], zoom: 8.2, name: 'Сумська область' },
    ternopilska: { center: [25.59, 49.55], zoom: 8.6, name: 'Тернопільська область' },
    kharkivska: { center: [36.23, 49.99], zoom: 8.2, name: 'Харківська область' },
    khersonska: { center: [32.62, 46.64], zoom: 8.2, name: 'Херсонська область' },
    khmelnytska: { center: [26.99, 49.42], zoom: 8.3, name: 'Хмельницька область' },
    cherkaska: { center: [32.06, 49.44], zoom: 8.3, name: 'Черкаська область' },
    chernivetska: { center: [25.94, 48.29], zoom: 8.8, name: 'Чернівецька область' },
    chernihivska: { center: [31.29, 51.5], zoom: 8.1, name: 'Чернігівська область' },
    kyiv: { center: [30.52, 50.45], zoom: 10.5, name: 'Київ' },
    sevastopol: { center: [33.52, 44.61], zoom: 10.2, name: 'Севастополь' },
};
const landPurposeLabels: Record<string, string> = {
    '01.01': 'Для ведення товарного сільськогосподарського виробництва',
    '01.02': 'Для ведення фермерського господарства',
    '01.03': 'Для ведення особистого селянського господарства',
    '01.04': 'Для ведення підсобного сільського господарства',
    '01.05': 'Для індивідуального садівництва',
    '01.06': 'Для колективного садівництва',
    '01.07': 'Для городництва',
    '01.08': 'Для сінокосіння і випасання худоби',
    '01.09': 'Для дослідних і навчальних цілей',
    '01.10': 'Для пропаганди передового досвіду ведення сільського господарства',
    '01.11': 'Для надання послуг у сільському господарстві',
    '01.12': 'Для розміщення інфраструктури оптових ринків сільськогосподарської продукції',
    '01.13': 'Для іншого сільськогосподарського призначення',
    '02.01': 'Для будівництва і обслуговування житлового будинку та господарських будівель',
    '02.02': 'Для колективного житлового будівництва',
    '02.03': 'Для будівництва і обслуговування багатоквартирного житлового будинку',
    '02.04': 'Для будівництва і обслуговування будівель тимчасового проживання',
    '02.05': 'Для будівництва індивідуальних гаражів',
    '02.06': 'Для колективного гаражного будівництва',
    '02.07': 'Для іншої житлової забудови',
    '03.01': 'Для будівництва та обслуговування будівель органів державної влади',
    '03.02': 'Для будівництва та обслуговування будівель закладів освіти',
    '03.03': 'Для будівництва та обслуговування будівель закладів охорони здоровʼя',
    '03.04': 'Для будівництва та обслуговування будівель громадських та релігійних організацій',
    '03.05': 'Для будівництва та обслуговування будівель культурно-просвітницького обслуговування',
    '03.06': 'Для будівництва та обслуговування будівель екстериторіальних організацій',
    '03.07': 'Для будівництва та обслуговування будівель торгівлі',
    '03.08': 'Для будівництва та обслуговування обʼєктів туристичної інфраструктури',
    '03.09': 'Для будівництва та обслуговування будівель кредитно-фінансових установ',
    '03.10': 'Для будівництва та обслуговування будівель ринкової інфраструктури',
    '03.11': 'Для будівництва та обслуговування будівель і споруд закладів науки',
    '03.12': 'Для будівництва та обслуговування будівель закладів комунального обслуговування',
    '03.13': 'Для будівництва та обслуговування будівель закладів побутового обслуговування',
    '03.14': 'Для розміщення та постійної діяльності органів і підрозділів ДСНС',
    '03.15': 'Для будівництва та обслуговування інших будівель громадської забудови',
    '07.01': 'Для будівництва та обслуговування обʼєктів рекреаційного призначення',
    '07.02': 'Для будівництва та обслуговування обʼєктів фізичної культури і спорту',
    '07.03': 'Для індивідуального дачного будівництва',
    '07.04': 'Для колективного дачного будівництва',
    '10.01': 'Для експлуатації та догляду за водними обʼєктами',
    '10.02': 'Для облаштування та догляду за прибережними захисними смугами',
    '10.03': 'Для експлуатації та догляду за смугами відведення',
    '10.04': 'Для експлуатації та догляду за гідротехнічними спорудами',
    '10.05': 'Для догляду за береговими смугами водних шляхів',
    '10.06': 'Для сінокосіння',
    '10.07': 'Для рибогосподарських потреб',
    '10.08': 'Для культурно-оздоровчих потреб, рекреаційних, спортивних і туристичних цілей',
    '11.01': 'Для розміщення та експлуатації основних, підсобних і допоміжних будівель промисловості',
    '11.02': 'Для розміщення та експлуатації будівель і споруд підприємств переробної, машинобудівної та іншої промисловості',
    '12.04': 'Для розміщення та експлуатації будівель і споруд автомобільного транспорту',
    '12.08': 'Для розміщення та експлуатації будівель і споруд додаткових транспортних послуг',
    '13.01': 'Для розміщення та експлуатації обʼєктів і споруд телекомунікацій',
    '14.01': 'Для розміщення, будівництва та експлуатації обʼєктів енергогенеруючих підприємств',
    '14.02': 'Для розміщення, будівництва та експлуатації будівель і споруд обʼєктів передачі електричної та теплової енергії',
};

const selectedRouteUrl = computed(() => {
    const center = selectedParcelRouteCenter();

    return center
        ? `https://www.google.com/maps/dir/?api=1&destination=${center[1]},${center[0]}`
        : 'https://www.google.com/maps';
});

onMounted(() => {
    if (!mapContainer.value) {
        return;
    }

    const savedView = loadSavedMapView();
    selectedBaseMapId.value = loadSavedBaseMapId();
    orderContact.value = window.localStorage.getItem(orderContactStorageKey) ?? '';
    void hydrateReturnedPayment();
    const initialRouteParcelNumber = parcelNumberFromRoute();
    const initialTerritoryRoute = territoryRouteFromPath();
    const map = new maplibregl.Map({
        container: mapContainer.value,
        style: {
            version: 8,
            glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
            sources: {
                osm: {
                    type: 'raster',
                    tiles: [
                        'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
                        'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
                        'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
                    ],
                    tileSize: 256,
                    maxzoom: 19,
                    attribution: '© OpenStreetMap contributors',
                },
                light: {
                    type: 'raster',
                    tiles: [
                        'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
                        'https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
                        'https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
                    ],
                    tileSize: 256,
                    maxzoom: 20,
                    attribution: '© OpenStreetMap contributors © CARTO',
                },
                relief: {
                    type: 'raster',
                    tiles: [
                        'https://a.tile.opentopomap.org/{z}/{x}/{y}.png',
                        'https://b.tile.opentopomap.org/{z}/{x}/{y}.png',
                        'https://c.tile.opentopomap.org/{z}/{x}/{y}.png',
                    ],
                    tileSize: 256,
                    maxzoom: 17,
                    attribution: '© OpenStreetMap contributors, SRTM | OpenTopoMap',
                },
                satellite: {
                    type: 'raster',
                    tiles: [
                        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
                    ],
                    tileSize: 256,
                    maxzoom: 18,
                    attribution: 'Source: Esri, Maxar, Earthstar Geographics',
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
                    id: 'base-osm',
                    type: 'raster',
                    source: 'osm',
                    layout: {
                        visibility: selectedBaseMapId.value === 'osm' ? 'visible' : 'none',
                    },
                    paint: {
                        'raster-opacity': 1,
                    },
                },
                {
                    id: 'base-light',
                    type: 'raster',
                    source: 'light',
                    layout: {
                        visibility: selectedBaseMapId.value === 'light' ? 'visible' : 'none',
                    },
                    paint: {
                        'raster-opacity': 1,
                    },
                },
                {
                    id: 'base-relief',
                    type: 'raster',
                    source: 'relief',
                    layout: {
                        visibility: selectedBaseMapId.value === 'relief' ? 'visible' : 'none',
                    },
                    paint: {
                        'raster-opacity': 1,
                    },
                },
                {
                    id: 'base-satellite',
                    type: 'raster',
                    source: 'satellite',
                    layout: {
                        visibility: selectedBaseMapId.value === 'satellite' ? 'visible' : 'none',
                    },
                    paint: {
                        'raster-opacity': 1,
                    },
                },
            ],
        },
        center: savedView?.center ?? ukraineCenter,
        zoom: savedView?.zoom ?? 5.2,
        bearing: savedView?.bearing ?? 0,
        pitch: savedView?.pitch ?? 0,
        minZoom: 5.2,
        maxZoom: 22,
        maxBounds: ukraineNavigationBounds,
        renderWorldCopies: false,
        attributionControl: false,
    });

    mapInstance.value = map;
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
    map.addControl(new maplibregl.FullscreenControl(), 'bottom-right');
    setupGeolocateControl(map);
    map.on('moveend', () => saveMapView(map));
    window.addEventListener('popstate', () => {
        void openCurrentRoute(false);
    });

    map.on('error', (event) => {
        console.error('MapLibre error', event.error);
        mapStatus.value = 'помилка карти';
    });

    map.once('load', async () => {
        mapStatus.value = 'карта готова';
        addExternalKadastrLayer(map);
        const geojson = await loadParcelLayer();
        await loadParcelListingsLayer();
        await loadParcelListingsForBoard();
        bindListingInteractions(map);
        bindMapInteractions(map);

        if (initialRouteParcelNumber) {
            await openParcelByNumber(initialRouteParcelNumber, true);
        } else if (initialTerritoryRoute) {
            openTerritoryRoute(initialTerritoryRoute, false);
        } else if (!savedView && geojson.features.length > 0) {
            map.fitBounds(boundsForFeatures(geojson.features), { padding: 72, duration: 0 });
        }
    });
});

function loadSavedBaseMapId(): BaseMapId {
    const storedValue = window.localStorage.getItem(baseMapStorageKey);

    return baseMaps.some((item) => item.id === storedValue) ? storedValue as BaseMapId : 'osm';
}

function setBaseMap(baseMapId: BaseMapId): void {
    selectedBaseMapId.value = baseMapId;
    window.localStorage.setItem(baseMapStorageKey, baseMapId);

    const map = mapInstance.value;

    if (!map) {
        return;
    }

    for (const baseMap of baseMaps) {
        if (map.getLayer(baseMap.layerId)) {
            map.setLayoutProperty(baseMap.layerId, 'visibility', baseMap.id === baseMapId ? 'visible' : 'none');
        }
    }
}

function loadSavedMapView(): SavedMapView | null {
    try {
        const rawValue = window.localStorage.getItem(mapViewStorageKey);

        if (!rawValue) {
            return null;
        }

        const parsed = JSON.parse(rawValue) as Partial<SavedMapView>;
        const center = parsed.center;

        if (!Array.isArray(center) || center.length !== 2) {
            return null;
        }

        const [lng, lat] = center;
        const zoom = parsed.zoom;
        const bearing = parsed.bearing ?? 0;
        const pitch = parsed.pitch ?? 0;

        if (
            typeof lng !== 'number'
            || typeof lat !== 'number'
            || typeof zoom !== 'number'
            || typeof bearing !== 'number'
            || typeof pitch !== 'number'
            || !Number.isFinite(lng)
            || !Number.isFinite(lat)
            || !Number.isFinite(zoom)
            || !Number.isFinite(bearing)
            || !Number.isFinite(pitch)
            || !isWithinUkraineNavigationBounds([lng, lat])
        ) {
            return null;
        }

        return {
            center: [lng, lat],
            zoom: clamp(zoom, 5.2, 22),
            bearing,
            pitch: clamp(pitch, 0, 85),
        };
    } catch {
        return null;
    }
}

function saveMapView(map: maplibregl.Map): void {
    const center = map.getCenter();

    if (!isWithinUkraineNavigationBounds([center.lng, center.lat])) {
        return;
    }

    const value: SavedMapView = {
        center: [center.lng, center.lat],
        zoom: map.getZoom(),
        bearing: map.getBearing(),
        pitch: map.getPitch(),
    };

    window.localStorage.setItem(mapViewStorageKey, JSON.stringify(value));
}

function setupGeolocateControl(map: maplibregl.Map): void {
    const geolocateControl = new maplibregl.GeolocateControl({
        positionOptions: {
            enableHighAccuracy: false,
            maximumAge: 60000,
            timeout: 15000,
        },
        fitBoundsOptions: {
            maxZoom: 16,
        },
        showAccuracyCircle: true,
        trackUserLocation: false,
    });

    geolocateControl.on('geolocate', () => {
        searchStatus.value = '';
    });

    geolocateControl.on('error', () => {
        void locateUserWithBrowserFallback(map);
    });

    map.addControl(geolocateControl, 'bottom-right');
}

function locateUserWithBrowserFallback(map: maplibregl.Map): Promise<void> {
    if (geolocationFallbackActive) {
        return Promise.resolve();
    }

    if (!navigator.geolocation) {
        searchStatus.value = 'Геолокація недоступна в цьому браузері';
        return Promise.resolve();
    }

    geolocationFallbackActive = true;
    searchStatus.value = 'Визначаю вашу локацію...';

    return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                geolocationFallbackActive = false;
                const center: [number, number] = [
                    position.coords.longitude,
                    position.coords.latitude,
                ];

                if (!isWithinUkraineNavigationBounds(center)) {
                    searchStatus.value = 'Локація поза межами карти України';
                    resolve();
                    return;
                }

                searchStatus.value = '';
                map.easeTo({
                    center,
                    zoom: Math.max(map.getZoom(), 15),
                    duration: 700,
                });
                resolve();
            },
            (error) => {
                geolocationFallbackActive = false;
                searchStatus.value = geolocationErrorMessage(error);
                resolve();
            },
            {
                enableHighAccuracy: false,
                maximumAge: 120000,
                timeout: 20000,
            },
        );
    });
}

function geolocationErrorMessage(error: GeolocationPositionError): string {
    if (error.code === error.PERMISSION_DENIED) {
        return 'Доступ до геолокації заборонено';
    }

    if (error.code === error.POSITION_UNAVAILABLE) {
        return 'Не вдалося визначити локацію. Спробуйте увімкнути GPS або Wi-Fi';
    }

    if (error.code === error.TIMEOUT) {
        return 'Геолокація не відповіла вчасно';
    }

    return 'Не вдалося визначити вашу локацію';
}

function isWithinUkraineNavigationBounds(center: [number, number]): boolean {
    const [[minLng, minLat], [maxLng, maxLat]] = ukraineNavigationBounds;
    const [lng, lat] = center;

    return lng >= minLng && lng <= maxLng && lat >= minLat && lat <= maxLat;
}

async function searchParcel(
    zoomToGeometry = true,
    knownFeature?: Feature<Geometry>,
    queryOverride?: string,
    updateRoute = true,
) {
    const manualQuery = (queryOverride ?? searchQuery.value).trim();

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

    let renderedFeature = findVisibleFeatureByNumber(manualQuery) ?? (knownFeature ? (knownFeature as RenderedMapFeature) : null);
    let selectedFeature = cleanFeatureForParcelDisplay(renderedFeature ?? (feature?.geometry ? feature : null));

    if (!selectedFeature?.geometry && zoomToGeometry) {
        renderedFeature = await findFeatureAfterExternalLookup(manualQuery);
        selectedFeature = cleanFeatureForParcelDisplay(renderedFeature);
    }

    if (!selectedFeature?.geometry && zoomToGeometry) {
        renderedFeature = await findFeatureAfterRegionalJump(manualQuery);
        selectedFeature = cleanFeatureForParcelDisplay(renderedFeature);
    }

    if (selectedFeature?.geometry) {
        highlightSelectedFeature(renderedFeature ?? selectedFeature);
        let parcel = renderedFeature
            ? parcelFromFeature(renderedFeature, manualQuery)
            : payload.data;
        parcel = {
            ...parcel,
            rights: await preferredParcelRights(manualQuery, parcel.rights, payload.data?.rights),
        };
        const sketchFeature = renderedFeature
            ? selectedMapFeatureForSketch(renderedFeature, manualQuery) ?? selectedFeature
            : selectedFeature;
        selectedParcel.value = parcel;
        selectedSketch.value = sketchFromGeometry(sketchFeature.geometry, parcel);
        selectedParcelFeature.value = toPlainFeature(sketchFeature);
        searchStatus.value = 'Знайдено';

        if (updateRoute) {
            setParcelRoute(manualQuery);
        }
    } else {
        selectedSketch.value = null;
        selectedParcelFeature.value = null;
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

async function openCurrentRoute(zoomToGeometry: boolean): Promise<void> {
    const cadastralNumber = parcelNumberFromRoute();

    if (cadastralNumber) {
        await openParcelByNumber(cadastralNumber, zoomToGeometry);
        return;
    }

    const territoryRoute = territoryRouteFromPath();

    if (territoryRoute) {
        openTerritoryRoute(territoryRoute, zoomToGeometry);
        return;
    }

    clearSelectedParcelRouteState();
}

async function openParcelFromCurrentRoute(zoomToGeometry: boolean): Promise<void> {
    const cadastralNumber = parcelNumberFromRoute();

    if (!cadastralNumber) {
        clearSelectedParcelRouteState();
        return;
    }

    await openParcelByNumber(cadastralNumber, zoomToGeometry);
}

async function openParcelByNumber(cadastralNumber: string, zoomToGeometry: boolean): Promise<void> {
    await searchParcel(zoomToGeometry, undefined, cadastralNumber, false);
}

function openTerritoryRoute(route: TerritoryRoute, animated: boolean): void {
    const map = mapInstance.value;

    clearSelectedParcelRouteState();
    searchQuery.value = '';
    searchStatus.value = route.hint.name;

    if (!map) {
        return;
    }

    map.easeTo({
        center: route.hint.center,
        zoom: route.hint.zoom,
        duration: animated ? 650 : 0,
    });
}

function clearSelectedParcelRouteState(): void {
    selectedParcel.value = null;
    selectedSketch.value = null;
    selectedParcelFeature.value = null;
    searchStatus.value = '';
    clearSelectedFeature();
}

function closeSelectedParcel(): void {
    clearSelectedParcelRouteState();
    clearMapHoverState();

    if (parcelNumberFromRoute()) {
        const nextUrl = `/${window.location.search}${window.location.hash}`;
        window.history.pushState({}, '', nextUrl);
    }
}

function clearMapHoverState(): void {
    const map = mapInstance.value;

    if (map) {
        map.getCanvas().style.cursor = '';
    }

    hoverTooltip.value = null;
    updateHoveredFeature(null);
}

function bindMapInteractions(map: maplibregl.Map): void {
    map.on('click', async (event) => {
        if (findListingFeatureAtPoint(map, event.point)) {
            return;
        }

        const feature = findInteractiveFeature(map, event.point, [event.lngLat.lng, event.lngLat.lat]);

        if (!feature?.geometry) {
            return;
        }

        await selectRenderedFeature(feature);
    });

    map.on('mousemove', (event) => {
        const startedAt = hoverPerfNow();

        if (findListingFeatureAtPoint(map, event.point)) {
            map.getCanvas().style.cursor = 'pointer';
            hoverTooltip.value = null;
            updateHoveredFeature(null);
            recordHoverPerf({
                queryMs: hoverPerfNow() - startedAt,
                tooltipMs: 0,
                highlightMs: 0,
                totalMs: hoverPerfNow() - startedAt,
            });
            return;
        }

        const feature = findInteractiveHoverFeature(map, event.point);
        const afterQuery = hoverPerfNow();
        const hasFeature = Boolean(feature?.geometry);

        map.getCanvas().style.cursor = hasFeature ? 'pointer' : '';
        hoverTooltip.value = feature?.geometry ? tooltipFromFeature(feature, event.point) : null;
        const afterTooltip = hoverPerfNow();
        updateHoveredFeature(feature?.geometry ? feature : null);
        const finishedAt = hoverPerfNow();
        recordHoverPerf({
            queryMs: afterQuery - startedAt,
            tooltipMs: afterTooltip - afterQuery,
            highlightMs: finishedAt - afterTooltip,
            totalMs: finishedAt - startedAt,
        });
    });

    map.on('mouseleave', () => {
        clearMapHoverState();
    });
}

function findInteractiveHoverFeature(
    map: maplibregl.Map,
    point: maplibregl.PointLike,
): RenderedMapFeature | undefined {
    const layerPriority = interactiveLayersForZoom(map.getZoom());

    for (const layerId of layerPriority) {
        if (!map.getLayer(layerId)) {
            continue;
        }

        const feature = (map.queryRenderedFeatures(point, { layers: [layerId] }) as RenderedMapFeature[])
            .find((candidate) => candidate.geometry);

        if (feature?.geometry) {
            return feature;
        }
    }

    return undefined;
}

function findInteractiveFeature(
    map: maplibregl.Map,
    point: maplibregl.PointLike,
    lngLat: [number, number],
): RenderedMapFeature | undefined {
    const layerPriority = interactiveLayersForZoom(map.getZoom());

    for (const layerId of layerPriority) {
        if (!map.getLayer(layerId)) {
            continue;
        }

        const feature = bestInteractiveFeatureAtPoint(
            map.queryRenderedFeatures(point, { layers: [layerId] }) as RenderedMapFeature[],
            lngLat,
        );

        if (feature?.geometry) {
            return feature;
        }
    }

    return undefined;
}

function interactiveLayersForZoom(zoom: number): string[] {
    return zoom >= externalPolygonMinZoom
        ? ['external-kadastr-polygons-fill', 'external-kadastr-land-fill', 'parcel-fill']
        : ['parcel-fill'];
}

function bestInteractiveFeatureAtPoint(
    features: RenderedMapFeature[],
    lngLat: [number, number],
): RenderedMapFeature | undefined {
    const candidates = features
        .filter((feature) => feature.geometry)
        .map((feature, index) => ({
            feature: fullFeatureWithHitGeometry(feature, lngLat),
            index,
        }))
        .filter((candidate) => candidate.feature?.feature.geometry)
        .map((candidate) => ({
            ...candidate,
            feature: candidate.feature as { feature: RenderedMapFeature; hitGeometry: Geometry },
            area: displayGeometryArea(candidate.feature?.hitGeometry),
        }))
        .filter((candidate) => candidate.area > 0)
        .sort((left, right) => left.area - right.area || left.index - right.index);

    return candidates[0]?.feature.feature ?? features.find((feature) => feature.geometry);
}

function fullFeatureWithHitGeometry(
    feature: RenderedMapFeature,
    lngLat: [number, number],
): { feature: RenderedMapFeature; hitGeometry: Geometry } | null {
    if (!feature.geometry) {
        return null;
    }

    const hitGeometry = geometryAtPoint(feature.geometry, lngLat);
    const displayGeometry = cleanGeometryForParcelDisplay(feature.geometry);

    if (!hitGeometry || !displayGeometry) {
        return null;
    }

    return {
        feature: {
            ...feature,
            geometry: displayGeometry,
        },
        hitGeometry,
    };
}

function geometryAtPoint(geometry: Geometry, lngLat: [number, number]): Geometry | null {
    if (geometry.type === 'Polygon') {
        return polygonContainsPoint(geometry.coordinates as [number, number][][], lngLat)
            ? cleanGeometryForParcelDisplay(geometry)
            : null;
    }

    if (geometry.type === 'MultiPolygon') {
        const containingPolygons = geometry.coordinates
            .filter((polygon) => polygonContainsPoint(polygon as [number, number][][], lngLat))
            .map((polygon) => ({
                polygon: polygon as [number, number][][],
                area: polygonDisplayArea(polygon as [number, number][][]),
            }))
            .filter((candidate) => candidate.area > 0)
            .sort((left, right) => left.area - right.area);

        const polygon = containingPolygons[0]?.polygon;

        return polygon
            ? cleanGeometryForParcelDisplay({ type: 'Polygon', coordinates: polygon })
            : null;
    }

    return null;
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
    const purposeCode = stringProperty(properties.purpose_code)
        ?? stringProperty(properties.purpose);
    const purpose = purposeLabel(purposeCode)
        ?? stringProperty(properties.purpose_name)
        ?? stringProperty(properties.use)
        ?? stringProperty(properties.landuse)
        ?? purposeCode;
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
    const mapWidth = mapContainer.value?.clientWidth ?? window.innerWidth;
    const tooltipWidth = Math.min(340, Math.max(220, mapWidth - 32));
    const estimatedHeight = 34 + rows.length * 27;
    const placement: HoverTooltip['placement'] = y > estimatedHeight + 28 ? 'above' : 'below';
    const tooltipCenterX = clamp(x, tooltipWidth / 2 + 16, mapWidth - tooltipWidth / 2 - 16);
    const tooltipY = placement === 'above' ? y - 16 : y + 16;
    const arrowX = clamp(x - (tooltipCenterX - tooltipWidth / 2), 18, tooltipWidth - 18);

    return {
        x: tooltipCenterX,
        y: tooltipY,
        arrowX,
        placement,
        rows,
    };
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

function closedSketchRingPoints(points: string): string {
    const firstPoint = points.split(' ')[0];

    return firstPoint ? `${points} ${firstPoint}` : points;
}

function sketchFromGeometry(geometry: Geometry, parcel: Parcel): ParcelSketch | null {
    const polygons = sketchPolygonsFromGeometry(geometry);
    const exteriorRings = polygons
        .map((polygon) => polygon[0])
        .filter((candidateRing): candidateRing is [number, number][] => Boolean(candidateRing?.length));
    const ring = sketchOutlineRing(exteriorRings);

    if (ring.length < 3) {
        return null;
    }

    const openRing = removeClosingCoordinate(ring);
    const allOpenRings = [openRing];
    const allCoordinates = allOpenRings.flat();
    const averageLat = allCoordinates.reduce((sum, coordinate) => sum + coordinate[1], 0) / allCoordinates.length;
    const projectCoordinate = ([lng, lat]: [number, number]) => ({
        x: lng * Math.cos(averageLat * Math.PI / 180),
        y: lat,
        lng,
        lat,
    });
    const projectedRings = allOpenRings.map((candidateRing) => candidateRing.map(projectCoordinate));
    const projectedCoordinates = projectedRings.flat();
    const minX = Math.min(...projectedCoordinates.map((point) => point.x));
    const maxX = Math.max(...projectedCoordinates.map((point) => point.x));
    const minY = Math.min(...projectedCoordinates.map((point) => point.y));
    const maxY = Math.max(...projectedCoordinates.map((point) => point.y));
    const drawing = { left: 48, top: 18, width: 164, height: 100 };
    const scale = Math.min(
        drawing.width / Math.max(maxX - minX, 0.000001),
        drawing.height / Math.max(maxY - minY, 0.000001),
    );
    const offsetX = drawing.left + (drawing.width - (maxX - minX) * scale) / 2;
    const offsetY = drawing.top + (drawing.height - (maxY - minY) * scale) / 2;
    const toSvgPoint = (point: ReturnType<typeof projectCoordinate>) => ({
        x: offsetX + (point.x - minX) * scale,
        y: offsetY + (maxY - point.y) * scale,
        lng: point.lng,
        lat: point.lat,
    });
    const svgRings = projectedRings.map((candidateRing) => ({
        points: candidateRing
            .map(toSvgPoint)
            .map((point) => `${roundSvg(point.x)},${roundSvg(point.y)}`)
            .join(' '),
        isHole: false,
    }));
    const labelProjected = openRing.map(projectCoordinate).map(toSvgPoint);
    const svgPoints = labelProjected;
    const labels = parcelPointLabels();
    const centerX = svgPoints.reduce((sum, point) => sum + point.x, 0) / svgPoints.length;
    const centerY = svgPoints.reduce((sum, point) => sum + point.y, 0) / svgPoints.length;
    const usedLabelBoxes: SketchLabelBox[] = [];
    const vertices = svgPoints.slice(0, labels.length).map((point, index) => {
        const label = labels[index];
        const { box, ...labelPosition } = sketchVertexLabelPosition(
            point,
            centerX,
            centerY,
            label,
            usedLabelBoxes,
            svgPoints.slice(0, labels.length),
        );

        usedLabelBoxes.push(box);

        return {
            label,
            x: point.x,
            y: point.y,
            ...labelPosition,
        };
    });
    const edgeDistances = openRing.map((coordinate, index) => {
        const nextCoordinate = openRing[(index + 1) % openRing.length];

        return distanceMeters(coordinate, nextCoordinate);
    });
    const visibleEdgeCount = Math.min(edgeDistances.length, labels.length);
    const edges = edgeDistances.slice(0, visibleEdgeCount).map((distance, index) => ({
        label: `${labels[index]} -> ${labels[(index + 1) % labels.length]}`,
        length: formatMeters(distance),
    }));

    if (edgeDistances.length > visibleEdgeCount) {
        edges.push({
            label: `Ще ${edgeDistances.length - visibleEdgeCount} стор.`,
            length: '',
        });
    }

    const points = svgRings[0]?.points ?? '';

    return {
        points,
        closedPoints: `${points} ${roundSvg(svgPoints[0].x)},${roundSvg(svgPoints[0].y)}`,
        rings: svgRings,
        vertices,
        edges,
        area: formatArea(parcel.area.declared) ?? 'Дані відсутні',
        perimeter: formatMeters(edgeDistances.reduce((sum, distance) => sum + distance, 0)),
        centroid: centroidFromRing(openRing),
    };
}

function downloadSelectedSketch(): void {
    if (!selectedSketch.value || !selectedParcel.value) {
        return;
    }

    const canvas = document.createElement('canvas');
    const scale = 2;
    canvas.width = 520 * scale;
    canvas.height = 390 * scale;

    const context = canvas.getContext('2d');

    if (!context) {
        return;
    }

    context.scale(scale, scale);
    drawRoundedRect(context, 0, 0, 520, 520, 16, '#f8f9f7');
    context.fillStyle = '#111827';
    context.font = '700 20px Arial, sans-serif';
    context.fillText(selectedParcel.value.cadastral_number, 28, 42);

    context.save();
    context.translate(0, 36);
    context.scale(2, 2);
    drawSketchShape(context, selectedSketch.value);
    context.restore();

    context.fillStyle = '#4b5563';
    context.font = '400 18px Arial, sans-serif';
    context.fillText('Площа:', 28, 338);
    context.fillText('Периметр:', 268, 338);
    context.fillStyle = '#111827';
    context.font = '700 18px Arial, sans-serif';
    context.fillText(selectedSketch.value.area, 94, 338);
    context.fillText(selectedSketch.value.perimeter, 360, 338);

    const link = document.createElement('a');

    link.href = canvas.toDataURL('image/png');
    link.download = `dilyanka-${selectedParcel.value.cadastral_number}.png`;
    document.body.append(link);
    link.click();
    link.remove();
}

function selectedParcelRouteCenter(): [number, number] | null {
    if (selectedSketch.value) {
        return selectedSketch.value.centroid;
    }

    const centroid = selectedParcel.value?.centroid;

    return typeof centroid?.lng === 'number' && typeof centroid?.lat === 'number'
        ? [centroid.lng, centroid.lat]
        : null;
}

async function copySelectedParcelLink(): Promise<void> {
    const url = selectedParcelPublicUrl();

    try {
        await navigator.clipboard.writeText(url);
    } catch {
        copyTextWithFallback(url);
    }

    searchStatus.value = 'Посилання скопійовано';
}

async function shareSelectedParcel(): Promise<void> {
    const url = selectedParcelPublicUrl();
    const title = selectedParcel.value
        ? `Ділянка ${selectedParcel.value.cadastral_number}`
        : 'KadastrView';

    if (navigator.share) {
        try {
            await navigator.share({
                title,
                text: 'Переглянути земельну ділянку на KadastrView',
                url,
            });
            return;
        } catch (error) {
            if (isShareAbortError(error)) {
                return;
            }
        }
    }

    try {
        await navigator.clipboard.writeText(url);
    } catch {
        copyTextWithFallback(url);
    }

    searchStatus.value = 'Посилання скопійовано';
}

function isShareAbortError(error: unknown): boolean {
    return error instanceof DOMException && error.name === 'AbortError';
}

function selectedParcelPublicUrl(): string {
    const cadastralNumber = selectedParcel.value?.cadastral_number;

    if (!cadastralNumber || cadastralNumber === 'Вибраний полігон') {
        return window.location.href;
    }

    const encodedNumber = encodeURIComponent(cadastralNumber).replace(/%3A/gi, ':');

    return `${window.location.origin}/dilyanka/${encodedNumber}`;
}

async function createParcelServiceOrder(serviceId: ParcelOrderServiceId): Promise<void> {
    const parcel = selectedParcel.value;

    if (!parcel) {
        return;
    }

    const contact = orderContact.value.trim();

    if (!contact) {
        orderStatus.value = 'Вкажіть email або телефон, щоб ми могли надіслати документ.';
        return;
    }

    orderSubmittingServiceId.value = serviceId;
    orderStatus.value = 'Створюємо оплату Stripe...';
    window.localStorage.setItem(orderContactStorageKey, contact);

    try {
        const response = await fetch(apiUrl('/api/v1/orders'), {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                cadastralNumber: parcel.cadastral_number,
                serviceId,
                customer: contact.includes('@')
                    ? { email: contact }
                    : { phone: contact },
            }),
        });
        const payload = await response.json() as {
            data?: { pageUrl?: string };
            error?: string;
        };

        if (!response.ok || !payload.data?.pageUrl) {
            throw new Error(payload.error ?? 'Не вдалося створити рахунок');
        }

        orderStatus.value = 'Переходимо до оплати...';
        window.location.assign(payload.data.pageUrl);
    } catch (error) {
        orderStatus.value = error instanceof Error
            ? error.message
            : 'Не вдалося створити рахунок. Спробуйте ще раз.';
    } finally {
        orderSubmittingServiceId.value = null;
    }
}

async function hydrateReturnedPayment(): Promise<void> {
    const { orderId, paymentState } = paymentReturnParams();

    if (!orderId || !paymentState) {
        return;
    }

    parcelServicesExpanded.value = true;

    if (paymentState === 'cancel') {
        orderStatus.value = 'Оплату скасовано. Можна повторити замовлення, коли буде зручно.';
        paymentModal.value = {
            title: 'Оплату скасовано',
            message: 'Замовлення не оплачено. Можна повторити оплату або вибрати іншу послугу.',
            tone: 'warning',
        };
        return;
    }

    orderStatus.value = 'Перевіряємо оплату Stripe...';
    paymentModal.value = {
        title: 'Перевіряємо оплату',
        message: 'Stripe повернув вас на карту. Зараз перевіряємо статус замовлення.',
        tone: 'pending',
    };

    try {
        const response = await fetch(apiUrl(`/api/v1/orders/${encodeURIComponent(orderId)}`));
        const payload = await response.json() as { data?: ParcelOrder | null; error?: string };

        if (!response.ok || !payload.data) {
            throw new Error(payload.error ?? 'Не вдалося перевірити оплату');
        }

        orderStatus.value = orderStatusMessage(payload.data);
        paymentModal.value = paymentModalForOrder(payload.data);
    } catch (error) {
        orderStatus.value = error instanceof Error
            ? error.message
            : 'Оплата пройшла, але не вдалося перевірити статус замовлення.';
        paymentModal.value = {
            title: 'Потрібна перевірка',
            message: orderStatus.value,
            tone: 'warning',
        };
    }
}

function orderStatusMessage(order: ParcelOrder): string {
    const serviceTitle = order.serviceTitle ? ` (${order.serviceTitle})` : '';

    if (order.status === 'paid') {
        return `Оплату отримано${serviceTitle}. Замовлення в обробці.`;
    }

    if (order.status === 'payment_failed') {
        return `Оплату не завершено${serviceTitle}. Спробуйте оформити замовлення ще раз.`;
    }

    return `Платіж очікує підтвердження Stripe${serviceTitle}. Якщо оплата вже списана, статус оновиться після підтвердження.`;
}

function paymentModalForOrder(order: ParcelOrder): PaymentModal {
    const serviceTitle = order.serviceTitle ? `: ${order.serviceTitle}` : '';

    if (order.status === 'paid') {
        return {
            title: 'Оплату отримано',
            message: `Замовлення${serviceTitle} прийнято в обробку. Ми підготуємо документ і звʼяжемося з вами за вказаним контактом.`,
            tone: 'success',
        };
    }

    if (order.status === 'payment_failed') {
        return {
            title: 'Оплату не завершено',
            message: 'Платіж не був завершений. Можна повторити замовлення ще раз.',
            tone: 'warning',
        };
    }

    return {
        title: 'Очікуємо підтвердження',
        message: 'Stripe ще підтверджує платіж. Якщо кошти списані, статус замовлення оновиться автоматично.',
        tone: 'pending',
    };
}

function closePaymentModal(): void {
    paymentModal.value = null;

    const url = new URL(window.location.href);

    url.searchParams.delete('payment');
    url.searchParams.delete('order');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

function emptyListingDraft(): ListingDraft {
    return {
        listingType: null,
        price: '',
        currency: 'USD',
        title: '',
        area: '',
        description: '',
        contactName: '',
        contactPhone: '',
        contactEmail: '',
        photos: [],
    };
}

function openListingWizard(): void {
    if (!selectedParcel.value) {
        return;
    }

    cleanupListingPhotoPreviews();
    listingDraft.value = {
        ...emptyListingDraft(),
        area: `${selectedParcel.value.area.declared} га`,
        title: defaultListingTitle(selectedParcel.value),
        contactEmail: orderContact.value.includes('@') ? orderContact.value : '',
        contactPhone: !orderContact.value.includes('@') ? orderContact.value : '',
    };
    listingStep.value = 1;
    listingSubmitStatus.value = '';
    listingWizardOpen.value = true;
}

function closeListingWizard(): void {
    listingWizardOpen.value = false;
    listingSubmitting.value = false;
    listingSubmitStatus.value = '';
    cleanupListingPhotoPreviews();
}

function nextListingStep(): void {
    if (!listingCanContinue.value) {
        return;
    }

    listingStep.value = Math.min(listingStep.value + 1, listingWizardSteps.length);
}

function previousListingStep(): void {
    listingStep.value = Math.max(1, listingStep.value - 1);
}

function canContinueListingStep(step: number): boolean {
    const draft = listingDraft.value;

    if (step === 1) {
        return draft.listingType !== null;
    }

    if (step === 2) {
        return Number.parseFloat(draft.price.replace(',', '.')) > 0 && draft.title.trim().length >= 4;
    }

    if (step === 4) {
        return draft.contactPhone.replace(/[^\d+]/g, '').length >= 10;
    }

    if (step === 5) {
        return canContinueListingStep(1) && canContinueListingStep(2) && canContinueListingStep(4);
    }

    return true;
}

function defaultListingTitle(parcel: Parcel): string {
    const purpose = parcelPurpose(parcel);

    return purpose === 'Дані відсутні'
        ? `Ділянка ${parcel.cadastral_number}`
        : purpose;
}

function handleListingPhotos(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? [])
        .filter((file) => file.type.startsWith('image/'))
        .slice(0, 5);

    cleanupListingPhotoPreviews();
    listingDraft.value.photos = files;
    listingPhotoPreviewUrls.value = files.map((file) => URL.createObjectURL(file));
    input.value = '';
}

function removeListingPhoto(index: number): void {
    const previewUrl = listingPhotoPreviewUrls.value[index];

    if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
    }

    listingDraft.value.photos = listingDraft.value.photos.filter((_, photoIndex) => photoIndex !== index);
    listingPhotoPreviewUrls.value = listingPhotoPreviewUrls.value.filter((_, photoIndex) => photoIndex !== index);
}

function cleanupListingPhotoPreviews(): void {
    for (const url of listingPhotoPreviewUrls.value) {
        URL.revokeObjectURL(url);
    }

    listingPhotoPreviewUrls.value = [];
}

async function openListingBoard(): Promise<void> {
    listingBoardOpen.value = true;
    listingBoardStatus.value = '';
    await loadParcelListingsForBoard();
}

function closeListingBoard(): void {
    listingBoardOpen.value = false;
    selectedBoardListing.value = null;
    listingBoardStatus.value = '';
}

function startListingFromBoard(): void {
    if (!selectedParcel.value) {
        listingBoardStatus.value = 'Оберіть ділянку на карті, а потім додайте оголошення.';
        return;
    }

    listingBoardOpen.value = false;
    openListingWizard();
}

async function loadParcelListingsForBoard(): Promise<void> {
    if (listingsLoading.value) {
        return;
    }

    listingsLoading.value = true;

    try {
        const response = await fetch(apiUrl('/api/v1/listings'));
        const payload = await response.json() as { data?: ParcelListing[]; error?: string };

        if (!response.ok || !Array.isArray(payload.data)) {
            throw new Error(payload.error ?? 'Не вдалося завантажити оголошення');
        }

        parcelListings.value = payload.data;
    } catch (error) {
        listingBoardStatus.value = error instanceof Error
            ? error.message
            : 'Не вдалося завантажити оголошення';
    } finally {
        listingsLoading.value = false;
    }
}

function openListingDetails(listing: ParcelListing): void {
    selectedBoardListing.value = listing;

    if (listing.centroid && mapInstance.value) {
        mapInstance.value.easeTo({
            center: [listing.centroid.lng, listing.centroid.lat],
            zoom: Math.max(mapInstance.value.getZoom(), 14),
            duration: 500,
        });
    }
}

async function focusListing(listing: ParcelListing): Promise<void> {
    const map = mapInstance.value;

    listingBoardOpen.value = false;

    if (listing.centroid && map) {
        map.easeTo({
            center: [listing.centroid.lng, listing.centroid.lat],
            zoom: Math.max(map.getZoom(), 15.5),
            duration: 650,
        });
    }

    if (listing.cadastralNumber) {
        await openParcelByNumber(listing.cadastralNumber, true);
    }
}

function listingTypeLabel(type: ListingTypeId): string {
    return listingTypeOptions.find((option) => option.id === type)?.title ?? 'Оголошення';
}

function listingTypeShortLabel(type: ListingTypeId): string {
    if (type === 'land_sale') {
        return 'Продаж землі';
    }

    if (type === 'land_with_house_sale') {
        return 'Продаж з будинком';
    }

    if (type === 'land_rent') {
        return 'Оренда';
    }

    return 'Лізинг';
}

function listingTypeIcon(type: ListingTypeId): Component {
    return listingTypeOptions.find((option) => option.id === type)?.icon ?? Trees;
}

function listingStatusLabel(status: string): string {
    if (status === 'pending_review') {
        return 'На перевірці';
    }

    if (status === 'active') {
        return 'Активне';
    }

    return status;
}

function listingPriceLabel(listing: ParcelListing): string {
    const price = Number(listing.price);

    if (!Number.isFinite(price)) {
        return 'Ціну уточнюйте';
    }

    return `${new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 0 }).format(price)} ${listing.currency}`;
}

function listingPhotoUrl(listing: ParcelListing): string | null {
    return listing.photos?.find((photo) => photo.url)?.url ?? null;
}

function listingContactName(listing: ParcelListing): string {
    return listing.contact?.name?.trim() || 'Власник';
}

function listingContactPhone(listing: ParcelListing): string {
    return listing.contact?.phone?.trim() ?? '';
}

function listingContactEmail(listing: ParcelListing): string {
    return listing.contact?.email?.trim() ?? '';
}

function listingDateLabel(value?: string | null): string {
    if (!value) {
        return '';
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return '';
    }

    return new Intl.DateTimeFormat('uk-UA', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    }).format(date);
}

function listingCountWord(count: number): string {
    const mod10 = count % 10;
    const mod100 = count % 100;

    if (mod10 === 1 && mod100 !== 11) {
        return 'оголошення';
    }

    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
        return 'оголошення';
    }

    return 'оголошень';
}

async function submitListing(): Promise<void> {
    const parcel = selectedParcel.value;
    const centroid = selectedParcelListingCentroid();

    if (!parcel || !centroid || !listingCanContinue.value) {
        return;
    }

    listingSubmitting.value = true;
    listingSubmitStatus.value = listingDraft.value.photos.length > 0
        ? 'Оптимізуємо фото...'
        : 'Публікуємо оголошення...';

    try {
        const photos = await Promise.all(listingDraft.value.photos.map(compressListingPhoto));

        listingSubmitStatus.value = 'Публікуємо оголошення...';

        const response = await fetch(apiUrl('/api/v1/listings'), {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                cadastralNumber: parcel.cadastral_number,
                listingType: listingDraft.value.listingType,
                price: listingDraft.value.price,
                currency: listingDraft.value.currency,
                title: listingDraft.value.title,
                area: listingDraft.value.area,
                description: listingDraft.value.description,
                contact: {
                    name: listingDraft.value.contactName,
                    phone: listingDraft.value.contactPhone,
                    email: listingDraft.value.contactEmail,
                },
                centroid,
                photos,
            }),
        });
        const payload = await response.json() as { data?: ParcelListing; error?: string };

        if (!response.ok || !payload.data) {
            throw new Error(payload.error ?? 'Не вдалося опублікувати оголошення');
        }

        listingSubmitStatus.value = 'Оголошення додано на карту.';
        await loadParcelListingsLayer();
        await loadParcelListingsForBoard();
        window.setTimeout(() => closeListingWizard(), 700);
    } catch (error) {
        listingSubmitStatus.value = error instanceof Error
            ? error.message
            : 'Не вдалося опублікувати оголошення. Спробуйте ще раз.';
    } finally {
        listingSubmitting.value = false;
    }
}

async function compressListingPhoto(file: File): Promise<ListingPhotoPayload> {
    const image = await loadImageFromFile(file);
    const maxSize = 1200;
    const scale = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    if (!context) {
        throw new Error('Не вдалося підготувати фото');
    }

    canvas.width = width;
    canvas.height = height;
    context.drawImage(image, 0, 0, width, height);

    let quality = 0.72;
    let url = canvas.toDataURL('image/jpeg', quality);

    while (url.length > 500_000 && quality > 0.42) {
        quality -= 0.08;
        url = canvas.toDataURL('image/jpeg', quality);
    }

    if (url.length > 520_000) {
        throw new Error(`Фото "${file.name}" завелике навіть після оптимізації`);
    }

    return {
        name: file.name,
        size: Math.floor((url.split(',')[1]?.length ?? 0) * 0.75),
        type: 'image/jpeg',
        url,
    };
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        const objectUrl = URL.createObjectURL(file);

        image.onload = () => {
            URL.revokeObjectURL(objectUrl);
            resolve(image);
        };
        image.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            reject(new Error(`Не вдалося прочитати фото "${file.name}"`));
        };
        image.src = objectUrl;
    });
}

function selectedParcelListingCentroid(): { lat: number; lng: number } | null {
    const routeCenter = selectedParcelRouteCenter();

    if (routeCenter) {
        return {
            lng: routeCenter[0],
            lat: routeCenter[1],
        };
    }

    const centroid = selectedParcel.value?.centroid;

    if (
        !centroid
        || !Number.isFinite(centroid.lat)
        || !Number.isFinite(centroid.lng)
        || (centroid.lat === 0 && centroid.lng === 0)
    ) {
        return null;
    }

    return {
        lat: centroid.lat,
        lng: centroid.lng,
    };
}

function paymentReturnParams(): { orderId: string | null; paymentState: string | null } {
    const params = new URLSearchParams(window.location.search);

    return {
        orderId: params.get('order'),
        paymentState: params.get('payment'),
    };
}

async function loadParcelOpenRights(cadastralNumber: string): Promise<ParcelRights | null> {
    if (!cadastralNumber || cadastralNumber === 'Вибраний полігон') {
        return null;
    }

    try {
        const response = await fetch(apiUrl(`/api/v1/parcels/${encodeURIComponent(cadastralNumber)}/open-rights`));

        if (!response.ok) {
            return null;
        }

        const payload = await response.json() as { data?: ParcelRights | null };

        return payload.data ?? null;
    } catch {
        return null;
    }
}

async function preferredParcelRights(
    cadastralNumber: string,
    ...candidates: Array<ParcelRights | null | undefined>
): Promise<ParcelRights | null> {
    const meaningfulRights = candidates.find(hasMeaningfulParcelRights);

    if (meaningfulRights) {
        return meaningfulRights;
    }

    const openRights = await loadParcelOpenRights(cadastralNumber);

    return hasMeaningfulParcelRights(openRights)
        ? openRights
        : candidates.find((rights): rights is ParcelRights => Boolean(rights)) ?? openRights;
}

function copyTextWithFallback(value: string): void {
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
}

async function downloadSelectedParcelGeoJson(): Promise<void> {
    const feature = await selectedDownloadFeature();

    if (!feature) {
        searchStatus.value = 'Геометрія ділянки недоступна';
        return;
    }

    downloadTextFile(
        `dilyanka-${selectedParcelFileName()}.geojson`,
        JSON.stringify(feature, null, 2),
        'application/geo+json;charset=utf-8',
    );
    searchStatus.value = 'GeoJSON завантажено';
}

async function downloadSelectedParcelKml(): Promise<void> {
    const feature = await selectedDownloadFeature();

    if (!feature) {
        searchStatus.value = 'Геометрія ділянки недоступна';
        return;
    }

    downloadTextFile(
        `dilyanka-${selectedParcelFileName()}.kml`,
        kmlFromFeature(feature),
        'application/vnd.google-earth.kml+xml;charset=utf-8',
    );
    searchStatus.value = 'KML завантажено';
}

async function selectedDownloadFeature(): Promise<Feature<Geometry> | null> {
    const parcel = selectedParcel.value;

    if (!parcel) {
        return null;
    }

    if (!selectedParcelFeature.value?.geometry) {
        selectedParcelFeature.value = await loadSelectedParcelGeometry(parcel.cadastral_number);
    }

    if (!selectedParcelFeature.value?.geometry) {
        return null;
    }

    return {
        ...toPlainFeature(selectedParcelFeature.value),
        properties: {
            ...(selectedParcelFeature.value.properties ?? {}),
            cadastral_number: parcel.cadastral_number,
            area_declared: parcel.area.declared,
            ownership_type: parcelOwnership(parcel),
            purpose_name: parcelPurpose(parcel),
            land_category: parcelCategory(parcel),
            address: parcelAddress(parcel),
            rights_type: parcel.rights?.rightType ?? null,
            lease_tenant: parcel.rights?.tenant ?? null,
            lease_landlord: parcel.rights?.landlord ?? null,
            lease_landlord_code: parcel.rights?.landlordCode ?? null,
            lease_contract_number: parcel.rights?.contractNumber ?? null,
            lease_contract_date: parcel.rights?.contractDate ?? null,
            lease_registered_at: parcel.rights?.registeredAt ?? null,
            lease_valid_until: parcel.rights?.validUntil ?? null,
            lease_area: parcel.rights?.leaseArea ?? null,
            lease_land_use: parcel.rights?.landUse ?? null,
            lease_address: parcel.rights?.address ?? null,
            rights_source: parcel.rights?.source ?? null,
            rights_source_url: parcel.rights?.sourceUrl ?? null,
            rights_dataset_name: parcel.rights?.datasetName ?? null,
            rights_publisher: parcel.rights?.publisher ?? null,
            source_updated_at: parcel.source.updated_at ?? null,
            url: selectedParcelPublicUrl(),
        },
    };
}

async function loadSelectedParcelGeometry(cadastralNumber: string): Promise<Feature<Geometry> | null> {
    if (!cadastralNumber || cadastralNumber === 'Вибраний полігон') {
        return null;
    }

    try {
        const response = await fetch(apiUrl(`/api/v1/parcels/${encodeURIComponent(cadastralNumber)}/geometry`));

        if (!response.ok) {
            return null;
        }

        const payload = await response.json() as { data?: Feature<Geometry> | null };

        return payload.data?.geometry
            ? cleanFeatureForParcelDisplay(payload.data) ?? toPlainFeature(payload.data)
            : null;
    } catch {
        return null;
    }
}

function selectedParcelFileName(): string {
    return (selectedParcel.value?.cadastral_number ?? 'selected')
        .replace(/[^0-9A-Za-zА-Яа-яІіЇїЄєҐґ_-]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'selected';
}

function downloadTextFile(fileName: string, content: string, type: string): void {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.download = fileName;
    link.href = url;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function kmlFromFeature(feature: Feature<Geometry>): string {
    const parcel = selectedParcel.value;
    const name = xmlEscape(parcel?.cadastral_number ?? 'Вибрана ділянка');
    const description = xmlEscape([
        `Площа: ${parcel?.area.declared ?? 'Дані відсутні'} га`,
        `Власність: ${parcel ? parcelOwnership(parcel) : 'Дані відсутні'}`,
        `Категорія: ${parcel ? parcelCategory(parcel) : 'Дані відсутні'}`,
        `Адреса: ${parcel ? parcelAddress(parcel) : 'Дані відсутні'}`,
        `URL: ${selectedParcelPublicUrl()}`,
    ].join('\n'));

    return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${name}</name>
    <Placemark>
      <name>${name}</name>
      <description>${description}</description>
      <Style>
        <LineStyle><color>ff120bd9</color><width>3</width></LineStyle>
        <PolyStyle><color>55120bd9</color></PolyStyle>
      </Style>
      ${kmlGeometry(feature.geometry)}
    </Placemark>
  </Document>
</kml>`;
}

function kmlGeometry(geometry: Geometry): string {
    if (geometry.type === 'Polygon') {
        return kmlPolygon(geometry.coordinates as [number, number][][]);
    }

    if (geometry.type === 'MultiPolygon') {
        const polygons = geometry.coordinates
            .map((polygon) => kmlPolygon(polygon as [number, number][][]))
            .join('\n');

        return `<MultiGeometry>${polygons}</MultiGeometry>`;
    }

    return '<Point><coordinates>0,0,0</coordinates></Point>';
}

function kmlPolygon(polygon: [number, number][][]): string {
    const [outerRing, ...innerRings] = polygon;
    const innerBoundaries = innerRings
        .map((ring) => `
        <innerBoundaryIs>
          <LinearRing><coordinates>${kmlCoordinates(ring)}</coordinates></LinearRing>
        </innerBoundaryIs>`)
        .join('');

    return `<Polygon>
        <outerBoundaryIs>
          <LinearRing><coordinates>${kmlCoordinates(outerRing ?? [])}</coordinates></LinearRing>
        </outerBoundaryIs>${innerBoundaries}
      </Polygon>`;
}

function kmlCoordinates(ring: [number, number][]): string {
    return ring
        .map(([lng, lat]) => `${lng},${lat},0`)
        .join(' ');
}

function xmlEscape(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function centroidFromRing(ring: [number, number][]): [number, number] {
    const sums = ring.reduce((accumulator, coordinate) => ({
        lng: accumulator.lng + coordinate[0],
        lat: accumulator.lat + coordinate[1],
    }), { lng: 0, lat: 0 });

    return [sums.lng / ring.length, sums.lat / ring.length];
}

function drawSketchShape(context: CanvasRenderingContext2D, sketch: ParcelSketch): void {
    const rings = sketch.rings.map((ring) => ({
        isHole: ring.isHole,
        points: ring.points.split(' ').map((point) => {
            const [x, y] = point.split(',').map(Number);

            return { x, y };
        }),
    }));
    const [outerRing, ...otherRings] = rings;
    const points = outerRing?.points;

    if (!points || points.length === 0) {
        return;
    }

    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
    context.closePath();
    context.fillStyle = 'rgba(47, 158, 68, 0.1)';
    context.fill();
    context.strokeStyle = '#149d45';
    context.lineWidth = 2;
    context.lineJoin = 'round';
    context.stroke();

    for (const ring of otherRings) {
        if (ring.points.length === 0) {
            continue;
        }

        context.beginPath();
        context.moveTo(ring.points[0].x, ring.points[0].y);
        ring.points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
        context.closePath();
        context.fillStyle = ring.isHole ? 'rgba(248, 249, 247, 0.86)' : 'rgba(47, 158, 68, 0.1)';
        context.fill();
        context.strokeStyle = '#149d45';
        context.lineWidth = 1.5;
        context.stroke();
    }

    for (const point of sketch.vertices) {
        context.beginPath();
        context.arc(point.x, point.y, 4, 0, Math.PI * 2);
        context.fillStyle = '#149d45';
        context.fill();
        context.fillStyle = '#111827';
        context.font = '700 13px Arial, sans-serif';
        context.textAlign = point.anchor === 'middle' ? 'center' : point.anchor;
        context.fillText(point.label, point.labelX, point.labelY);
        context.textAlign = 'left';
    }
}

function drawRoundedRect(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
    fill: string,
): void {
    context.beginPath();
    context.roundRect(x, y, width, height, radius);
    context.fillStyle = fill;
    context.fill();
}

function sketchPolygonsFromGeometry(geometry: Geometry): [number, number][][][] {
    if (geometry.type === 'Polygon') {
        return [geometry.coordinates as [number, number][][]];
    }

    if (geometry.type === 'MultiPolygon') {
        return geometry.coordinates
            .map((polygon) => polygon as [number, number][][])
            .filter((polygon) => (polygon[0]?.length ?? 0) >= 4);
    }

    return [];
}

function sketchOutlineRing(rings: [number, number][][]): [number, number][] {
    if (rings.length === 1) {
        return simplifySketchRing(rings[0]);
    }

    const points = rings
        .flatMap(removeClosingCoordinate)
        .filter((coordinate) => Number.isFinite(coordinate[0]) && Number.isFinite(coordinate[1]));

    if (points.length <= 3) {
        return simplifySketchRing(closeRing(points));
    }

    const uniquePoints = Array.from(
        new Map(points.map((point) => [`${point[0].toFixed(10)},${point[1].toFixed(10)}`, point])).values(),
    ).sort((left, right) => left[0] - right[0] || left[1] - right[1]);

    if (uniquePoints.length <= 3) {
        return simplifySketchRing(closeRing(uniquePoints));
    }

    const lower: [number, number][] = [];
    for (const point of uniquePoints) {
        while (lower.length >= 2 && hullCross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) {
            lower.pop();
        }
        lower.push(point);
    }

    const upper: [number, number][] = [];
    for (const point of uniquePoints.slice().reverse()) {
        while (upper.length >= 2 && hullCross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) {
            upper.pop();
        }
        upper.push(point);
    }

    return simplifySketchRing(closeRing([...lower.slice(0, -1), ...upper.slice(0, -1)]));
}

function hullCross(origin: [number, number], left: [number, number], right: [number, number]): number {
    return (left[0] - origin[0]) * (right[1] - origin[1]) - (left[1] - origin[1]) * (right[0] - origin[0]);
}

function closeRing(ring: [number, number][]): [number, number][] {
    const first = ring[0];
    const last = ring[ring.length - 1];

    if (!first || !last) {
        return ring;
    }

    return first[0] === last[0] && first[1] === last[1]
        ? ring
        : [...ring, [first[0], first[1]]];
}

function simplifySketchRing(ring: [number, number][]): [number, number][] {
    let openRing = removeClosingCoordinate(ring);

    if (openRing.length <= 3) {
        return closeRing(openRing);
    }

    let changed = true;

    while (changed && openRing.length > 3) {
        const simplified = openRing.filter((point, index) => {
            const previous = openRing[(index - 1 + openRing.length) % openRing.length];
            const next = openRing[(index + 1) % openRing.length];

            return !isNearlyCollinear(previous, point, next);
        });

        changed = simplified.length !== openRing.length;
        openRing = simplified.length >= 3 ? simplified : openRing;
    }

    return closeRing(openRing);
}

function isNearlyCollinear(
    previous: [number, number],
    point: [number, number],
    next: [number, number],
): boolean {
    const area = Math.abs(hullCross(previous, point, next));
    const baseLength = Math.hypot(next[0] - previous[0], next[1] - previous[1]);
    const distanceFromLine = baseLength === 0 ? 0 : area / baseLength;
    const pointDistance = Math.min(
        Math.hypot(point[0] - previous[0], point[1] - previous[1]),
        Math.hypot(point[0] - next[0], point[1] - next[1]),
    );

    return distanceFromLine < 0.000015 && pointDistance > 0.000001;
}

function removeClosingCoordinate(ring: [number, number][]): [number, number][] {
    const first = ring[0];
    const last = ring[ring.length - 1];

    if (first && last && first[0] === last[0] && first[1] === last[1]) {
        return ring.slice(0, -1);
    }

    return ring;
}

function signedRingArea(ring: [number, number][]): number {
    return ring.reduce((sum, coordinate, index) => {
        const nextCoordinate = ring[(index + 1) % ring.length];

        return sum + coordinate[0] * nextCoordinate[1] - nextCoordinate[0] * coordinate[1];
    }, 0) / 2;
}

function displayGeometryArea(geometry: Geometry | null | undefined): number {
    if (!geometry) {
        return 0;
    }

    if (geometry.type === 'Polygon') {
        return polygonDisplayArea(geometry.coordinates as [number, number][][]);
    }

    if (geometry.type === 'MultiPolygon') {
        return geometry.coordinates.reduce(
            (sum, polygon) => sum + polygonDisplayArea(polygon as [number, number][][]),
            0,
        );
    }

    return 0;
}

function polygonDisplayArea(polygon: [number, number][][]): number {
    const exteriorArea = Math.abs(signedRingArea(polygon[0] ?? []));
    const holesArea = polygon
        .slice(1)
        .reduce((sum, ring) => sum + Math.abs(signedRingArea(ring)), 0);

    return Math.max(0, exteriorArea - holesArea);
}

function polygonContainsPoint(polygon: [number, number][][], point: [number, number]): boolean {
    const exteriorRing = polygon[0];

    if (!exteriorRing || !ringContainsPoint(exteriorRing, point)) {
        return false;
    }

    return !polygon.slice(1).some((hole) => ringContainsPoint(hole, point));
}

function ringContainsPoint(ring: [number, number][], point: [number, number]): boolean {
    if (ring.length < 4) {
        return false;
    }

    const [pointLng, pointLat] = point;
    let inside = false;

    for (let currentIndex = 0, previousIndex = ring.length - 1; currentIndex < ring.length; previousIndex = currentIndex++) {
        const [currentLng, currentLat] = ring[currentIndex];
        const [previousLng, previousLat] = ring[previousIndex];

        if (pointIsOnSegment(point, [previousLng, previousLat], [currentLng, currentLat])) {
            return true;
        }

        const intersects = (currentLat > pointLat) !== (previousLat > pointLat)
            && pointLng < ((previousLng - currentLng) * (pointLat - currentLat)) / (previousLat - currentLat) + currentLng;

        if (intersects) {
            inside = !inside;
        }
    }

    return inside;
}

function pointIsOnSegment(
    point: [number, number],
    start: [number, number],
    end: [number, number],
): boolean {
    const [pointLng, pointLat] = point;
    const [startLng, startLat] = start;
    const [endLng, endLat] = end;
    const cross = (pointLat - startLat) * (endLng - startLng) - (pointLng - startLng) * (endLat - startLat);
    const tolerance = 1e-10;

    if (Math.abs(cross) > tolerance) {
        return false;
    }

    return pointLng >= Math.min(startLng, endLng) - tolerance
        && pointLng <= Math.max(startLng, endLng) + tolerance
        && pointLat >= Math.min(startLat, endLat) - tolerance
        && pointLat <= Math.max(startLat, endLat) + tolerance;
}

function cleanFeatureForParcelDisplay(feature: Feature<Geometry> | null | undefined): Feature<Geometry> | null {
    if (!feature?.geometry) {
        return null;
    }

    const geometry = cleanGeometryForParcelDisplay(feature.geometry);

    if (!geometry) {
        return null;
    }

    return {
        ...toPlainFeature(feature),
        geometry,
    };
}

function cleanGeometryForParcelDisplay(geometry: Geometry): Geometry | null {
    if (geometry.type === 'Polygon') {
        const polygon = cleanPolygonRings(geometry.coordinates as [number, number][][]);

        return polygon ? { type: 'Polygon', coordinates: polygon } : null;
    }

    if (geometry.type === 'MultiPolygon') {
        const polygons = geometry.coordinates
            .map((polygon) => cleanPolygonRings(polygon as [number, number][][]))
            .filter((polygon): polygon is [number, number][][] => polygon !== null);

        return polygons.length > 0 ? { type: 'MultiPolygon', coordinates: polygons } : null;
    }

    return geometry;
}

function cleanPolygonRings(polygon: [number, number][][]): [number, number][][] | null {
    const exteriorRing = cleanExteriorRing(polygon[0]);

    if (!exteriorRing) {
        return null;
    }

    const innerRings = polygon
        .slice(1)
        .map(cleanExteriorRing)
        .filter((ring): ring is [number, number][] => ring !== null);

    return [exteriorRing, ...innerRings];
}

function cleanExteriorRing(ring: [number, number][] | undefined): [number, number][] | null {
    if (!ring || ring.length < 4) {
        return null;
    }

    const cleanedRing = ring.map((coordinate) => [coordinate[0], coordinate[1]] as [number, number]);
    const first = cleanedRing[0];
    const last = cleanedRing[cleanedRing.length - 1];

    if (first[0] !== last[0] || first[1] !== last[1]) {
        cleanedRing.push([first[0], first[1]]);
    }

    return Math.abs(signedRingArea(cleanedRing)) > 0 ? cleanedRing : null;
}

function distanceMeters(from: [number, number], to: [number, number]): number {
    const earthRadiusMeters = 6371008.8;
    const fromLat = from[1] * Math.PI / 180;
    const toLat = to[1] * Math.PI / 180;
    const deltaLat = (to[1] - from[1]) * Math.PI / 180;
    const deltaLng = (to[0] - from[0]) * Math.PI / 180;
    const a = Math.sin(deltaLat / 2) ** 2
        + Math.cos(fromLat) * Math.cos(toLat) * Math.sin(deltaLng / 2) ** 2;

    return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatMeters(value: number): string {
    const rounded = value >= 100 ? Math.round(value) : Math.round(value * 10) / 10;

    return `${new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 1 }).format(rounded)} м`;
}

function roundSvg(value: number): number {
    return Math.round(value * 10) / 10;
}

function sketchVertexLabelPosition(
    point: { x: number; y: number },
    centerX: number,
    centerY: number,
    label: string,
    usedBoxes: SketchLabelBox[],
    allPoints: Array<{ x: number; y: number }>,
): SketchLabelPosition {
    const deltaX = point.x - centerX;
    const deltaY = point.y - centerY;
    const length = Math.hypot(deltaX, deltaY) || 1;
    const directionX = deltaX / length;
    const directionY = deltaY / length;
    const candidates: Array<{ dx: number; dy: number; anchor: SketchVertex['anchor'] }> = [
        { dx: -7, dy: -8, anchor: 'end' },
        { dx: 7, dy: -8, anchor: 'start' },
        { dx: 11, dy: 3, anchor: 'start' },
        { dx: -11, dy: 3, anchor: 'end' },
        { dx: 0, dy: -12, anchor: 'middle' },
        { dx: 0, dy: 16, anchor: 'middle' },
        { dx: 9, dy: 14, anchor: 'start' },
        { dx: -9, dy: 14, anchor: 'end' },
        { dx: 17, dy: -4, anchor: 'start' },
        { dx: -17, dy: -4, anchor: 'end' },
        { dx: 19, dy: -16, anchor: 'start' },
        { dx: -19, dy: -16, anchor: 'end' },
        { dx: 19, dy: 21, anchor: 'start' },
        { dx: -19, dy: 21, anchor: 'end' },
    ];

    const scoredCandidates = candidates.map((candidate) => {
        const rawLabelX = point.x + candidate.dx;
        const rawLabelY = point.y + candidate.dy;
        const labelX = clamp(rawLabelX, 14, 246);
        const labelY = clamp(rawLabelY, 16, 176);
        const preferredDirectionPenalty = Math.max(
            0,
            1 - ((candidate.dx * directionX + candidate.dy * directionY) / Math.max(Math.hypot(candidate.dx, candidate.dy), 1)),
        );
        const boundaryPenalty = Math.abs(rawLabelX - labelX) + Math.abs(rawLabelY - labelY);
        const distance = Math.hypot(candidate.dx, candidate.dy);
        const box = sketchLabelBox(labelX, labelY, label, candidate.anchor);
        const overlap = usedBoxes.reduce((sum, usedBox) => sum + sketchBoxOverlapArea(box, usedBox), 0);
        const ownDistance = Math.hypot(labelX - point.x, labelY - point.y);
        const nearestOtherDistance = allPoints
            .filter((candidatePoint) => candidatePoint !== point)
            .reduce((nearest, candidatePoint) => Math.min(
                nearest,
                Math.hypot(labelX - candidatePoint.x, labelY - candidatePoint.y),
            ), Number.POSITIVE_INFINITY);
        const foreignPointPenalty = nearestOtherDistance < ownDistance + 3
            ? (ownDistance + 3 - nearestOtherDistance) * 20
            : 0;

        return {
            labelX,
            labelY,
            anchor: candidate.anchor,
            box,
            score: overlap * 7000
                + foreignPointPenalty
                + distance * 0.38
                + preferredDirectionPenalty * 7
                + boundaryPenalty * 12,
        };
    }).sort((left, right) => left.score - right.score);

    const bestCandidate = scoredCandidates[0];

    return {
        labelX: roundSvg(bestCandidate.labelX),
        labelY: roundSvg(bestCandidate.labelY),
        anchor: bestCandidate.anchor,
        box: bestCandidate.box,
    };
}

function sketchLabelBox(
    labelX: number,
    labelY: number,
    label: string,
    anchor: SketchVertex['anchor'],
): SketchLabelBox {
    const width = label.length > 1 ? 25 : 19;
    const height = 21;
    const left = anchor === 'middle'
        ? labelX - width / 2
        : anchor === 'end'
            ? labelX - width
            : labelX;

    return {
        left: left - 2,
        right: left + width + 2,
        top: labelY - height + 1,
        bottom: labelY + 5,
    };
}

function sketchBoxOverlapArea(first: SketchLabelBox, second: SketchLabelBox): number {
    const width = Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left));
    const height = Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top));

    return width * height;
}

function parcelPointLabels(): string[] {
    return ['A', 'Б', 'В', 'Г', 'Ґ', 'Д', 'Е', 'Є', 'Ж', 'З', 'И', 'І'];
}

async function selectRenderedFeature(feature: RenderedMapFeature): Promise<void> {
    const properties = feature.properties ?? {};
    const cadastralNumber = stringProperty(properties.cadastral_number)
        ?? stringProperty(properties.cadnum)
        ?? stringProperty(properties.cad_num)
        ?? stringProperty(properties.parcels)
        ?? stringProperty(properties.id)
        ?? 'Вибраний полігон';
    const displayFeature = feature;
    const selectedFeature = cleanFeatureForParcelDisplay(toPlainFeature(displayFeature)) ?? toPlainFeature(displayFeature);

    highlightSelectedFeature(displayFeature);
    searchStatus.value = '';

    const parcel = parcelFromFeature(displayFeature, cadastralNumber);
    const sketchFeature = selectedMapFeatureForSketch(displayFeature, cadastralNumber) ?? selectedFeature;
    selectedParcel.value = {
        ...parcel,
        rights: await preferredParcelRights(cadastralNumber, parcel.rights),
    };
    selectedSketch.value = sketchFromGeometry(sketchFeature.geometry, parcel);
    selectedParcelFeature.value = toPlainFeature(sketchFeature);
    setParcelRoute(cadastralNumber);
}

function parcelNumberFromRoute(): string | null {
    const match = window.location.pathname.match(/^\/dilyanka\/([^/?#]+)/);
    const rawNumber = match?.[1];

    return rawNumber ? decodeURIComponent(rawNumber).trim() : null;
}

function territoryRouteFromPath(): TerritoryRoute | null {
    const match = window.location.pathname.match(/^\/oblast\/([^/?#]+)/);
    const rawSlug = match?.[1];
    const slug = rawSlug ? decodeURIComponent(rawSlug).trim() : '';
    const hint = oblastRouteHints[slug];

    return hint ? { type: 'oblast', slug, hint } : null;
}

function setParcelRoute(cadastralNumber: string): void {
    if (cadastralNumber === 'Вибраний полігон') {
        return;
    }

    const encodedNumber = encodeURIComponent(cadastralNumber).replace(/%3A/gi, ':');
    const nextPath = `/dilyanka/${encodedNumber}`;
    const nextUrl = `${nextPath}${window.location.search}${window.location.hash}`;

    if (window.location.pathname === nextPath) {
        return;
    }

    window.history.pushState({ cadastralNumber }, '', nextUrl);
}

function findVisibleFeatureByNumber(cadastralNumber: string): RenderedMapFeature | null {
    return bestRenderedFeatureByNumber(cadastralNumber);
}

function bestRenderedFeatureByNumber(cadastralNumber: string): RenderedMapFeature | null {
    const map = mapInstance.value;

    if (!map) {
        return null;
    }

    const normalizedNumber = cadastralNumber.replace(/\s+/g, '');
    const layers = [
        'external-kadastr-polygons-fill',
        'external-kadastr-land-fill',
        'parcel-fill',
    ];
    const matches: RenderedMapFeature[] = [];

    for (const layerId of layers) {
        if (!map.getLayer(layerId)) {
            continue;
        }

        matches.push(
            ...map.queryRenderedFeatures({ layers: [layerId] })
                .filter((feature) => featureMatchesNumber(feature as RenderedMapFeature, normalizedNumber)) as RenderedMapFeature[],
        );
    }

    return bestFeatureByDisplayArea(matches);
}

function bestFeatureByDisplayArea(features: RenderedMapFeature[]): RenderedMapFeature | null {
    return features
        .filter((feature) => Boolean(feature.geometry))
        .map((feature) => ({
            feature,
            area: displayGeometryArea(feature.geometry),
        }))
        .sort((left, right) => right.area - left.area)[0]?.feature ?? null;
}

function selectedMapFeatureForSketch(
    fallbackFeature: RenderedMapFeature,
    cadastralNumber: string,
): Feature<Geometry> | null {
    const map = mapInstance.value;

    if (!map || fallbackFeature.source !== 'external-kadastr') {
        return cleanFeatureForParcelDisplay(toPlainFeature(fallbackFeature));
    }

    const sameSourceLayers = interactiveLayersForFeature(fallbackFeature)
        .filter((layerId) => map.getLayer(layerId));
    const sameSourceMatches = sameSourceLayers.flatMap((layerId) => (
        map.queryRenderedFeatures({ layers: [layerId] }) as RenderedMapFeature[]
    ))
        .filter((feature) => featureMatchesNumber(feature, cadastralNumber.replace(/\s+/g, '')));
    const sameSourceFeature = combinedFeatureFromRenderedFeatures(sameSourceMatches)
        ?? bestFeatureByDisplayArea(sameSourceMatches);

    if (sameSourceFeature?.geometry) {
        return cleanFeatureForParcelDisplay(toPlainFeature(sameSourceFeature));
    }

    const selectedLayers = externalSelectedLayerIds.filter((layerId) => {
        if (!map.getLayer(layerId)) {
            return false;
        }

        if (fallbackFeature.sourceLayer === 'polygons') {
            return layerId.includes('-polygons-') && layerId.endsWith('-fill');
        }

        if (fallbackFeature.sourceLayer === 'land_polygons') {
            return layerId.includes('-land-') && layerId.endsWith('-fill');
        }

        return layerId.endsWith('-fill');
    });
    const matches = selectedLayers.flatMap((layerId) => (
        map.queryRenderedFeatures({ layers: [layerId] }) as RenderedMapFeature[]
    ));
    const selectedFeature = combinedFeatureFromRenderedFeatures(matches)
        ?? bestFeatureByDisplayArea(matches)
        ?? bestRenderedFeatureByNumber(cadastralNumber)
        ?? fallbackFeature;

    return cleanFeatureForParcelDisplay(toPlainFeature(selectedFeature));
}

function combinedFeatureFromRenderedFeatures(features: RenderedMapFeature[]): RenderedMapFeature | null {
    const cleanFeatures = features
        .map((feature) => cleanFeatureForParcelDisplay(toPlainFeature(feature)) as RenderedMapFeature | null)
        .filter((feature): feature is RenderedMapFeature => Boolean(feature?.geometry));
    const polygons: [number, number][][][] = [];
    const seenPolygons = new Set<string>();

    for (const feature of cleanFeatures) {
        for (const polygon of sketchPolygonsFromGeometry(feature.geometry)) {
            const key = polygonSignature(polygon);

            if (!seenPolygons.has(key)) {
                seenPolygons.add(key);
                polygons.push(polygon);
            }
        }
    }

    if (polygons.length === 0) {
        return null;
    }

    const baseFeature = bestFeatureByDisplayArea(cleanFeatures) ?? cleanFeatures[0];

    return {
        ...baseFeature,
        geometry: polygons.length === 1
            ? { type: 'Polygon', coordinates: polygons[0] }
            : { type: 'MultiPolygon', coordinates: polygons },
    };
}

function polygonSignature(polygon: [number, number][][]): string {
    return polygon
        .map((ring) => ring
            .map(([lng, lat]) => `${lng.toFixed(7)},${lat.toFixed(7)}`)
            .join(';'))
        .join('|');
}

function interactiveLayersForFeature(feature: RenderedMapFeature): string[] {
    if (feature.sourceLayer === 'polygons') {
        return ['external-kadastr-polygons-fill'];
    }

    if (feature.sourceLayer === 'land_polygons') {
        return ['external-kadastr-land-fill'];
    }

    return ['external-kadastr-polygons-fill', 'external-kadastr-land-fill'];
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
    const category = stringProperty(properties.category)
        ?? stringProperty(properties.land_category);
    const purposeCode = stringProperty(properties.purpose_code)
        ?? stringProperty(properties.purpose);
    const purposeName = purposeLabel(purposeCode)
        ?? stringProperty(properties.purpose_name)
        ?? stringProperty(properties.use)
        ?? stringProperty(properties.landuse);
    const address = stringProperty(properties.address);
    const sourceName = stringProperty(properties.source_name)
        ?? (feature.source === 'external-kadastr' ? 'kadastrova-karta vector tiles' : 'Відкритий геошар');

    return {
        cadastral_number: cadastralNumber,
        area: {
            declared: numericProperty(properties.area_declared) ?? numericProperty(properties.area) ?? 0,
            calculated: 0,
            unit: 'ha',
        },
        ownership_type: ownership ? { id: null, name: ownership } : null,
        land_category: category ? { id: null, name: category } : null,
        purpose: purposeCode || purposeName ? {
            code: purposeCode,
            name: purposeName,
        } : null,
        address,
        rights: parcelRightsFromProperties(properties),
        freshness_status: ownership ?? 'open_reference',
        source: {
            name: sourceName,
            updated_at: '2026-07-14',
            official: false,
        },
        centroid: { lat: 0, lng: 0 },
    };
}

function parcelOwnership(parcel: Parcel): string {
    return parcel.ownership_type?.name
        ?? parcel.freshness_status
        ?? 'Дані відсутні';
}

function parcelPurpose(parcel: Parcel): string {
    return parcel.purpose?.name
        ?? purposeLabel(parcel.purpose?.code ?? null)
        ?? 'Дані відсутні';
}

function parcelUseType(parcel: Parcel): string {
    const purpose = parcelPurpose(parcel);

    if (!parcel.purpose?.code) {
        return purpose;
    }

    if (purpose === 'Дані відсутні') {
        return parcel.purpose.code;
    }

    return `${parcel.purpose.code} ${purpose}`;
}

function parcelCategory(parcel: Parcel): string {
    return parcel.land_category?.name ?? 'Дані відсутні';
}

function parcelAddress(parcel: Parcel): string {
    const address = parcel.address?.trim();

    return address && address !== 'Україна' ? address : 'Дані відсутні';
}

function shouldShowParcelRights(parcel: Parcel): boolean {
    return hasMeaningfulParcelRights(parcel.rights) || isAgriculturalParcel(parcel);
}

function isAgriculturalParcel(parcel: Parcel): boolean {
    const purposeCode = parcel.purpose?.code?.trim();
    const purposeText = [
        parcel.purpose?.name,
        parcel.land_category?.name,
        parcel.freshness_status,
    ].filter(Boolean).join(' ').toLowerCase();

    return Boolean(purposeCode?.startsWith('01.'))
        || purposeText.includes('сільськогосподар')
        || purposeText.includes('товарного сільськогосподарського виробництва')
        || purposeText.includes('особистого селянського господарства')
        || purposeText.includes('фермерського господарства');
}

function parcelRightsRows(parcel: Parcel): ParcelRightsRow[] {
    const rights = parcel.rights;

    if (!rights || !hasMeaningfulParcelRights(rights)) {
        return [];
    }

    return [
        rightsRow('Тип права', rights.rightType),
        rightsRow('Орендар', rights.tenant),
        rightsRow('Орендодавець', rights.landlord),
        rightsRow('ЄДРПОУ орендодавця', rights.landlordCode),
        rightsRow('Договір', rights.contractNumber),
        rightsRow('Дата договору', rights.contractDate),
        rightsRow('Зареєстровано', rights.registeredAt),
        rightsRow('Строк дії', rights.validUntil),
        rightsRow('Площа за договором', rights.leaseArea),
        rightsRow('Призначення в наборі', rights.landUse),
        rightsRow('Адреса в наборі', rights.address),
        rightsRow('Розпорядник', rights.publisher),
        rightsRow('Оновлено', rights.updatedAt),
    ].filter((row): row is ParcelRightsRow => row !== null);
}

function parcelRightsStatus(parcel: Parcel): string {
    return parcelRightsRows(parcel).length > 0 ? 'Є у відкритих даних' : 'Даних не знайдено';
}

function hasMeaningfulParcelRights(rights: ParcelRights | null | undefined): boolean {
    return Boolean(
        hasMeaningfulRightsValue(rights?.tenant)
        || hasMeaningfulRightsValue(rights?.landlord)
        || hasMeaningfulRightsValue(rights?.landlordCode)
        || hasMeaningfulRightsValue(rights?.contractNumber)
        || hasMeaningfulRightsValue(rights?.contractDate)
        || hasMeaningfulRightsValue(rights?.registeredAt)
        || hasMeaningfulRightsValue(rights?.validUntil),
    );
}

function rightsRow(label: string, value: string | null | undefined): ParcelRightsRow | null {
    return hasMeaningfulRightsValue(value) ? { label, value: value.trim() } : null;
}

function hasMeaningfulRightsValue(value: string | null | undefined): value is string {
    const normalized = value?.trim() ?? '';

    return normalized !== ''
        && !normalized.toLowerCase().startsWith('http://')
        && !normalized.toLowerCase().startsWith('https://');
}

function parcelRightsFromProperties(properties: Record<string, unknown>): ParcelRights | null {
    const rights: ParcelRights = {
        rightType: firstStringProperty(properties, [
            'right_type',
            'rights_type',
            'property_right_type',
            'real_right_type',
            'lease_type',
            'encumbrance_type',
        ]),
        tenant: firstStringProperty(properties, [
            'tenant',
            'lessee',
            'lease_tenant',
            'leaseholder',
            'renter',
            'orendar',
            'orendar_name',
            'орендар',
        ]),
        landlord: firstStringProperty(properties, [
            'landlord',
            'lessor',
            'lease_landlord',
            'owner',
            'orendodavec',
            'orendodavets',
            'орендодавець',
        ]),
        landlordCode: firstStringProperty(properties, [
            'landlord_code',
            'lessor_code',
            'edrpou',
            'edrpou_code',
            'code edrpou (of a person authorized by him)',
            'код єдрпоу',
        ]),
        contractNumber: firstStringProperty(properties, [
            'contract_number',
            'lease_contract_number',
            'lease_contract',
            'agreement_number',
            'registration_number',
            'record_number',
        ]),
        contractDate: firstStringProperty(properties, [
            'contract_date',
            'lease_contract_date',
            'agreement_date',
            'date of conclusion of the land lease agreement',
            'дата договору',
            'дата укладення',
        ]),
        registeredAt: firstStringProperty(properties, [
            'registered_at',
            'registration_date',
            'right_registered_at',
            'lease_registered_at',
        ]),
        validUntil: firstStringProperty(properties, [
            'valid_until',
            'lease_valid_until',
            'lease_until',
            'contract_until',
            'expires_at',
            'end_date',
            'the validity period of the land lease agreement',
            'строк дії',
        ]),
        leaseArea: formatRightsArea(firstStringProperty(properties, [
            'lease_area',
            'land plot area, ha (with four decimal places)',
            'area',
            'площа',
        ])),
        landUse: firstStringProperty(properties, [
            'lease_land_use',
            'purpose of land plot**',
            'purpose of land plot',
            'land_use',
            'цільове призначення',
            'призначення',
        ]),
        address: firstStringProperty(properties, [
            'lease_address',
            'location of the land plot (address)',
            'address',
            'адреса',
            'місце розташування',
        ]),
        source: firstStringProperty(properties, [
            'rights_source',
            'lease_source',
            'register_source',
        ]),
        sourceUrl: firstStringProperty(properties, [
            'rights_source_url',
            'source_url',
            'dataset_url',
            'resource_url',
        ]),
        datasetName: firstStringProperty(properties, [
            'rights_dataset_name',
            'dataset_title',
            'dataset_name',
        ]),
        publisher: firstStringProperty(properties, [
            'rights_publisher',
            'publisher',
            'organization',
        ]),
        updatedAt: firstStringProperty(properties, [
            'rights_updated_at',
            'updated_at',
            'imported_at',
        ]),
    };

    return Object.values(rights).some(Boolean) ? rights : null;
}

function formatRightsArea(value: string | null): string | null {
    if (!value) {
        return null;
    }

    return value.toLowerCase().includes('га') ? value : `${value} га`;
}

function firstStringProperty(properties: Record<string, unknown>, keys: string[]): string | null {
    for (const key of keys) {
        const value = stringProperty(properties[key]);

        if (value) {
            return value;
        }
    }

    return null;
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

function purposeLabel(code: string | null): string | null {
    if (!code) {
        return null;
    }

    const normalizedCode = code.trim().match(/\d{2}\.\d{2}/)?.[0];

    return normalizedCode ? landPurposeLabels[normalizedCode] ?? null : null;
}

async function loadParcelLayer(): Promise<FeatureCollection> {
    const response = await fetch('/data/parcels-overview.geojson');
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
        filter: [
            'all',
            ['!=', ['get', 'source_name'], 'geoBoundaries Ukraine ADM2'],
            ['!=', ['get', 'source_name'], 'geoBoundaries Ukraine ADM3'],
        ],
        minzoom: overviewParcelMinZoom,
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
        filter: [
            'all',
            ['!=', ['get', 'source_name'], 'geoBoundaries Ukraine ADM2'],
            ['!=', ['get', 'source_name'], 'geoBoundaries Ukraine ADM3'],
        ],
        minzoom: overviewParcelMinZoom,
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

async function loadParcelListingsLayer(): Promise<void> {
    const map = mapInstance.value;

    if (!map) {
        return;
    }

    const response = await fetch(apiUrl('/api/v1/listings.geojson'));
    const geojson = await response.json() as FeatureCollection;
    const source = map.getSource('parcel-listings') as maplibregl.GeoJSONSource | undefined;

    if (source) {
        source.setData(geojson);
        return;
    }

    map.addSource('parcel-listings', {
        type: 'geojson',
        data: geojson,
    });

    await ensureListingMarkerImages(map);

    map.addLayer({
        id: 'parcel-listings-dot',
        type: 'symbol',
        source: 'parcel-listings',
        layout: {
            'icon-image': [
                'case',
                ['==', ['get', 'listingType'], 'land_rent'],
                'listing-marker-rent',
                ['==', ['get', 'listingType'], 'long_term_lease'],
                'listing-marker-lease',
                ['==', ['get', 'listingType'], 'land_with_house_sale'],
                'listing-marker-house',
                'listing-marker-land',
            ],
            'icon-size': [
                'interpolate',
                ['linear'],
                ['zoom'],
                5,
                0.58,
                14,
                0.78,
                18,
                0.95,
            ],
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
        },
    });

    map.addLayer({
        id: 'parcel-listings-label',
        type: 'symbol',
        source: 'parcel-listings',
        minzoom: 10,
        layout: {
            'text-field': ['get', 'priceLabel'],
            'text-size': 12,
            'text-font': ['Open Sans Bold'],
            'text-offset': [0, 1.65],
            'text-anchor': 'top',
            'text-allow-overlap': false,
        },
        paint: {
            'text-color': '#111827',
            'text-halo-color': '#ffffff',
            'text-halo-width': 1.4,
        },
    });
}

async function ensureListingMarkerImages(map: maplibregl.Map): Promise<void> {
    const markerImages = {
        'listing-marker-land': listingMarkerSvg(treesIconNode()),
        'listing-marker-house': listingMarkerSvg(houseIconNode()),
        'listing-marker-rent': listingMarkerSvg(keyRoundIconNode()),
        'listing-marker-lease': listingMarkerSvg(calendarClockIconNode()),
    };

    await Promise.all(Object.entries(markerImages).map(async ([name, svg]) => {
        if (map.hasImage(name)) {
            return;
        }

        const image = await loadSvgImage(svg);
        map.addImage(name, image);
    }));
}

function loadSvgImage(svg: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image(48, 48);
        const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Не вдалося завантажити іконку оголошення'));
        image.src = svgUrl;
    });
}

type LucideIconNode = Array<[string, Record<string, string>]>;

function listingMarkerSvg(iconNode: LucideIconNode): string {
    return `
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
            <rect x="5" y="5" width="38" height="38" rx="9" fill="#eef7f2"/>
            <rect x="5" y="5" width="38" height="38" rx="9" fill="none" stroke="white" stroke-width="3"/>
            <g transform="translate(12 12)" fill="none" stroke="#047857" color="#047857" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                ${lucideIconNodeToSvg(iconNode)}
            </g>
        </svg>
    `;
}

function lucideIconNodeToSvg(iconNode: LucideIconNode): string {
    return iconNode.map(([tagName, attrs]) => {
        const attributes = Object.entries(attrs)
            .filter(([name]) => name !== 'key')
            .map(([name, value]) => `${name}="${escapeHtml(value)}"`)
            .join(' ');

        return `<${tagName} ${attributes}/>`;
    }).join('');
}

function treesIconNode(): LucideIconNode {
    return [
        ['path', { d: 'M10 10v.2A3 3 0 0 1 8.9 16H5a3 3 0 0 1-1-5.8V10a3 3 0 0 1 6 0Z' }],
        ['path', { d: 'M7 16v6' }],
        ['path', { d: 'M13 19v3' }],
        ['path', { d: 'M12 19h8.3a1 1 0 0 0 .7-1.7L18 14h.3a1 1 0 0 0 .7-1.7L16 9h.2a1 1 0 0 0 .8-1.7L13 3l-1.4 1.5' }],
    ];
}

function houseIconNode(): LucideIconNode {
    return [
        ['path', { d: 'M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8' }],
        ['path', { d: 'M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' }],
    ];
}

function keyRoundIconNode(): LucideIconNode {
    return [
        ['path', { d: 'M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z' }],
        ['circle', { cx: '16.5', cy: '7.5', r: '.5', fill: 'currentColor' }],
    ];
}

function calendarClockIconNode(): LucideIconNode {
    return [
        ['path', { d: 'M16 14v2.2l1.6 1' }],
        ['path', { d: 'M16 2v4' }],
        ['path', { d: 'M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5' }],
        ['path', { d: 'M3 10h5' }],
        ['path', { d: 'M8 2v4' }],
        ['circle', { cx: '16', cy: '16', r: '6' }],
    ];
}

function bindListingInteractions(map: maplibregl.Map): void {
    map.on('click', 'parcel-listings-dot', (event) => {
        hoverTooltip.value = null;
        updateHoveredFeature(null);

        const feature = event.features?.[0];

        if (!feature?.geometry || feature.geometry.type !== 'Point') {
            return;
        }

        const properties = feature.properties ?? {};
        const container = document.createElement('div');
        container.className = 'listing-map-popup';
        container.innerHTML = `
            <strong class="listing-map-popup-title">${escapeHtml(String(properties.title ?? 'Оголошення'))}</strong>
            <span class="listing-map-popup-price">${escapeHtml(String(properties.priceLabel ?? ''))}</span>
            <small class="listing-map-popup-number">${escapeHtml(String(properties.cadastralNumber ?? ''))}</small>
        `;

        new maplibregl.Popup({ closeButton: true, closeOnClick: true, className: 'listing-popup' })
            .setLngLat(feature.geometry.coordinates as [number, number])
            .setDOMContent(container)
            .addTo(map);
    });

    map.on('mouseenter', 'parcel-listings-dot', () => {
        map.getCanvas().style.cursor = 'pointer';
    });

    map.on('mouseleave', 'parcel-listings-dot', () => {
        map.getCanvas().style.cursor = '';
    });
}

function findListingFeatureAtPoint(map: maplibregl.Map, point: maplibregl.PointLike): maplibregl.MapGeoJSONFeature | null {
    if (!map.getLayer('parcel-listings-dot')) {
        return null;
    }

    return map.queryRenderedFeatures(point, { layers: ['parcel-listings-dot'] })[0] ?? null;
}

function escapeHtml(value: string): string {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
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
        minzoom: externalPolygonMinZoom,
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
        minzoom: externalPolygonMinZoom,
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

    addExternalHighlightLayers(map, 'polygons');
    addExternalHighlightLayers(map, 'land_polygons');
    moveLayerToTop(map, 'external-kadastr-polygons-fill');
    moveLayerToTop(map, 'external-kadastr-polygons-line');
    externalHoverLayerIds.forEach((layerId) => moveLayerToTop(map, layerId));
    externalSelectedLayerIds.forEach((layerId) => moveLayerToTop(map, layerId));
}

function addExternalHighlightLayers(map: maplibregl.Map, sourceLayer: 'polygons' | 'land_polygons'): void {
    const layerPrefix = sourceLayer === 'polygons'
        ? 'external-kadastr-polygons'
        : 'external-kadastr-land';

    map.addLayer({
        id: `${layerPrefix}-hover-fill`,
        type: 'fill',
        source: 'external-kadastr',
        'source-layer': sourceLayer,
        filter: emptyExternalFeatureFilter,
        minzoom: sourceLayer === 'polygons' ? externalPolygonMinZoom : 11,
        paint: {
            'fill-color': '#5fb8d2',
            'fill-opacity': 0.42,
        },
    });

    map.addLayer({
        id: `${layerPrefix}-hover-line`,
        type: 'line',
        source: 'external-kadastr',
        'source-layer': sourceLayer,
        filter: emptyExternalFeatureFilter,
        minzoom: sourceLayer === 'polygons' ? externalPolygonMinZoom : 11,
        paint: {
            'line-color': '#2c8fb0',
            'line-width': [
                'interpolate',
                ['linear'],
                ['zoom'],
                11,
                2.4,
                16,
                3.6,
            ],
            'line-opacity': 0.95,
        },
    });

    map.addLayer({
        id: `${layerPrefix}-selected-fill`,
        type: 'fill',
        source: 'external-kadastr',
        'source-layer': sourceLayer,
        filter: emptyExternalFeatureFilter,
        minzoom: sourceLayer === 'polygons' ? externalPolygonMinZoom : 11,
        paint: {
            'fill-color': '#d90b12',
            'fill-opacity': 0.34,
        },
    });

    map.addLayer({
        id: `${layerPrefix}-selected-line`,
        type: 'line',
        source: 'external-kadastr',
        'source-layer': sourceLayer,
        filter: emptyExternalFeatureFilter,
        minzoom: sourceLayer === 'polygons' ? externalPolygonMinZoom : 11,
        paint: {
            'line-color': '#d90b12',
            'line-width': [
                'interpolate',
                ['linear'],
                ['zoom'],
                11,
                3,
                16,
                4.5,
            ],
            'line-opacity': 1,
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

    if (applyExternalFeatureFilter(map, feature as RenderedMapFeature, externalSelectedLayerIds)) {
        const selectedSource = map.getSource('selected-parcel') as maplibregl.GeoJSONSource | undefined;
        selectedSource?.setData(emptyFeatureCollection());
        externalSelectedLayerIds.forEach((layerId) => moveLayerToTop(map, layerId));
        return;
    }

    clearExternalFeatureFilter(map, externalSelectedLayerIds);

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

function clearSelectedFeature(): void {
    const map = mapInstance.value;

    if (!map) {
        return;
    }

    const selectedSource = map.getSource('selected-parcel') as maplibregl.GeoJSONSource | undefined;
    selectedSource?.setData(emptyFeatureCollection());
    clearExternalFeatureFilter(map, externalSelectedLayerIds);
}

function moveLayerToTop(map: maplibregl.Map, layerId: string): void {
    if (map.getLayer(layerId)) {
        map.moveLayer(layerId);
    }
}

function updateHoveredFeature(feature: Feature<Geometry> | null): void {
    pendingHoveredFeature = feature;

    if (hoverAnimationFrame !== null) {
        return;
    }

    hoverAnimationFrame = window.requestAnimationFrame(() => {
        hoverAnimationFrame = null;
        applyHoveredFeature(pendingHoveredFeature);
    });
}

function applyHoveredFeature(feature: Feature<Geometry> | null): void {
    const startedAt = hoverPerfNow();
    const map = mapInstance.value;
    const featureKey = feature?.geometry ? featureIdentityKey(feature as RenderedMapFeature) : null;

    if (featureKey === hoveredFeatureKey) {
        recordHoverApplyPerf(hoverPerfNow() - startedAt);
        return;
    }

    hoveredFeatureKey = featureKey;

    if (!map) {
        recordHoverApplyPerf(hoverPerfNow() - startedAt);
        return;
    }

    const hoveredSource = map.getSource('hovered-parcel') as maplibregl.GeoJSONSource | undefined;

    if (!hoveredSource) {
        recordHoverApplyPerf(hoverPerfNow() - startedAt);
        return;
    }

    hoveredSource.setData(feature?.geometry ? {
        type: 'FeatureCollection',
        features: [toPlainFeature(feature)],
    } : emptyFeatureCollection());

    ensureHoverLayersOnTop(map);
    recordHoverApplyPerf(hoverPerfNow() - startedAt);
}

function ensureHoverLayersOnTop(map: maplibregl.Map): void {
    if (hoverLayersRaised) {
        return;
    }

    moveLayerToTop(map, 'parcel-hover-fill');
    moveLayerToTop(map, 'parcel-hover-line');
    hoverLayersRaised = true;
}

function hoverPerfNow(): number {
    return hoverPerfEnabled ? performance.now() : 0;
}

function recordHoverPerf(sample: {
    queryMs: number;
    tooltipMs: number;
    highlightMs: number;
    totalMs: number;
}): void {
    if (!hoverPerfEnabled) {
        return;
    }

    hoverPerfStats.count += 1;
    hoverPerfStats.queryMs += sample.queryMs;
    hoverPerfStats.tooltipMs += sample.tooltipMs;
    hoverPerfStats.highlightMs += sample.highlightMs;
    hoverPerfStats.totalMs += sample.totalMs;
    hoverPerfStats.slowestMs = Math.max(hoverPerfStats.slowestMs, sample.totalMs);

    if (hoverPerfStats.count % 120 !== 0) {
        return;
    }

    const count = hoverPerfStats.count;
    const applyCount = Math.max(hoverPerfStats.applyCount, 1);

    console.table({
        'hover avg queryRenderedFeatures': `${(hoverPerfStats.queryMs / count).toFixed(2)} ms`,
        'hover avg tooltip': `${(hoverPerfStats.tooltipMs / count).toFixed(2)} ms`,
        'hover avg schedule': `${(hoverPerfStats.highlightMs / count).toFixed(2)} ms`,
        'hover avg apply setData': `${(hoverPerfStats.applyMs / applyCount).toFixed(2)} ms`,
        'hover avg total': `${(hoverPerfStats.totalMs / count).toFixed(2)} ms`,
        'hover slowest total': `${hoverPerfStats.slowestMs.toFixed(2)} ms`,
        mousemove_samples: count,
        apply_samples: hoverPerfStats.applyCount,
    });
}

function recordHoverApplyPerf(applyMs: number): void {
    if (!hoverPerfEnabled) {
        return;
    }

    hoverPerfStats.applyCount += 1;
    hoverPerfStats.applyMs += applyMs;
}

function featureIdentityKey(feature: RenderedMapFeature): string {
    const properties = feature.properties ?? {};
    const cadastralNumber = stringProperty(properties.cadastral_number)
        ?? stringProperty(properties.cadnum)
        ?? stringProperty(properties.cad_num)
        ?? stringProperty(properties.parcels)
        ?? stringProperty(properties.id);

    return [
        feature.source ?? 'source',
        feature.sourceLayer ?? 'layer',
        feature.id ?? cadastralNumber ?? 'feature',
    ].join(':');
}

function applyExternalFeatureFilter(
    map: maplibregl.Map,
    feature: RenderedMapFeature,
    layerIds: string[],
): boolean {
    if (feature.source !== 'external-kadastr') {
        return false;
    }

    const filter = externalFeatureFilter(feature);

    if (!filter) {
        return false;
    }

    clearExternalFeatureFilter(map, layerIds);

    const targetLayerIds = externalHighlightLayerIdsForFeature(feature, layerIds);

    for (const layerId of targetLayerIds) {
        if (map.getLayer(layerId)) {
            map.setFilter(layerId, filter);
        }
    }

    return true;
}

function externalHighlightLayerIdsForFeature(feature: RenderedMapFeature, layerIds: string[]): string[] {
    if (feature.sourceLayer === 'polygons') {
        return layerIds.filter((layerId) => layerId.includes('-polygons-'));
    }

    if (feature.sourceLayer === 'land_polygons') {
        return layerIds.filter((layerId) => layerId.includes('-land-'));
    }

    return layerIds;
}

function clearExternalFeatureFilter(map: maplibregl.Map, layerIds: string[]): void {
    for (const layerId of layerIds) {
        if (map.getLayer(layerId)) {
            map.setFilter(layerId, emptyExternalFeatureFilter);
        }
    }
}

function externalFeatureFilter(feature: RenderedMapFeature): maplibregl.FilterSpecification | null {
    const properties = feature.properties ?? {};
    const cadastralNumber = stringProperty(properties.cadastral_number)
        ?? stringProperty(properties.cadnum)
        ?? stringProperty(properties.cad_num)
        ?? stringProperty(properties.parcels)
        ?? stringProperty(properties.id);

    if (!cadastralNumber) {
        return feature.id === undefined ? null : ['==', ['id'], feature.id];
    }

    return [
        'any',
        ['==', ['get', 'cadastral_number'], cadastralNumber],
        ['==', ['get', 'cadnum'], cadastralNumber],
        ['==', ['get', 'cad_num'], cadastralNumber],
        ['==', ['get', 'parcels'], cadastralNumber],
        ['==', ['get', 'id'], cadastralNumber],
    ];
}

function toPlainFeature(feature: Feature<Geometry>): Feature<Geometry> {
    return {
        type: 'Feature',
        id: feature.id,
        geometry: jsonClone(feature.geometry),
        properties: jsonClone(feature.properties ?? {}),
    };
}

function jsonClone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
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
