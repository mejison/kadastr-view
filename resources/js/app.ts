import 'maplibre-gl/dist/maplibre-gl.css';
import '../css/app.css';

import { createApp } from 'vue';

// The map application is deliberately split from the HTML SEO shell. Visitors
// without JavaScript still receive useful content; JS users load the map next.
void import('./App.vue').then(({ default: App }) => {
    createApp(App).mount('#app');
    document.documentElement.classList.add('app-mounted');
});
