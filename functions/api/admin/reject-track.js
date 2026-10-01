import { 
    fetchPendingSongsFromGitHub, 
    removePendingSongFromGitHub, 
    saveInboxNotification, 
    sendDiscordStaffAuditNotification, 
    authorizeAdminRequest,
    jsonResponse 
} from '../../_middleware/utils.js';

export async function onRequestPost({ request, env }) {
    const authorization = await authorizeAdminRequest(request, env);
    if (authorization instanceof Response) return authorization;

    const body = await request.json();
    const { trackId, songName, artist } = body;
    console.log(`[handleRejectTrack] Rejecting and removing trackId: ${trackId}`);

    if (typeof trackId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(trackId)) {
        return jsonResponse({ error: 'Invalid track ID.' }, 400);
    }

    const pending = await fetchPendingSongsFromGitHub(env);
    const track = pending.find(t => t.id === trackId);

    const removed = await removePendingSongFromGitHub(trackId, env);
    if (!removed) return jsonResponse({ error: 'Track request not found.' }, 404);

    const targetSongName = track?.songName || songName || null;
    const targetArtist = track?.artist || artist || null;

    if (targetSongName) {
        const notificationUserKey = track?.threadId || track?.submittedBy || 'Guest';
        try {
            await saveInboxNotification(
                notificationUserKey,
                'rejected',
                targetSongName,
                targetArtist || 'Unknown Artist',
                `Your track request for "${targetSongName}" was reviewed and declined by moderation.`,
                env
            );
        } catch (err) {
            console.error('[handleRejectTrack] Failed to save inbox notification:', err);
        }
    }

    let targetDetails = `Track ID: ${trackId}`;
    if (targetSongName && targetArtist) {
        targetDetails = `Track: "${targetSongName}" by ${targetArtist} (ID: ${trackId})`;
    } else if (targetSongName) {
        targetDetails = `Track: "${targetSongName}" (ID: ${trackId})`;
    }

    await sendDiscordStaffAuditNotification(
        "Rejected/Removed Track",
        authorization.username,
        targetDetails,
        env
    );

    return jsonResponse({ success: true, message: "Track request rejected." });
}