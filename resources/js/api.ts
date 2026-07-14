const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');

export function apiUrl(path: string): string {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;

    return `${apiBaseUrl}${normalizedPath}`;
}

export function absoluteApiUrl(path: string): string {
    const url = apiUrl(path);

    if (/^https?:\/\//.test(url)) {
        return url;
    }

    return `${window.location.origin}${url}`;
}
