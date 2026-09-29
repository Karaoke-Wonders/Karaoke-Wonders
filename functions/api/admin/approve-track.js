import { 
    fetchPendingSongsFromGitHub, 
    removePendingSongFromGitHub, 
    saveSongToGitHub, 
    saveInboxNotification, 
    sendDiscordApprovedNotification, 
    sendDiscordStaffAuditNotification, 
    jsonResponse 
} from '../../_middleware/utils.js';

export async function onRequestPost({ request, env }) {
    const body = await request.json();
    const { trackId, songName, artist, staffName } = body;
    console.log(`[handleApproveTrack] Processing approval for trackId: ${trackId}`);

    if (!trackId) {
        return jsonResponse({ error: "Missing required parameter: trackId" }, 400);
    }

    const pending = await fetchPendingSongsFromGitHub(env);
    let track = pending.find(t => t.id === trackId);

    if (!track) {
        if (songName && artist) {
            console.warn(`[handleApproveTrack] Track ${trackId} not found in pending directory, using payload fallback.`);
            track = {
                id: trackId,
                songName,
                artist,
                submittedBy: 'Guest',
                createdAt: new Date().toISOString()
            };
        } else {
            console.warn(`[handleApproveTrack] Track not found in pending folder: ${trackId}`);
            return jsonResponse({ error: "Track request not found." }, 404);
        }
    }

    console.log(`[handleApproveTrack] Removing track ${trackId} from pending directory...`);
    await removePendingSongFromGitHub(trackId, env);

    const approvedTrack = { ...track, approvedAt: new Date().toISOString() };
    console.log(`[handleApproveTrack] Saving track ${trackId} to production songs repository...`);
    await saveSongToGitHub(approvedTrack, env);

    const notificationUserKey = approvedTrack.threadId || approvedTrack.submittedBy || 'Guest';
    try {
        await saveInboxNotification(
            notificationUserKey,
            'approved',
            approvedTrack.songName,
            approvedTrack.artist,
            `Great news! Your track request for "${approvedTrack.songName}" was approved and added to the library.`,
            env
        );
        console.log(`[handleApproveTrack] Approval inbox notification saved for user ${notificationUserKey}`);
    } catch (err) {
        console.error('[handleApproveTrack] Failed to save inbox notification:', err);
    }

    await sendDiscordApprovedNotification(approvedTrack, env);
    await sendDiscordStaffAuditNotification(
        "Approved Track",
        staffName || "Unknown Staff",
        `Track: "${approvedTrack.songName}" by ${approvedTrack.artist} (ID: ${trackId})`,
        env
    );

    console.log(`[handleApproveTrack] Track ${trackId} successfully approved and published.`);
    return jsonResponse({ success: true, message: "Approved, published, and synced to GitHub!" });
}