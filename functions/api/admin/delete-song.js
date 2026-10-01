import { authorizeAdminRequest, removeSongFromGitHub, sendDiscordStaffAuditNotification, invalidateSongCatalogVersionCache, jsonResponse } from '../../_middleware/utils.js';

export async function onRequestPost({ request, env }) {
    const authorization = await authorizeAdminRequest(request, env);
    if (authorization instanceof Response) return authorization;

    const body = await request.json();
    const { songId, songName } = body;
    console.log(`[handleDeleteSong] Deleting songId: ${songId} from live catalog`);

    if (typeof songId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(songId)) {
        return jsonResponse({ error: "Invalid song ID." }, 400);
    }

    try {
        await removeSongFromGitHub(songId, env);
        await invalidateSongCatalogVersionCache(request.url);

        const targetDetails = songName 
            ? `Track: "${songName}" (ID: ${songId})` 
            : `Deleted Song ID: ${songId} from active catalog`;

        await sendDiscordStaffAuditNotification(
            "Deleted Live Song",
            authorization.username,
            targetDetails,
            env
        );

        return jsonResponse({ success: true, message: "Song removed from live catalog." });
    } catch (err) {
        console.error(`[handleDeleteSong] Error:`, err.message);
        return jsonResponse({ error: err.message || "Failed to delete song." }, 500);
    }
}