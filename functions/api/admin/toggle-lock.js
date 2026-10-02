import { authorizeAdminRequest, updateThreadTag } from '../../_middleware/utils.js';

export async function onRequestPost({ request, env }) {
    const authorization = await authorizeAdminRequest(request, env);
    if (authorization instanceof Response) return authorization;

    const body = await request.json();
    const { threadId, tagId, add } = body;
    const targetTag = tagId || env.DISCORD_TAG_BLACKLISTED;
    if (![env.DISCORD_TAG_BLACKLISTED, env.DISCORD_TAG_RESTRICTED].includes(targetTag)) {
        return jsonResponse({ error: 'This endpoint only supports blacklist and restriction tags.' }, 400);
    }
    const actionLabel = targetTag === env.DISCORD_TAG_BLACKLISTED
        ? (add ? "Blacklisted User" : "Un-blacklisted User")
        : (add ? "Restricted User" : "Un-restricted User");
    
    return await updateThreadTag(threadId, targetTag, add, env, authorization.username, actionLabel, true);
}