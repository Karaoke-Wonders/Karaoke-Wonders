import { patchDiscordThread, jsonResponse } from 'functions/_middleware/utils.js';

export async function onRequestPost({ request, env }) {
    const { threadId } = await request.json();
    console.log(`[handleArchiveSession] Archiving threadId: ${threadId}`);
    if (!threadId) return jsonResponse({ error: "Thread ID required" }, 400);
    await patchDiscordThread(threadId, { archived: true }, env);
    return jsonResponse({ success: true, message: "Thread archived successfully." });
}