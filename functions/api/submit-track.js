import { getDiscordThreadData, savePendingSongToGitHub, saveInboxNotification, jsonResponse } from '../_utils.js';

export async function onRequestPost({ request, env }) {
    const body = await request.json();
    console.log("[handleSubmitTrack] Payload received:", body);
    const { songName, artist, videoId, timestamp, submittedBy, threadId } = body;

    if (!songName || !artist || !videoId) {
        console.warn("[handleSubmitTrack] Validation failed: Missing required track details.");
        return jsonResponse({ error: "Missing required track details." }, 400);
    }

    if (threadId) {
        console.log(`[handleSubmitTrack] Checking thread metadata for threadId: ${threadId}`);
        const threadData = await getDiscordThreadData(threadId, env);
        if (threadData) {
            if (threadData.tags && (threadData.tags.includes(env.DISCORD_TAG_BLACKLISTED) || threadData.tags.includes(env.DISCORD_TAG_RESTRICTED))) {
                console.warn(`[handleSubmitTrack] User account restricted/blacklisted. ThreadId: ${threadId}`);
                return jsonResponse({ error: "Your account is restricted or blacklisted from submitting tracks." }, 403);
            }
        }
    }

    const newSubmission = {
        id: 'tr_' + Date.now() + Math.random().toString(36).substring(2, 7),
        songName,
        artist,
        videoId,
        timestamp: Number(timestamp) || 0,
        submittedBy: submittedBy || 'Guest',
        threadId: threadId || '',
        createdAt: new Date().toISOString()
    };

    console.log(`[handleSubmitTrack] Saving pending track submission: ${newSubmission.id}`);
    await savePendingSongToGitHub(newSubmission, env);

    const notificationUserKey = threadId || submittedBy || 'Guest';
    try {
        await saveInboxNotification(
            notificationUserKey,
            'pending',
            songName,
            artist,
            `Your track request for "${songName}" was submitted and is pending review.`,
            env
        );
        console.log(`[handleSubmitTrack] Inbox notification saved for user ${notificationUserKey}`);
    } catch (err) {
        console.error('[handleSubmitTrack] Failed to save inbox notification:', err);
    }

    return jsonResponse({ success: true, message: "Submitted for admin review." });
}