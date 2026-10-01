import { authorizeAdminRequest, fetchPendingSongsFromGitHub, jsonResponse } from '../../_middleware/utils.js';

export async function onRequestGet({ request, env }) {
    const authorization = await authorizeAdminRequest(request, env);
    if (authorization instanceof Response) return authorization;

    console.log("[handleGetPending] Fetching pending tracks from GitHub...");
    const pending = await fetchPendingSongsFromGitHub(env);
    console.log(`[handleGetPending] Found ${pending.length} pending tracks.`);
    return jsonResponse(pending);
}