import { savePendingSongToGitHub, saveInboxNotification, jsonResponse } from '../_middleware/utils.js';

export async function onRequestPost({ request, env }) {
    let body;
    try {
        body = await request.json();
    } catch (e) {
        return jsonResponse({ error: "Invalid JSON payload." }, 400);
    }

    console.log("[handleSubmitTrack] Payload received:", body);
    const { songName, artist, videoId, timestamp, submittedBy, threadId } = body;

    if (!songName || !artist || !videoId) {
        console.warn("[handleSubmitTrack] Validation failed: Missing required track details.");
        return jsonResponse({ error: "Missing required track details." }, 400);
    }

    const notificationUserKey = threadId || submittedBy || 'Guest';

    // Check Discord Forum Thread applied tags directly from the channel endpoint
    if (threadId) {
        console.log(`[handleSubmitTrack] Checking thread applied tags for threadId: ${threadId}`);
        try {
            const threadRes = await fetch(`https://discord.com/api/v10/channels/${threadId}`, {
                headers: { 'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}` }
            });

            if (threadRes.ok) {
                const threadData = await threadRes.json();
                const appliedTags = threadData.applied_tags || [];
                console.log(`[handleSubmitTrack] Thread applied tags found:`, appliedTags);

                const isRestricted = env.DISCORD_TAG_RESTRICTED && appliedTags.includes(env.DISCORD_TAG_RESTRICTED);
                const isBlacklisted = env.DISCORD_TAG_BLACKLISTED && appliedTags.includes(env.DISCORD_TAG_BLACKLISTED);

                if (isRestricted || isBlacklisted) {
                    console.warn(`[handleSubmitTrack] BLOCKED: Thread ${threadId} has restricted/blacklisted applied tags.`);
                    
                    // Send notification to their inbox explaining why it was blocked
                    try {
                        await saveInboxNotification(
                            notificationUserKey,
                            'rejected',
                            songName,
                            artist,
                            `Your track request for "${songName}" was automatically rejected because your forum thread is restricted or blacklisted.`,
                            env
                        );
                    } catch (notifErr) {
                        console.error('[handleSubmitTrack] Failed to save inbox notification:', notifErr);
                    }

                    return jsonResponse({ error: "Your account is restricted or blacklisted from submitting tracks." }, 403);
                }
            } else {
                console.warn(`[handleSubmitTrack] Could not fetch thread channel data: ${threadRes.status}`);
            }
        } catch (err) {
            console.error("[handleSubmitTrack] Exception checking thread tags:", err.message);
        }
    }

    // Proceed with saving pending song if not restricted
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