import { authorizeAdminRequest, patchDiscordThread, jsonResponse } from '../_middleware/utils.js';

export async function onRequestPost({ request, env }) {
    const authorization = await authorizeAdminRequest(request, env);
    if (authorization instanceof Response) return authorization;

    const { threadId } = await request.json();
    console.log(`[handleArchiveSession] Archiving threadId: ${threadId}`);
    if (typeof threadId !== 'string' || !/^\d{17,20}$/.test(threadId)) return jsonResponse({ error: "Invalid thread ID." }, 400);
    const response = await patchDiscordThread(threadId, { archived: true }, env);
    if (!response.ok) return jsonResponse({ error: 'Discord rejected the archive request.' }, 502);
    return jsonResponse({ success: true, message: "Thread archived successfully." });
}