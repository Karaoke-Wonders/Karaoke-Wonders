import { findBlacklistedThreadForIp, findDiscordThreadByName, getRequestIp, jsonResponse } from '../_middleware/utils.js';
// Import the text file directly (supported by Cloudflare Pages/Vite build tools)
import blacklistText from '../../files/nameBL.txt?raw'; 
// Note: Adjust the relative path above depending on where this function file is located 
// relative to your root "files/nameBL.txt" folder.

export async function onRequestPost({ request, env }) {
    const body = await request.json();
    console.log("[handleCreateAccount] Request received for username:", body.username);
    const { username, password } = body;

    if (!username || !password) {
        console.warn("[handleCreateAccount] Missing username or password.");
        return jsonResponse({ error: "Username and password are required." }, 400);
    }

    const ipAddress = getRequestIp(request);
    if (ipAddress) {
        const blacklistedThread = await findBlacklistedThreadForIp(ipAddress, env);
        if (blacklistedThread) {
            console.warn(`[handleCreateAccount] IP ${ipAddress} is blacklisted and cannot create a new account while the blacklist tag remains active.`);
            return jsonResponse({ error: "This IP is currently blacklisted and cannot create a new account until the blacklist is removed." }, 403);
        }
    }

    const lowerUsername = username.trim().toLowerCase();

    // 1. Check against the imported blacklist text (supports commas, newlines, vertical/horizontal)
    if (blacklistText) {
        const blacklistedNames = blacklistText
            .split(/[\r\n,]+/) // Splits by any newline or comma
            .map(name => name.trim().toLowerCase())
            .filter(Boolean);

        // Check for exact matches or similar variations (substring matching)
        const matchedBlacklist = blacklistedNames.find(blName => {
            if (!blName) return false;
            
            // Exact match check
            if (lowerUsername === blName) return true;
            
            // Similarity / Substring check (ignores very short words under 3 chars to prevent false positives)
            if (blName.length >= 3 && (lowerUsername.includes(blName) || blName.includes(lowerUsername))) {
                return true;
            }
            
            return false;
        });

        if (matchedBlacklist) {
            console.warn(`[handleCreateAccount] Username "${username}" matches or is too similar to a blacklisted term ("${matchedBlacklist}").`);
            return jsonResponse({ error: "This username or a similar variation cannot be used." }, 400);
        }
    }

    // 2. Check if an account/thread already exists on Discord
    const existingThread = await findDiscordThreadByName(username, env);
    if (existingThread) {
        console.warn(`[handleCreateAccount] Account already exists for username: ${username}`);
        return jsonResponse({ error: "Account already exists." }, 400);
    }

    const profilePayload = {
        password: password,
        avatarUrl: 'https://cdn.discordapp.com/embed/avatars/0.png',
        email: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ipAddress: ipAddress || null
    };
    const jsonPayloadString = `\`\`\`json\n${JSON.stringify(profilePayload, null, 2)}\n\`\`\``;

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