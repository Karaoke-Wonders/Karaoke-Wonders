import { fetchPendingSongsFromGitHub, jsonResponse } from '../_middleware/utils.js';

export async function onRequestGet({ env }) {
    console.log("[handleGetPending] Fetching pending tracks from GitHub...");
    const pending = await fetchPendingSongsFromGitHub(env);
    console.log(`[handleGetPending] Found ${pending.length} pending tracks.`);
    return jsonResponse(pending);
}