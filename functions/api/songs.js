import { fetchSongPageFromGitHub, jsonResponse } from '../_middleware/utils.js';

export async function onRequestGet({ request, env }) {
    console.log("[handleGetSongs] Fetching songs list...");
    const url = new URL(request.url);
    const requestedPage = Number.parseInt(url.searchParams.get('page'), 10);
    const requestedLimit = Number.parseInt(url.searchParams.get('limit'), 10);
    const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
        ? Math.min(requestedLimit, 500)
        : 12;

    const startIndex = (page - 1) * limit;
    const { songs, total, version } = await fetchSongPageFromGitHub(env, startIndex, limit);
    console.log(`[handleGetSongs] Found ${total} total songs.`);

    const response = jsonResponse({
        songs,
        total,
        version,
        page: page,
        limit: limit,
        totalPages: Math.ceil(total / limit)
    });
    response.headers.set('Cache-Control', 'no-store');
    return response;
}