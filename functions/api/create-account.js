import { findDiscordThreadByName, jsonResponse } from 'functions/_middleware/utils.js';

export async function onRequestPost({ request, env }) {
    const body = await request.json();
    console.log("[handleCreateAccount] Request received for username:", body.username);
    const { username, password } = body;

    if (!username || !password) {
        console.warn("[handleCreateAccount] Missing username or password.");
        return jsonResponse({ error: "Username and password are required." }, 400);
    }
    const existingThread = await findDiscordThreadByName(username, env);
    if (existingThread) {
        console.warn(`[handleCreateAccount] Account already exists for username: ${username}`);
        return jsonResponse({ error: "Account already exists." }, 400);
    }

    const jsonPayloadString = JSON.stringify({
        password: password,
        avatarUrl: 'https://cdn.discordapp.com/embed/avatars/0.png',
        createdAt: new Date().toISOString()
    });

    const threadPayload = {
        name: username,
        auto_archive_duration: 10080,
        message: { content: jsonPayloadString }
    };

    console.log(`[handleCreateAccount] Creating Discord forum thread for: ${username}`);
    const response = await fetch(`https://discord.com/api/v10/channels/${env.DISCORD_FORUM_CHANNEL_ID}/threads`, {
        method: 'POST',
        headers: { 'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(threadPayload)
    });

    if (!response.ok) {
        const errText = await response.text();
        console.error(`[handleCreateAccount] Discord API Error (${response.status}):`, errText);
        return jsonResponse({ error: `Failed to create account forum post: ${errText}` }, 500);
    }
    const threadData = await response.json();
    console.log(`[handleCreateAccount] Successfully created thread ID: ${threadData.id}`);
    return jsonResponse({ success: true, message: "Account created successfully.", threadId: threadData.id });
}