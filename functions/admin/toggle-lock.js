import { updateThreadTag } from '../_utils.js';

export async function onRequestPost({ request, env }) {
    const body = await request.json();
    const { threadId, tagId, add, staffName } = body;
    const targetTag = tagId || env.DISCORD_TAG_BLACKLISTED;
    const actionLabel = targetTag === env.DISCORD_TAG_BLACKLISTED
        ? (add ? "Blacklisted User" : "Un-blacklisted User")
        : (add ? "Restricted User" : "Un-restricted User");
    
    return await updateThreadTag(threadId, targetTag, add, env, staffName, actionLabel);
}