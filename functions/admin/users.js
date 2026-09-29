import { resolveGuildId, jsonResponse } from 'functions/_middleware/utils.js';

export async function onRequestGet({ env }) {
    console.log("[handleGetUsers] Fetching active threads from Discord forum channel...");
    const guildId = await resolveGuildId(env);
    if (!guildId) return jsonResponse([]);

    const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}/threads/active`, {
        headers: { 'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}` }
    });
    if (!res.ok) {
        console.error(`[handleGetUsers] Failed to fetch active threads: ${res.status}`);
        return jsonResponse([]);
    }
    const data = await res.json();
    const threads = (data.threads || []).filter(t => t.parent_id === env.DISCORD_FORUM_CHANNEL_ID);

    const users = await Promise.all(threads.map(async (t) => {
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
                        if (parsed.avatarUrl) {
                            avatarUrl = parsed.avatarUrl;
                        }
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

    console.log(`[handleGetUsers] Retrieved ${users.length} active users.`);
    return jsonResponse(users);
}