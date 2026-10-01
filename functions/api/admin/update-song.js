import { 
    saveInboxNotification, 
    sendDiscordStaffAuditNotification, 
    jsonResponse 
} from '../../_middleware/utils.js';

// Local hashCode fallback to guarantee it never fails to import or resolve
function hashCode(str) {
    const s = String(str);
    let hash = 0;
    for (let i = 0; i < s.length; i++) {
        hash = (hash << 5) - hash + s.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}

// UTF-8 safe Base64 helpers
function decodeBase64Utf8(base64Str) {
    const cleanStr = base64Str.replace(/\s/g, '');
    const binary = atob(cleanStr);
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
}

function encodeBase64Utf8(str) {
    const bytes = new TextEncoder().encode(str);
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

export async function onRequestPost({ request, env }) {
    let body;
    try {
        body = await request.json();
    } catch (e) {
        return jsonResponse({ error: "Invalid JSON payload." }, 400);
    }

    const { songId, songName, artist, videoId, staffName } = body;
    console.log(`[handleUpdateSong] Updating song: ${songId}`);

    if (songId === undefined || songId === null || !songName || !artist || !videoId) {
        return jsonResponse({ error: "Missing required fields: songId, songName, artist, videoId." }, 400);
    }

    const owner = env.GITHUB_OWNER;
    const repo = env.GITHUB_REPO;
    const branch = env.GITHUB_BRANCH || 'main';
    const folderIndex = Math.floor(Math.abs(hashCode(songId)) % 1000);
    const filePath = `songs/batch_${folderIndex}/${songId}.json`;
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;

    let maxRetries = 3;
    let response;
    let fileData, existingContent;

    // Retry loop to handle GitHub 409 SHA conflicts seamlessly
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const existingFileRes = await fetch(url, {
            headers: { 
                'Authorization': `Bearer ${env.GITHUB_TOKEN}`, 
                'User-Agent': 'Cloudflare-Worker' 
            },
            cf: { cacheTtl: 0 }
        });

        if (!existingFileRes.ok) {
            console.error(`[handleUpdateSong] Song file not found: ${filePath}`);
            return jsonResponse({ error: "Song not found in repository." }, 404);
        }

        fileData = await existingFileRes.json();
        
        try {
            existingContent = JSON.parse(decodeBase64Utf8(fileData.content));
        } catch (e) {
            console.error(`[handleUpdateSong] Failed to parse existing JSON:`, e);
            return jsonResponse({ error: "Corrupted song file in repository." }, 500);
        }

        const updatedSong = {
            ...existingContent,
            songName,
            artist,
            videoId,
            updatedAt: new Date().toISOString()
        };

        const encodedContent = encodeBase64Utf8(JSON.stringify(updatedSong, null, 2));

        response = await fetch(url, {
            method: 'PUT',
            headers: { 
                'Authorization': `Bearer ${env.GITHUB_TOKEN}`, 
                'Content-Type': 'application/json', 
                'User-Agent': 'Cloudflare-Worker' 
            },
            body: JSON.stringify({
                message: `Update song: ${songName} (${songId})`,
                content: encodedContent,
                sha: fileData.sha,
                branch
            })
        });

        if (response.ok) {
            break;
        }

        const errText = await response.text();

        if (response.status === 409 && attempt < maxRetries) {
            console.warn(`[handleUpdateSong] Conflict (409) on attempt ${attempt}. Retrying with fresh SHA...`);
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            continue;
        }

        console.error(`[handleUpdateSong] Failed to update song (${response.status}):`, errText);
        return jsonResponse({ error: `Failed to update song: ${errText}` }, 500);
    }

    if (!response || !response.ok) {
        return jsonResponse({ error: "Failed to update song after multiple conflict retries." }, 500);
    }

    // Dispatch Inbox Notification to the user
    const notificationUserKey = existingContent.threadId || existingContent.submittedBy || 'Guest';
    try {
        await saveInboxNotification(
            notificationUserKey,
            'updated',
            songName,
            artist,
            `Your track "${songName}" has been updated by ${staffName || 'a staff member'}.`,
            env
        );
        console.log(`[handleUpdateSong] Inbox notification sent to user ${notificationUserKey}`);
    } catch (inboxErr) {
        console.error(`[handleUpdateSong] Failed to send inbox notification:`, inboxErr);
    }

    // Dispatch Discord Audit Notification
    try {
        await sendDiscordStaffAuditNotification(
            "Updated Song Details",
            staffName || "Staff Member",
            `Song: "${songName}" by ${artist} (ID:${songId})`,
            env
        );
    } catch (discordErr) {
        console.error(`[handleUpdateSong] Discord notification failed:`, discordErr);
    }

    console.log(`[handleUpdateSong] Song ${songId} successfully updated.`);
    return jsonResponse({ success: true, message: "Song updated successfully." });
}