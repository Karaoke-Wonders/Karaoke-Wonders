import { fetchAllSongsFromGitHub, jsonResponse } from '../_utils.js';

export async function onRequestGet({ env }) {
    console.log("[handleGetSongs] Fetching songs list...");
    const allSongs = await fetchAllSongsFromGitHub(env);
    console.log(`[handleGetSongs] Found ${allSongs.length} total songs.`);
    return jsonResponse(allSongs);
}