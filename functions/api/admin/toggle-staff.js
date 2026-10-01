import { authorizeAdminRequest, updateThreadTag } from '../../_middleware/utils.js';

export async function onRequestPost({ request, env }) {
    const authorization = await authorizeAdminRequest(request, env, true);
    if (authorization instanceof Response) return authorization;

    const body = await request.json();
    const { threadId, add } = body;
    const actionLabel = add ? "Promoted to Staff" : "Removed from Staff";
    
    return await updateThreadTag(threadId, env.DISCORD_TAG_STAFF, add, env, authorization.username, actionLabel);
}