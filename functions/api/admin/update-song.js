import { hashCode, sendDiscordStaffAuditNotification, jsonResponse } from '../../_middleware/utils.js';

export async function onRequestPost({ request, env }) {
    let body;
    try {
        body = await request.json();
    } catch (e) {
        return jsonResponse({ error: "Invalid JSON payload." }, 400);
    }

    const { songId, songName, artist, videoId, staffName } = body;
    console.log(`[handleUpdateSong] Updating song: ${songId}`);

    if (!songId || !songName || !artist || !videoId) {
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
        // Fetch fresh file data and SHA every attempt, bypassing cache
        const existingFileRes = await fetch(url, {
            headers: { 
                'Authorization': `Bearer ${env.GITHUB_TOKEN}`, 
                'User-Agent': 'Cloudflare-Worker' 
            },
            cache: 'no-store',
            cf: { cacheTtl: 0 }
        });

        if (!existingFileRes.ok) {
            console.error(`[handleUpdateSong] Song file not found: ${filePath}`);
            return jsonResponse({ error: "Song not found in repository." }, 404);
        }

        fileData = await existingFileRes.json();
        
        // Robust base64 decode handling all whitespace/newlines
        try {
            existingContent = JSON.parse(atob(fileData.content.replace(/\s/g, '')));
        } catch (e) {
            existingContent = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(fileData.content.replace(/\s/g, '')), c => c.charCodeAt(0))));
        }

        const updatedSong = {
            ...existingContent,
            songName,
            artist,
            videoId,
            updatedAt: new Date().toISOString()
        };

        const encodedContent = btoa(unescape(encodeURIComponent(JSON.stringify(updatedSong, null, 2))));

        // Attempt the PUT request to GitHub
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
            break; // Success! Exit the loop.
        }

        const errText = await response.text();

        // If it's a conflict (409) and we still have attempts left, wait and retry
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

    // Safely attempt Discord notification without failing the main request if it errors
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