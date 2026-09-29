import { findDiscordThreadByName, patchDiscordThread, getDiscordThreadData, jsonResponse } from 'functions/_middleware/utils.js';

export async function onRequestPost({ request, env }) {
    const body = await request.json();
    console.log("[handleGetAccount] Login attempt for username:", body.username);
    const { username, password } = body;

    if (!username) {
        console.warn("[handleGetAccount] Username field is missing.");
        return jsonResponse({ error: "Username is required." }, 400);
    }

    const thread = await findDiscordThreadByName(username, env);
    if (!thread) {
        console.warn(`[handleGetAccount] Thread not found for username: ${username}`);
        return jsonResponse({ error: "Account does not exist. Please register first." }, 404);
    }

    if (thread.thread_metadata && thread.thread_metadata.archived) {
        console.log(`[handleGetAccount] Thread ${thread.id} is archived. Unarchiving...`);
        await patchDiscordThread(thread.id, { archived: false }, env);
    }

    const profileData = await getDiscordThreadData(thread.id, env);
    if (!profileData) {
        console.error(`[handleGetAccount] Failed to read account profile data for threadId: ${thread.id}`);
        return jsonResponse({ error: "Could not read account profile data." }, 500);
    }
    if (profileData.password !== password) {
        console.warn(`[handleGetAccount] Invalid password provided for user: ${username}`);
        return jsonResponse({ error: "Invalid password." }, 401);
    }

    const tags = thread.applied_tags || [];
    const isBlacklisted = tags.includes(env.DISCORD_TAG_BLACKLISTED);
    const isRestricted = tags.includes(env.DISCORD_TAG_RESTRICTED);
    const isStaff = tags.includes(env.DISCORD_TAG_STAFF);
    const isManager = tags.includes(env.DISCORD_TAG_MANAGER);

    if (isBlacklisted) {
        console.warn(`[handleGetAccount] Access blocked: Account ${username} is blacklisted.`);
        return jsonResponse({ error: "This account has been blacklisted." }, 403);
    }

    let role = 'member';
    if (isManager) role = 'manager';
    else if (isStaff) role = 'administrator';

    console.log(`[handleGetAccount] Successful login for user: ${username} (Role: ${role})`);
    return jsonResponse({
        username: thread.name,
        threadId: thread.id,
        avatarUrl: profileData.avatarUrl,
        tags,
        role,
        isAdmin: isStaff || isManager,
        isManager,
        isStaff,
        isRestricted,
        isLocked: isBlacklisted
    });
}