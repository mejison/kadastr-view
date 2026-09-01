import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { handler as apiHandler } from './netlify/functions/api.mjs';

function localApiPlugin() {
    return {
        name: 'local-netlify-api',
        configureServer(server) {
            server.middlewares.use('/api/v1', async (request, response, next) => {
                try {
                    const body = await readRequestBody(request);
                    const result = await apiHandler({
                        httpMethod: request.method ?? 'GET',
                        path: `/api/v1${request.url ?? ''}`.split('?')[0],
                        rawUrl: new URL(`/api/v1${request.url ?? ''}`, 'http://localhost:5173').toString(),
                        headers: request.headers,
                        body: body || null,
                        isBase64Encoded: false,
                    });

                    response.writeHead(result.statusCode ?? 200, result.headers ?? {});
                    response.end(result.isBase64Encoded
                        ? Buffer.from(result.body ?? '', 'base64')
                        : result.body ?? '');
                } catch (error) {
                    next(error);
                }
            });
        },
    };
}

function readRequestBody(request) {
    if (['GET', 'HEAD'].includes(request.method ?? 'GET')) {
        return Promise.resolve('');
    }

    return new Promise((resolve, reject) => {
        const chunks = [];
        request.on('data', (chunk) => chunks.push(chunk));
        request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        request.on('error', reject);
    });
}

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
        localApiPlugin(),
        tailwindcss(),
        vue(),
    ],
});
