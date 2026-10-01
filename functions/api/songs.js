import { fetchSongCatalogFromGitHub, jsonResponse } from '../_middleware/utils.js';

let catalogLoadPromise = null;

function getCatalogCacheKey(requestUrl) {
    return new Request(new URL('/api/songs/catalog-cache', requestUrl).toString());
}

async function getSongCatalog(requestUrl, env) {
    const cache = globalThis.caches?.default;
    const cacheKey = getCatalogCacheKey(requestUrl);
    if (cache) {
        const cachedResponse = await cache.match(cacheKey);
        if (cachedResponse) return cachedResponse.json();
    }

    const pendingLoad = catalogLoadPromise || (catalogLoadPromise = fetchSongCatalogFromGitHub(env));
    let catalog;
    try {
        catalog = await pendingLoad;
    } finally {
        if (catalogLoadPromise === pendingLoad) catalogLoadPromise = null;
    }

    if (cache) {
        const cacheResponse = new Response(JSON.stringify(catalog), {
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=30'
            }
        });
        try {
            await cache.put(cacheKey, cacheResponse.clone());
        } catch (error) {
            console.warn('[getSongCatalog] Could not cache catalog:', error.message);
        }
    }
    return catalog;
}

export async function onRequestGet({ request, env }) {
    const url = new URL(request.url);
    const requestedPage = Number.parseInt(url.searchParams.get('page'), 10);
    const requestedLimit = Number.parseInt(url.searchParams.get('limit'), 10);
    const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
        ? Math.min(requestedLimit, 500)
        : 12;
    const search = (url.searchParams.get('search') || '').trim().toLowerCase();
    const submittedBy = (url.searchParams.get('submittedBy') || '').trim().toLowerCase();
    const sort = url.searchParams.get('sort') || 'title';
    if (search.length > 100 || submittedBy.length > 100 || !['title', 'artist', 'uploader'].includes(sort)) {
        return jsonResponse({ error: 'Invalid catalog query.' }, 400);
    }

    let catalog;
    try {
        catalog = await getSongCatalog(request.url, env);
    } catch (error) {
        console.error('[handleGetSongs] Failed to load catalog:', error.message);
        return jsonResponse({ error: 'Could not load the song catalog.' }, 502);
    }

    const filteredSongs = catalog.songs.filter(song => {
        const uploader = String(song.submittedBy || song.uploader || '').toLowerCase();
        const text = [song.songName, song.title, song.artist, song.id, song._id, song.submittedBy, song.uploader]
            .map(value => String(value ?? ''))
            .join(' ')
            .toLowerCase();
        return (!search || text.includes(search)) && (!submittedBy || uploader === submittedBy);
    });

    filteredSongs.sort((left, right) => {
        const leftValue = sort === 'artist' ? left.artist :
            sort === 'uploader' ? left.submittedBy || left.uploader : left.songName || left.title;
        const rightValue = sort === 'artist' ? right.artist :
            sort === 'uploader' ? right.submittedBy || right.uploader : right.songName || right.title;
        return String(leftValue || '').localeCompare(String(rightValue || ''));
    });

    const total = filteredSongs.length;
    const totalPages = Math.ceil(total / limit);
    const currentPage = totalPages ? Math.min(page, totalPages) : 1;
    const startIndex = (currentPage - 1) * limit;

    const response = jsonResponse({
        songs: filteredSongs.slice(startIndex, startIndex + limit),
        total,
        version: catalog.version,
        page: currentPage,
        limit: limit,
        totalPages
    });
    response.headers.set('Cache-Control', 'no-store');
    return response;
}