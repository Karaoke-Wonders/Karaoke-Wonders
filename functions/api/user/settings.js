import { findDiscordThreadByName, getDiscordThreadData, jsonResponse } from '../../_middleware/utils.js';

export async function onRequestPost({ request, env }) {
    const body = await request.json();
    const { username, pfp, email } = body;

    if (!username) {
        return jsonResponse({ error: "Username is required to update settings." }, 400);
    }

    const thread = await findDiscordThreadByName(username, env);
    if (!thread) {
        return jsonResponse({ error: "User account thread not found." }, 404);
    }

    const profileData = await getDiscordThreadData(thread.id, env);
    if (!profileData) {
        return jsonResponse({ error: "Failed to retrieve account data." }, 500);
    }

    const updatedProfile = {
        ...profileData,
        avatarUrl: pfp || profileData.avatarUrl,
        email: email || profileData.email || "",
        updatedAt: new Date().toISOString()
    };

    const updatedContent = JSON.stringify(updatedProfile, null, 2);

    const msgRes = await fetch(`https://discord.com/api/v10/channels/${thread.id}/messages/${thread.id}`, {
        headers: { 'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}` }
    });

    let messageId = thread.id;
    if (!msgRes.ok) {
        const fallbackRes = await fetch(`https://discord.com/api/v10/channels/${thread.id}/messages?limit=1`, {
            headers: { 'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}` }
        });
        if (fallbackRes.ok) {
            const msgs = await fallbackRes.json();
            if (msgs.length > 0) messageId = msgs[0].id;
        }
    }

    const patchMsgRes = await fetch(`https://discord.com/api/v10/channels/${thread.id}/messages/${messageId}`, {
        method: 'PATCH',
        headers: {
            'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ content: `\`\`\`json\n${updatedContent}\n\`\`\`` })
    });

    if (!patchMsgRes.ok) {
        const errText = await patchMsgRes.text();
        console.error(`[handleUpdateUserSettings] Failed to update thread message: ${errText}`);
        return jsonResponse({ error: "Failed to save updated user settings." }, 500);
    }

    console.log(`[handleUpdateUserSettings] Successfully updated settings for user: ${username}`);
    return jsonResponse({ success: true, message: "Settings updated successfully." });
}