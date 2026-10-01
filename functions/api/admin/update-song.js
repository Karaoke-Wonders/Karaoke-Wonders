import { 
    saveSongToGitHub, 
    saveInboxNotification, 
    sendDiscordStaffAuditNotification, 
    jsonResponse 
} from '../../_middleware/utils.js';

export async function onRequestPost({ request, env }) {
    const body = await request.json();
    const { songId, songName, artist, staffName, submittedBy, threadId } = body;

    if (!songId) {
        return jsonResponse({ error: "Missing required parameter: trackId" }, 400);
    }

    const updatedTrack = {
        id: songId,
        songName,
        artist,
        submittedBy,
        threadId,
        updatedAt: new Date().toISOString()
    };

    // Save updated track details
    await saveSongToGitHub(updatedTrack, env);

    // Send inbox notification using the same pattern as handleApproveTrack
    const notificationUserKey = updatedTrack.threadId || updatedTrack.submittedBy || 'Guest';
    try {
        await saveInboxNotification(
            notificationUserKey,
            'updated',
            updatedTrack.songName,
            updatedTrack.artist,
            `Your track "${updatedTrack.songName}" has been updated by ${staffName || 'a staff member'}.`,
            env
        );
        console.log(`[handleUpdateTrack] Update inbox notification saved for user ${notificationUserKey}`);
    } catch (err) {
        console.error('[handleUpdateTrack] Failed to save inbox notification:', err);
    }

    // Optional Discord audit log
    await sendDiscordStaffAuditNotification(
        "Updated Track",
        staffName || "Unknown Staff",
        `Track: "${updatedTrack.songName}" by ${updatedTrack.artist} (ID: ${songId})`,
        env
    );

    return jsonResponse({ success: true, message: "Track updated and notification sent!" });
}