import { fetchSongCatalogVersionFromGitHub, jsonResponse } from '../../_middleware/utils.js';

export async function onRequestGet({ request, env }) {
    const cache = globalThis.caches?.default;
    const cacheKey = new Request(new URL('/api/songs/version', request.url).toString());

    try {
        if (cache) {
            const cachedResponse = await cache.match(cacheKey);
            if (cachedResponse) return cachedResponse;
        }

        const version = await fetchSongCatalogVersionFromGitHub(env);
        const response = jsonResponse({ version });
        response.headers.set('Cache-Control', 'public, max-age=5');
        if (cache) await cache.put(cacheKey, response.clone());
        return response;
    } catch (error) {
        console.error('[getSongCatalogVersion] Failed:', error.message);
        return jsonResponse({ error: 'Could not check the song catalog version.' }, 502);
    }
}
