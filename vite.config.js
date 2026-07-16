import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
    build: {
        manifest: true,
        rollupOptions: {
            output: {
                entryFileNames: 'assets/app.js',
                chunkFileNames: 'assets/[name]-[hash].js',
                assetFileNames: (assetInfo) => (
                    assetInfo.name?.endsWith('.css')
                        ? 'assets/app.css'
                        : 'assets/[name]-[hash][extname]'
                ),
            },
        },
    },
    plugins: [
        tailwindcss(),
        vue(),
    ],
});
