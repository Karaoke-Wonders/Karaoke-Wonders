import { updateThreadTag } from '../../_middleware/utils.js';

export async function onRequestPost({ request, env }) {
    const body = await request.json();
    const { threadId, add, staffName } = body;
    const actionLabel = add ? "Promoted to Staff" : "Removed from Staff";
    
    return await updateThreadTag(threadId, env.DISCORD_TAG_STAFF, add, env, staffName, actionLabel);
}