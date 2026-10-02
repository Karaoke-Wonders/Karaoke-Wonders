export function hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}

function isSafeRepositoryId(value) {
    return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
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

    const requestBody = JSON.stringify({
        message: `[Inbox Bot] Add ${type} notification for ${safeUser}`,
        content: encodedContent,
        branch
    });

    for (let attempt = 1; attempt <= 3; attempt++) {
        let response;
        try {
            response = await fetch(url, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
                    'Content-Type': 'application/json',
                    'User-Agent': 'Cloudflare-Worker'
                },
                body: requestBody
            });
        } catch (error) {
            if (attempt === 3) throw new Error(`Inbox notification request failed: ${error.message}`);
            await new Promise(resolve => setTimeout(resolve, 200 * attempt));
            continue;
        }

        if (response.ok) {
            console.log(`[saveInboxNotification] Notification saved for user ${safeUser}: ${fileName}`);
            return true;
        }

        const errText = await response.text();
        const rateLimited = response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0';
        const canRetry = response.status === 409 || response.status === 429 || response.status >= 500 || rateLimited;
        if (!canRetry || attempt === 3) {
            throw new Error(`GitHub notification write failed (${response.status}): ${errText}`);
        }

        const retryAfterMs = Number(response.headers.get('Retry-After')) * 1000;
        const delayMs = retryAfterMs > 0 ? Math.min(retryAfterMs, 2000) : 200 * attempt;
        await new Promise(resolve => setTimeout(resolve, delayMs));
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

export async function authenticateAccountRequest(request, env) {
    const authorization = request.headers.get('Authorization') || '';
    if (!authorization.startsWith('Bearer ') || authorization.length > 4096) {
        return jsonResponse({ error: 'Authentication required.' }, 401);
    }

    let credentials;
    try {
        const binary = atob(authorization.slice(7));
        const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
        credentials = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
        return jsonResponse({ error: 'Invalid authentication credentials.' }, 401);
    }

    const username = typeof credentials.username === 'string' ? credentials.username.trim() : '';
    const password = typeof credentials.password === 'string' ? credentials.password : '';
    if (!username || !password) return jsonResponse({ error: 'Invalid authentication credentials.' }, 401);

    try {
        let thread = null;
        if (typeof credentials.threadId === 'string' && /^\d{17,20}$/.test(credentials.threadId)) {
            const response = await fetch(`https://discord.com/api/v10/channels/${credentials.threadId}`, {
                headers: { 'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}` }
            });
            if (response.ok) {
                const candidate = await response.json();
                if (
                    candidate.parent_id === env.DISCORD_FORUM_CHANNEL_ID &&
                    String(candidate.name).toLowerCase() === username.toLowerCase()
                ) {
                    thread = candidate;
                }
            } else if (response.status === 429 || response.status >= 500) {
                return jsonResponse({ error: 'Account verification is temporarily unavailable.' }, 503);
            }
        }

        if (!thread) thread = await findDiscordThreadByName(username, env);
        if (!thread) return jsonResponse({ error: 'Invalid username or password.' }, 401);

        const profile = await getDiscordThreadData(thread.id, env);
        if (!profile) return jsonResponse({ error: 'Account verification is temporarily unavailable.' }, 503);
        if (profile.password !== password) return jsonResponse({ error: 'Invalid username or password.' }, 401);

        const tags = thread.applied_tags || [];
        const isManager = Boolean(env.DISCORD_TAG_MANAGER && tags.includes(env.DISCORD_TAG_MANAGER));
        const isStaff = Boolean(env.DISCORD_TAG_STAFF && tags.includes(env.DISCORD_TAG_STAFF));
        if (env.DISCORD_TAG_BLACKLISTED && tags.includes(env.DISCORD_TAG_BLACKLISTED)) {
            return jsonResponse({ error: 'This account is blacklisted.' }, 403);
        }

        return { thread, username: thread.name, tags, isStaff, isManager };
    } catch (error) {
        console.error('[authenticateAccountRequest] Discord verification failed:', error.message);
        return jsonResponse({ error: 'Account verification is temporarily unavailable.' }, 503);
    }
}

export async function authorizeAdminRequest(request, env, managerOnly = false) {
    const account = await authenticateAccountRequest(request, env);
    if (account instanceof Response) return account;
    if (managerOnly ? !account.isManager : !account.isStaff && !account.isManager) {
        return jsonResponse({ error: 'Administrator privileges required.' }, 403);
    }
    return account;
}

export async function patchDiscordThread(threadId, payload, env) {
    console.log(`[patchDiscordThread] Patching thread ${threadId}`);
    return await fetch(`https://discord.com/api/v10/channels/${threadId}`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
}

async function listSongFileUrlsFromGitHub(env) {
    const owner = env.GITHUB_OWNER;
    const repo = env.GITHUB_REPO;
    const rootUrl = `https://api.github.com/repos/${owner}/${repo}/contents/songs`;
    const rootRes = await fetch(rootUrl, {
        headers: { 'Authorization': `Bearer ${env.GITHUB_TOKEN}`, 'User-Agent': 'Cloudflare-Worker' },
        cf: { cacheTtl: 0 }
    });
    if (!rootRes.ok) throw new Error(`Failed to list songs. Status: ${rootRes.status}`);

    const items = await rootRes.json();
    const fileUrls = [];
    const version = items.map(item => `${item.name}:${item.sha || ''}`).sort().join('|');
    for (const item of items) {
        if (item.type === 'file' && item.name.endsWith('.json')) {
            fileUrls.push(item.download_url);
        } else if (item.type === 'dir') {
            const batchRes = await fetch(item.url, {
                headers: { 'Authorization': `Bearer ${env.GITHUB_TOKEN}`, 'User-Agent': 'Cloudflare-Worker' },
                cf: { cacheTtl: 0 }
            });
            if (!batchRes.ok) continue;
            const files = await batchRes.json();
            fileUrls.push(...files.filter(file => file.name.endsWith('.json')).map(file => file.download_url));
        }
    }
    return { fileUrls, version };
}

async function fetchSongFiles(fileUrls, env) {
    const songs = new Array(fileUrls.length);
    let nextIndex = 0;
    const worker = async () => {
        while (nextIndex < fileUrls.length) {
            const index = nextIndex++;
            const response = await fetch(fileUrls[index], {
                headers: { 'Authorization': `Bearer ${env.GITHUB_TOKEN}`, 'User-Agent': 'Cloudflare-Worker' },
                cf: { cacheTtl: 0 }
            });
            songs[index] = response.ok ? await response.json() : null;
        }
    };

    const workerCount = Math.min(25, fileUrls.length);
    await Promise.all(Array.from({ length: workerCount }, worker));
    return songs.filter(Boolean);
}

export async function fetchSongCatalogFromGitHub(env) {
    const { fileUrls, version } = await listSongFileUrlsFromGitHub(env);
    const songs = await fetchSongFiles(fileUrls, env);
    return { songs, version };
}

export async function fetchSongPageFromGitHub(env, startIndex, limit) {
    try {
        const { fileUrls, version } = await listSongFileUrlsFromGitHub(env);
        const validSongs = await fetchSongFiles(fileUrls.slice(startIndex, startIndex + limit), env);
        return { songs: validSongs, total: fileUrls.length, version };
    } catch (err) {
        console.error("[fetchSongPageFromGitHub] Exception:", err.message);
        return { songs: [], total: 0 };
    }
}

export async function fetchAllSongsFromGitHub(env) {
    try {
        const { songs } = await fetchSongCatalogFromGitHub(env);
        console.log(`[fetchAllSongsFromGitHub] Loaded ${songs.length} songs.`);
        return songs;
    } catch (err) {
        console.error("[fetchAllSongsFromGitHub] Exception:", err.message);
        return [];
    }
}

export async function saveSongToGitHub(songData, env) {
    if (!isSafeRepositoryId(songData?.id)) throw new Error('Invalid song ID.');
    const owner = env.GITHUB_OWNER;
    const repo = env.GITHUB_REPO;
    const branch = env.GITHUB_BRANCH || 'main';
    const folderIndex = Math.floor(Math.abs(hashCode(songData.id)) % 1000);
    const filePath = `songs/batch_${folderIndex}/${songData.id}.json`;
    const encodedContent = btoa(unescape(encodeURIComponent(JSON.stringify(songData, null, 2))));
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;

    let sha = null;
    const existingFileRes = await fetch(url, { headers: { 'Authorization': `Bearer ${env.GITHUB_TOKEN}`, 'User-Agent': 'Cloudflare-Worker' } });
    if (existingFileRes.ok) sha = (await existingFileRes.json()).sha;
    else if (existingFileRes.status !== 404) {
        throw new Error(`Failed to check existing song (${existingFileRes.status}): ${await existingFileRes.text()}`);
    }

    const response = await fetch(url, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${env.GITHUB_TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': 'Cloudflare-Worker' },
        body: JSON.stringify({ message: `Add song: ${songData.songName} (${songData.id})`, content: encodedContent, branch, ...(sha && { sha }) })
    });
    if (!response.ok) throw new Error(`Failed to save to GitHub: ${await response.text()}`);
}

export async function removeSongFromGitHub(songId, env) {
    if (!isSafeRepositoryId(songId)) throw new Error('Invalid song ID.');
    const owner = env.GITHUB_OWNER;
    const repo = env.GITHUB_REPO;
    const branch = env.GITHUB_BRANCH || 'main';
    const folderIndex = Math.floor(Math.abs(hashCode(songId)) % 1000);
    const filePath = `songs/batch_${folderIndex}/${songId}.json`;
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;

    const existingFileRes = await fetch(url, { 
        headers: { 'Authorization': `Bearer ${env.GITHUB_TOKEN}`, 'User-Agent': 'Cloudflare-Worker' } 
    });

    if (existingFileRes.ok) {
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
    } else if (existingFileRes.status === 404) {
        throw new Error("Song file not found in repository.");
    } else {
        throw new Error(`Failed to read song before deletion (${existingFileRes.status}): ${await existingFileRes.text()}`);
    }
}

export async function fetchPendingSongsFromGitHub(env) {
    const owner = env.GITHUB_OWNER;
    const repo = env.GITHUB_REPO;
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/pending`;
    const response = await fetch(url, { headers: { 'Authorization': `Bearer ${env.GITHUB_TOKEN}`, 'User-Agent': 'Cloudflare-Worker' } });
    if (response.status === 404) return [];
    if (!response.ok) throw new Error(`Failed to list pending songs (${response.status}): ${await response.text()}`);

    const entries = await response.json();
    if (!Array.isArray(entries)) throw new Error('Unexpected response while listing pending songs.');
    const files = entries.filter(file => file.name.endsWith('.json'));
    const songs = new Array(files.length);
    let nextIndex = 0;
    const worker = async () => {
        while (nextIndex < files.length) {
            const index = nextIndex++;
            const fileResponse = await fetch(files[index].download_url, {
                headers: { 'Authorization': `Bearer ${env.GITHUB_TOKEN}`, 'User-Agent': 'Cloudflare-Worker' }
            });
            if (!fileResponse.ok) {
                throw new Error(`Failed to read pending song (${fileResponse.status}).`);
            }
            songs[index] = await fileResponse.json();
        }
    };

    await Promise.all(Array.from({ length: Math.min(25, files.length) }, worker));
    return songs;
}

export async function savePendingSongToGitHub(songData, env) {
    if (!isSafeRepositoryId(songData?.id)) throw new Error('Invalid pending track ID.');
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
    if (!isSafeRepositoryId(trackId)) throw new Error('Invalid pending track ID.');
    const owner = env.GITHUB_OWNER;
    const repo = env.GITHUB_REPO;
    const branch = env.GITHUB_BRANCH || 'main';
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/pending/${trackId}.json`;

    const existingFileRes = await fetch(url, { headers: { 'Authorization': `Bearer ${env.GITHUB_TOKEN}`, 'User-Agent': 'Cloudflare-Worker' } });
    if (existingFileRes.status === 404) return false;
    if (!existingFileRes.ok) {
        throw new Error(`Failed to read pending track (${existingFileRes.status}): ${await existingFileRes.text()}`);
    }

    const fileData = await existingFileRes.json();
    const deleteRes = await fetch(url, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${env.GITHUB_TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': 'Cloudflare-Worker' },
        body: JSON.stringify({ message: `Remove pending song: ${trackId}`, sha: fileData.sha, branch })
    });
    if (!deleteRes.ok) throw new Error(`Failed to delete pending track (${deleteRes.status}): ${await deleteRes.text()}`);
    return true;
}

export async function updateThreadTag(threadId, tagId, add, env, staffName = "Staff Member", actionDescription = "Updated User Status", protectStaff = false) {
    if (typeof threadId !== 'string' || !/^\d{17,20}$/.test(threadId)) {
        return jsonResponse({ error: 'Invalid thread ID.' }, 400);
    }
    if (typeof add !== 'boolean') return jsonResponse({ error: 'Tag action must be a boolean.' }, 400);
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
    if (protectStaff && add && tags.includes(env.DISCORD_TAG_STAFF)) {
        return jsonResponse({ error: 'Staff accounts are protected from new restrictions and blacklists.' }, 403);
    }
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

export async function fetchSongCatalogVersionFromGitHub(env) {
    const url = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/songs`;
    const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${env.GITHUB_TOKEN}`, 'User-Agent': 'Cloudflare-Worker' },
        cf: { cacheTtl: 0 }
    });
    if (!response.ok) throw new Error(`Failed to get song catalog version. Status: ${response.status}`);

    const items = await response.json();
    return items.map(item => `${item.name}:${item.sha || ''}`).sort().join('|');
}

export async function invalidateSongCatalogVersionCache(requestUrl) {
    try {
        const cache = globalThis.caches?.default;
        if (!cache) return;
        const cacheKeys = [
            new Request(new URL('/api/songs/version', requestUrl).toString()),
            new Request(new URL('/api/songs/catalog-cache', requestUrl).toString())
        ];
        await Promise.all(cacheKeys.map(cacheKey => cache.delete(cacheKey)));
    } catch (error) {
        console.warn('[invalidateSongCatalogVersionCache] Failed to invalidate version cache:', error.message);
    }
}