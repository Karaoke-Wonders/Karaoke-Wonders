import { getDiscordThreadData, savePendingSongToGitHub, saveInboxNotification, jsonResponse, sanitizeUser } from '../_middleware/utils.js';

export async function onRequestPost({ request, env }) {
    let body;
    try {
        body = await request.json();
    } catch (e) {
        return jsonResponse({ error: "Invalid JSON payload." }, 400);
    }

    console.log("[handleSubmitTrack] Payload received:", body);
    const { songName, artist, videoId, timestamp, submittedBy, threadId, userId } = body;

    if (!songName || !artist || !videoId) {
        console.warn("[handleSubmitTrack] Validation failed: Missing required track details.");
        return jsonResponse({ error: "Missing required track details." }, 400);
    }

    const notificationUserKey = threadId || userId || submittedBy || 'Guest';

    // 1. Check Discord Thread tags if threadId exists
    if (threadId) {
        console.log(`[handleSubmitTrack] Checking thread metadata for threadId: ${threadId}`);
        const threadData = await getDiscordThreadData(threadId, env);
        if (threadData) {
            if (threadData.tags && (threadData.tags.includes(env.DISCORD_TAG_BLACKLISTED) || threadData.tags.includes(env.DISCORD_TAG_RESTRICTED))) {
                console.warn(`[handleSubmitTrack] User account restricted/blacklisted via thread. ThreadId: ${threadId}`);
                
                // Notify user in their inbox why it was blocked
                try {
                    await saveInboxNotification(
                        notificationUserKey,
                        'rejected',
                        songName,
                        artist,
                        `Your track request for "${songName}" was automatically rejected because your account is restricted or blacklisted.`,
                        env
                    );
                } catch (notifErr) {
                    console.error('[handleSubmitTrack] Failed to save restriction inbox notification:', notifErr);
                }

                return jsonResponse({ error: "Your account is restricted or blacklisted from submitting tracks." }, 403);
            }
        }
    }

    // 2. Check User database file on GitHub for restriction status
    const targetUserKey = userId || submittedBy;
    if (targetUserKey && targetUserKey !== 'Guest') {
        try {
            const owner = env.GITHUB_OWNER;
            const repo = env.GITHUB_REPO;
            const safeUser = sanitizeUser(targetUserKey);
            const userFilePath = `users/${safeUser}.json`;
            const userUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${userFilePath}`;

            const userRes = await fetch(userUrl, {
                headers: { 
                    'Authorization': `Bearer ${env.GITHUB_TOKEN}`, 
                    'User-Agent': 'Cloudflare-Worker' 
                },
                cache: 'no-store',
                cf: { cacheTtl: 0 }
            });

            if (userRes.ok) {
                const userData = await userRes.json();
                let userContent;
                try {
                    userContent = JSON.parse(atob(userData.content.replace(/\s/g, '')));
                } catch (parseErr) {
                    userContent = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(userData.content.replace(/\s/g, '')), c => c.charCodeAt(0))));
                }

                if (userContent.isRestricted || userContent.restricted === true || (userContent.tags && (userContent.tags.includes('restricted') || userContent.tags.includes('blacklisted')))) {
                    console.warn(`[handleSubmitTrack] User account is restricted in user storage. User: ${targetUserKey}`);
                    
                    // Notify user in their inbox why it was blocked
                    try {
                        await saveInboxNotification(
                            notificationUserKey,
                            'rejected',
                            songName,
                            artist,
                            `Your track request for "${songName}" was automatically rejected because your account status is restricted.`,
                            env
                        );
                    } catch (notifErr) {
                        console.error('[handleSubmitTrack] Failed to save user restriction inbox notification:', notifErr);
                    }

                    return jsonResponse({ error: "Your account is restricted from submitting tracks." }, 403);
                }
            }
        } catch (userCheckErr) {
            console.warn("[handleSubmitTrack] Could not verify user profile file, proceeding:", userCheckErr.message);
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