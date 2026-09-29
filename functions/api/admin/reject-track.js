import { 
    fetchPendingSongsFromGitHub, 
    removePendingSongFromGitHub, 
    saveInboxNotification, 
    sendDiscordStaffAuditNotification, 
    jsonResponse 
} from '../_middleware/utils.js';

export async function onRequestPost({ request, env }) {
    const body = await request.json();
    const { trackId, songName, artist, staffName } = body;
    console.log(`[handleRejectTrack] Rejecting and removing trackId: ${trackId}`);

    const pending = await fetchPendingSongsFromGitHub(env);
    const track = pending.find(t => t.id === trackId);

    await removePendingSongFromGitHub(trackId, env);

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
        staffName || "Unknown Staff",
        targetDetails,
        env
    );

    return jsonResponse({ success: true, message: "Track request rejected." });
}