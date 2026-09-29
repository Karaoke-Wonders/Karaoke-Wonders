import { removeSongFromGitHub, sendDiscordStaffAuditNotification, jsonResponse } from '../../_middleware/utils.js';

export async function onRequestPost({ request, env }) {
    const body = await request.json();
    const { songId, songName, staffName } = body;
    console.log(`[handleDeleteSong] Deleting songId: ${songId} from live catalog`);

    if (!songId) {
        return jsonResponse({ error: "Missing required parameter: songId" }, 400);
    }

    try {
        await removeSongFromGitHub(songId, env);

        const targetDetails = songName 
            ? `Track: "${songName}" (ID: ${songId})` 
            : `Deleted Song ID: ${songId} from active catalog`;

        await sendDiscordStaffAuditNotification(
            "Deleted Live Song",
            staffName || "Unknown Staff",
            targetDetails,
            env
        );

        return jsonResponse({ success: true, message: "Song removed from live catalog." });
    } catch (err) {
        console.error(`[handleDeleteSong] Error:`, err.message);
        return jsonResponse({ error: err.message || "Failed to delete song." }, 500);
    }
}