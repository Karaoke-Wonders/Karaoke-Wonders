import { hashCode, sendDiscordStaffAuditNotification, jsonResponse } from '../_utils.js';

export async function onRequestPost({ request, env }) {
    const body = await request.json();
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
    const url = `[https://api.github.com/repos/$](https://api.github.com/repos/$){owner}/${repo}/contents/${filePath}`;

    const existingFileRes = await fetch(url, {
        headers: { 'Authorization': `Bearer ${env.GITHUB_TOKEN}`, 'User-Agent': 'Cloudflare-Worker' }
    });

    if (!existingFileRes.ok) {
        console.error(`[handleUpdateSong] Song file not found: ${filePath}`);
        return jsonResponse({ error: "Song not found in repository." }, 404);
    }

    const fileData = await existingFileRes.json();
    const existingContent = JSON.parse(atob(fileData.content.replace(/\n/g, '')));

    const updatedSong = {
        ...existingContent,
        songName,
        artist,
        videoId,
        updatedAt: new Date().toISOString()
    };

    const encodedContent = btoa(unescape(encodeURIComponent(JSON.stringify(updatedSong, null, 2))));

    const response = await fetch(url, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${env.GITHUB_TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': 'Cloudflare-Worker' },
        body: JSON.stringify({
            message: `Update song: ${songName} (${songId})`,
            content: encodedContent,
            sha: fileData.sha,
            branch
        })
    });

    if (!response.ok) {
        const errText = await response.text();
        console.error(`[handleUpdateSong] Failed to update song (${response.status}):`, errText);
        return jsonResponse({ error: `Failed to update song: ${errText}` }, 500);
    }

    await sendDiscordStaffAuditNotification(
        "Updated Song Details",
        staffName || "Staff Member",
        `Song: "${songName}" by ${artist} (ID:${songId})`,
        env
    );

    console.log(`[handleUpdateSong] Song ${songId} successfully updated.`);
    return jsonResponse({ success: true, message: "Song updated successfully." });
}