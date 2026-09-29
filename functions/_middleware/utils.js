export function hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}

export function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        }
    });
}

export function sanitizeUser(userId) {
    return String(userId).replace(/[^a-zA-Z0-9_\-]/g, '_');
}

export async function saveInboxNotification(userId, type, songName, artist, message, env) {
    const owner = env.GITHUB_OWNER;
    const repo = env.GITHUB_REPO;
    const branch = env.GITHUB_BRANCH || 'main';

    const safeUser = sanitizeUser(userId);
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 7);
    const fileName = `notif_${timestamp}_${randomId}.json`;
    const filePath = `inbox/${safeUser}/${fileName}`;

    const notificationPayload = {
        id: `notif_${timestamp}`,
        type: type.toLowerCase(),
        songName,
        artist: artist || 'Unknown Artist',
        message: message || '',
        timestamp: new Date().toISOString()
    };

    const jsonString = JSON.stringify(notificationPayload, null, 2);
    const encodedContent = btoa(unescape(encodeURIComponent(jsonString)));
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;

    const response = await fetch(url, {
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
            'Content-Type': 'application/json',
            'User-Agent': 'Cloudflare-Worker'
        },
        body: JSON.stringify({
            message: `[Inbox Bot] Add ${type} notification for ${safeUser}`,
            content: encodedContent,
            branch: branch
        })
    });

    if (!response.ok) {
        const errText = await response.text();
        console.error(`[saveInboxNotification] Failed to save notification to GitHub (${response.status}):`, errText);
    } else {
        console.log(`[saveInboxNotification] Notification saved for user ${safeUser}: ${fileName}`);
    }
}

export async function sendDiscordApprovedNotification(track, env) {
    const channelId = env.DISCORD_APPROVED_CHANNEL_ID;
    if (!channelId) {
        console.warn("[sendDiscordApprovedNotification] DISCORD_APPROVED_CHANNEL_ID not configured.");
        return;
    }
    const payload = {
        embeds: [{
            title: "New Song Approved!",
            color: 5814783,
            fields: [
                { name: "Track Title", value: track.songName || "Unknown", inline: true },
                { name: "Artist", value: track.artist || "Unknown", inline: true },
                { name: "Submitted By", value: track.submittedBy || "Guest", inline: true },
                { name: "YouTube Link", value: track.videoId ? `https://www.youtube.com/watch?v=${track.videoId}` : "N/A", inline: false }
            ],
            timestamp: track.approvedAt || new Date().toISOString()
        }]
    };
    try {
        const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
            method: 'POST',
            headers: { 'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            console.error(`[sendDiscordApprovedNotification] Failed (${res.status}):`, await res.text());
        } else {
            console.log(`[sendDiscordApprovedNotification] Notified Discord for track: ${track.id}`);
        }
    } catch (err) {
        console.error("[sendDiscordApprovedNotification] Exception:", err.message);
    }
}

export async function sendDiscordStaffAuditNotification(actionType, staffName, targetDetails, env) {
    const channelId = env.DISCORD_STAFF_AUDIT_CHANNEL_ID || env.DISCORD_APPROVED_CHANNEL_ID;
    if (!channelId) {
        console.warn("[sendDiscordStaffAuditNotification] No audit channel configured.");
        return;
    }
    const payload = {
        embeds: [{
            title: "Staff Action Log",
            color: 16776960,
            fields: [
                { name: "Staff Member", value: staffName || "Unknown Staff", inline: true },
                { name: "Action Performed", value: actionType, inline: true },
                { name: "Target Details", value: targetDetails || "N/A", inline: false }
            ],
            timestamp: new Date().toISOString()
        }]
    };
    try {
        const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
            method: 'POST',
            headers: { 'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            console.error(`[sendDiscordStaffAuditNotification] Failed (${res.status}):`, await res.text());
        } else {
            console.log(`[sendDiscordStaffAuditNotification] Logged action: ${actionType}`);
        }
    } catch (err) {
        console.error("[sendDiscordStaffAuditNotification] Exception:", err.message);
    }
}

export async function resolveGuildId(env) {
    if (env.DISCORD_GUILD_ID) return env.DISCORD_GUILD_ID;
    const channelRes = await fetch(`https://discord.com/api/v10/channels/${env.DISCORD_FORUM_CHANNEL_ID}`, {
        headers: { 'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}` }
    });
    if (channelRes.ok) {
        const chData = await channelRes.json();
        return chData.guild_id;
    }
    console.error("[resolveGuildId] Could not resolve guild ID.");
    return null;
}

export async function findDiscordThreadByName(username, env) {
    const lowerName = username.toLowerCase();
    console.log(`[findDiscordThreadByName] Searching for: ${username}`);

    const guildId = await resolveGuildId(env);
    if (guildId) {
        const activeRes = await fetch(`https://discord.com/api/v10/guilds/${guildId}/threads/active`, {
            headers: { 'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}` }
        });
        if (activeRes.ok) {
            const activeData = await activeRes.json();
            const thread = (activeData.threads || []).find(t =>
                t.parent_id === env.DISCORD_FORUM_CHANNEL_ID && t.name.toLowerCase() === lowerName
            );
            if (thread) { console.log(`[findDiscordThreadByName] Found in active threads: ID ${thread.id}`); return thread; }
        }
    }

    const archivedRes = await fetch(`https://discord.com/api/v10/channels/${env.DISCORD_FORUM_CHANNEL_ID}/threads/archived/public`, {
        headers: { 'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}` }
    });
    if (archivedRes.ok) {
        const archivedData = await archivedRes.json();
        const thread = (archivedData.threads || []).find(t => t.name.toLowerCase() === lowerName);
        if (thread) { console.log(`[findDiscordThreadByName] Found in archived threads: ID ${thread.id}`); return thread; }
    }

    console.log(`[findDiscordThreadByName] Thread not found for: ${username}`);
    return null;
}

export async function getDiscordThreadData(threadId, env) {
    console.log(`[getDiscordThreadData] Fetching messages for threadId: ${threadId}`);

    let res = await fetch(`https://discord.com/api/v10/channels/${threadId}/messages/${threadId}`, {
        headers: { 'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}` }
    });
    if (!res.ok) {
        res = await fetch(`https://discord.com/api/v10/channels/${threadId}/messages?limit=1`, {
            headers: { 'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}` }
        });
    }
    if (!res.ok) {
        console.error(`[getDiscordThreadData] Failed to fetch message for thread ${threadId}: ${res.status}`);
        return null;
    }

    const data = await res.json();
    const message = Array.isArray(data) ? data[0] : data;
    if (!message || !message.content) {
        console.warn(`[getDiscordThreadData] No message content in thread ${threadId}`);
        return null;
    }

    try {
        let content = message.content.trim();
        if (content.startsWith('```')) content = content.replace(/^```(json)?/, '').replace(/```$/, '').trim();
        if (content.endsWith('%7D')) content = content.slice(0, -3) + '}';
        return JSON.parse(content);
    } catch (e) {
        console.error(`[getDiscordThreadData] Failed to parse JSON for thread ${threadId}:`, e.message);
        return { password: '', avatarUrl: '', tags: [] };
    }
}

export async function patchDiscordThread(threadId, payload, env) {
    console.log(`[patchDiscordThread] Patching thread ${threadId}`);
    return await fetch(`https://discord.com/api/v10/channels/${threadId}`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
}

export async function fetchAllSongsFromGitHub(env) {
    const owner = env.GITHUB_OWNER;
    const repo = env.GITHUB_REPO;
    try {
        const rootUrl = `https://api.github.com/repos/${owner}/${repo}/contents/songs`;
        const rootRes = await fetch(rootUrl, {
            headers: { 'Authorization': `Bearer ${env.GITHUB_TOKEN}`, 'User-Agent': 'Cloudflare-Worker' }
        });
        if (!rootRes.ok) { console.warn(`[fetchAllSongsFromGitHub] Failed. Status: ${rootRes.status}`); return []; }

        const items = await rootRes.json();
        let songFilePromises = [];

        for (const item of items) {
            if (item.type === 'file' && item.name.endsWith('.json')) {
                songFilePromises.push(
                    fetch(item.download_url, { headers: { 'Authorization': `Bearer ${env.GITHUB_TOKEN}`, 'User-Agent': 'Cloudflare-Worker' } })
                        .then(res => res.ok ? res.json() : null)
                );
            } else if (item.type === 'dir') {
                const batchRes = await fetch(item.url, { headers: { 'Authorization': `Bearer ${env.GITHUB_TOKEN}`, 'User-Agent': 'Cloudflare-Worker' } });
                if (batchRes.ok) {
                    const files = await batchRes.json();
                    songFilePromises.push(...files
                        .filter(f => f.name.endsWith('.json'))
                        .map(file => fetch(file.download_url, { headers: { 'Authorization': `Bearer ${env.GITHUB_TOKEN}`, 'User-Agent': 'Cloudflare-Worker' } })
                            .then(res => res.ok ? res.json() : null))
                    );
                }
            }
        }

        const songs = await Promise.all(songFilePromises);
        const validSongs = songs.filter(Boolean);
        console.log(`[fetchAllSongsFromGitHub] Loaded ${validSongs.length} songs.`);
        return validSongs;
    } catch (err) {
        console.error("[fetchAllSongsFromGitHub] Exception:", err.message);
        return [];
    }
}

export async function saveSongToGitHub(songData, env) {
    const owner = env.GITHUB_OWNER;
    const repo = env.GITHUB_REPO;
    const branch = env.GITHUB_BRANCH || 'main';
    const folderIndex = Math.floor(Math.abs(hashCode(songData.id)) % 1000);
    const filePath = `songs/batch_${folderIndex}/${songData.id}.json`;
    const encodedContent = btoa(unescape(encodeURIComponent(JSON.stringify(songData, null, 2))));
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;

    let sha = null;
    const existingFileRes = await fetch(url, { headers: { 'Authorization': `Bearer ${env.GITHUB_TOKEN}`, 'User-Agent': 'Cloudflare-Worker' } });
    if (existingFileRes.status === 200) sha = (await existingFileRes.json()).sha;

    const response = await fetch(url, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${env.GITHUB_TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': 'Cloudflare-Worker' },
        body: JSON.stringify({ message: `Add song: ${songData.songName} (${songData.id})`, content: encodedContent, branch, ...(sha && { sha }) })
    });
    if (!response.ok) throw new Error(`Failed to save to GitHub: ${await response.text()}`);
}

export async function removeSongFromGitHub(songId, env) {
    const owner = env.GITHUB_OWNER;
    const repo = env.GITHUB_REPO;
    const branch = env.GITHUB_BRANCH || 'main';
    const folderIndex = Math.floor(Math.abs(hashCode(songId)) % 1000);
    const filePath = `songs/batch_${folderIndex}/${songId}.json`;
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;

    const existingFileRes = await fetch(url, { 
        headers: { 'Authorization': `Bearer ${env.GITHUB_TOKEN}`, 'User-Agent': 'Cloudflare-Worker' } 
    });

    if (existingFileRes.status === 200) {
        const fileData = await existingFileRes.json();
        const deleteRes = await fetch(url, {
            method: 'DELETE',
            headers: { 
                'Authorization': `Bearer ${env.GITHUB_TOKEN}`, 
                'Content-Type': 'application/json', 
                'User-Agent': 'Cloudflare-Worker' 
            },
            body: JSON.stringify({ message: `Delete song from catalog: ${songId}`, sha: fileData.sha, branch })
        });

        if (!deleteRes.ok) {
            throw new Error(`GitHub delete failed: ${await deleteRes.text()}`);
        }
        return fileData;
    } else {
        throw new Error("Song file not found in repository.");
    }
}

export async function fetchPendingSongsFromGitHub(env) {
    const owner = env.GITHUB_OWNER;
    const repo = env.GITHUB_REPO;
    try {
        const url = `https://api.github.com/repos/${owner}/${repo}/contents/pending`;
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${env.GITHUB_TOKEN}`, 'User-Agent': 'Cloudflare-Worker' } });
        if (!res.ok) return [];
        const files = await res.json();
        const promises = files.filter(f => f.name.endsWith('.json')).map(file =>
            fetch(file.download_url, { headers: { 'Authorization': `Bearer ${env.GITHUB_TOKEN}`, 'User-Agent': 'Cloudflare-Worker' } })
                .then(r => r.ok ? r.json() : null)
        );
        return (await Promise.all(promises)).filter(Boolean);
    } catch (e) {
        console.error("[fetchPendingSongsFromGitHub] Exception:", e.message);
        return [];
    }
}

export async function savePendingSongToGitHub(songData, env) {
    const owner = env.GITHUB_OWNER;
    const repo = env.GITHUB_REPO;
    const branch = env.GITHUB_BRANCH || 'main';
    const filePath = `pending/${songData.id}.json`;
    const encodedContent = btoa(unescape(encodeURIComponent(JSON.stringify(songData, null, 2))));
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;

    const response = await fetch(url, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${env.GITHUB_TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': 'Cloudflare-Worker' },
        body: JSON.stringify({ message: `Add pending song: ${songData.songName} (${songData.id})`, content: encodedContent, branch })
    });
    if (!response.ok) throw new Error(`Failed to save pending song to GitHub: ${await response.text()}`);
}

export async function removePendingSongFromGitHub(trackId, env) {
    const owner = env.GITHUB_OWNER;
    const repo = env.GITHUB_REPO;
    const branch = env.GITHUB_BRANCH || 'main';
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/pending/${trackId}.json`;

    const existingFileRes = await fetch(url, { headers: { 'Authorization': `Bearer ${env.GITHUB_TOKEN}`, 'User-Agent': 'Cloudflare-Worker' } });
    if (existingFileRes.status === 200) {
        const fileData = await existingFileRes.json();
        await fetch(url, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${env.GITHUB_TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': 'Cloudflare-Worker' },
            body: JSON.stringify({ message: `Remove pending song: ${trackId}`, sha: fileData.sha, branch })
        });
    }
}

export async function updateThreadTag(threadId, tagId, add, env, staffName = "Staff Member", actionDescription = "Updated User Status") {
    if (!tagId) return jsonResponse({ error: "Target tag ID is not configured." }, 400);

    const threadRes = await fetch(`https://discord.com/api/v10/channels/${threadId}`, {
        headers: { 'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}` }
    });
    if (!threadRes.ok) {
        console.warn(`[updateThreadTag] Thread not found: ${threadId}`);
        return jsonResponse({ error: "Thread not found" }, 404);
    }
    const threadData = await threadRes.json();
    let tags = threadData.applied_tags || [];
    if (add && !tags.includes(tagId)) tags.push(tagId);
    else if (!add) tags = tags.filter(t => t !== tagId);

    const updateRes = await patchDiscordThread(threadId, { applied_tags: tags }, env);
    if (!updateRes.ok) {
        console.error(`[updateThreadTag] Failed to update tags: ${updateRes.status}`);
        return jsonResponse({ error: "Failed to update Discord thread tags." }, 500);
    }

    await sendDiscordStaffAuditNotification(
        actionDescription,
        staffName,
        `User Thread: "${threadData.name}" (ID: ${threadId}) | Status: ${add ? "Added" : "Removed"}`,
        env
    );

    return jsonResponse({ success: true, message: "User status updated." });
}