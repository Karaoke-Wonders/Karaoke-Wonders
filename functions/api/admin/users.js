import { resolveGuildId, jsonResponse } from '../../_middleware/utils.js';

export async function onRequestGet({ request, env }) {
    console.log("[handleGetUsers] Fetching active threads from Discord forum channel...");
    const guildId = await resolveGuildId(env);
    if (!guildId) return jsonResponse({ users: [], total: 0, totalStaff: 0, page: 1, limit: 12, totalPages: 0 });

    const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}/threads/active`, {
        headers: { 'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}` }
    });
    
    if (!res.ok) {
        console.error(`[handleGetUsers] Failed to fetch active threads: ${res.status}`);
        return jsonResponse({ users: [], total: 0, totalStaff: 0, page: 1, limit: 12, totalPages: 0 });
    }

    const data = await res.json();
    const threads = (data.threads || []).filter(t => t.parent_id === env.DISCORD_FORUM_CHANNEL_ID);

    // Count total staff across ALL threads prior to pagination
    const totalStaff = threads.filter(t => {
        const tags = t.applied_tags || [];
        return tags.includes(env.DISCORD_TAG_STAFF) || tags.includes(env.DISCORD_TAG_MANAGER);
    }).length;

    const url = new URL(request.url);
    const requestedPage = Number.parseInt(url.searchParams.get('page'), 10);
    const requestedLimit = Number.parseInt(url.searchParams.get('limit'), 10);
    const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 100) : 12;
    const search = (url.searchParams.get('search') || '').trim().toLowerCase();
    const role = url.searchParams.get('role') || 'all';
    const matchingThreads = threads.filter(thread => {
        const tags = thread.applied_tags || [];
        const matchesSearch = !search ||
            String(thread.name || '').toLowerCase().includes(search) ||
            String(thread.id).includes(search);
        const matchesRole = role === 'manager' ? tags.includes(env.DISCORD_TAG_MANAGER) :
            role === 'staff' ? tags.includes(env.DISCORD_TAG_STAFF) :
            role === 'team' ? tags.includes('1555048910324760676') :
            role === 'banned' ? tags.includes(env.DISCORD_TAG_BLACKLISTED) :
            role === 'restricted' ? tags.includes(env.DISCORD_TAG_RESTRICTED) :
            true;
        return matchesSearch && matchesRole;
    });

    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedThreads = matchingThreads.slice(startIndex, endIndex);

    const users = await Promise.all(paginatedThreads.map(async (t) => {
        const tags = t.applied_tags || [];
        let avatarUrl = 'https://cdn.discordapp.com/embed/avatars/0.png';

        try {
            const msgRes = await fetch(`https://discord.com/api/v10/channels/${t.id}/messages?limit=10`, {
                headers: { 'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}` }
            });

            if (msgRes.ok) {
                const messages = await msgRes.json();
                const metadataMsg = messages.find(m => m.content.includes('"avatarUrl"'));
                if (metadataMsg) {
                    const jsonMatch = metadataMsg.content.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        const parsed = JSON.parse(jsonMatch[0]);
                        if (parsed.avatarUrl) avatarUrl = parsed.avatarUrl;
                    }
                }
            }
        } catch (err) {
            console.error(`[handleGetUsers] Failed to parse thread metadata for thread ${t.id}:`, err);
        }

        return {
            username: t.name,
            threadId: t.id,
            avatarUrl,
            tags,
            isLocked: tags.includes(env.DISCORD_TAG_BLACKLISTED),
            isRestricted: tags.includes(env.DISCORD_TAG_RESTRICTED),
            isStaff: tags.includes(env.DISCORD_TAG_STAFF),
            isManager: tags.includes(env.DISCORD_TAG_MANAGER)
        };
    }));

    return jsonResponse({
        users,
        total: matchingThreads.length,
        totalStaff,
        page,
        limit,
        totalPages: Math.ceil(matchingThreads.length / limit)
    });
}