import { fetchAllSongsFromGitHub, jsonResponse } from '../_middleware/utils.js';

export async function onRequestGet({ request, env }) {
    console.log("[handleGetSongs] Fetching songs list...");
    const allSongs = await fetchAllSongsFromGitHub(env);
    console.log(`[handleGetSongs] Found ${allSongs.length} total songs.`);

    // Parse query parameters for pagination (default to page 1, 10 items per page)
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page')) || 1;
    const limit = parseInt(url.searchParams.get('limit')) || 12;

    // Calculate slice indices
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedSongs = allSongs.slice(startIndex, endIndex);

    // Return the paginated subset along with total count metadata
    return jsonResponse({
        songs: paginatedSongs,
        total: allSongs.length,
        page: page,
        limit: limit,
        totalPages: Math.ceil(allSongs.length / limit)
    });
}