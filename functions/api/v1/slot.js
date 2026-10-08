import { jsonResponse, getRequestIp } from '../../_middleware/utils.js';

export async function onRequestGet({ request, env }) {
    const url = new URL(request.url);
    const slot = url.searchParams.get('slot');
    const videoId = url.searchParams.get('videoId');

    if (!slot || !videoId) {
        return jsonResponse({ error: 'Missing slot or videoId' }, 400);
    }

    const instanceId = getRequestIp(request) || 'global';
    const kvKey = `inst_${instanceId}_slot_${slot}`;

    // Sliding Expiration: Every time a song plays, this resets the 6-hour timer (21600 seconds)
    await env.KARAOKE_KV.put(kvKey, JSON.stringify({ videoId }), {
        expirationTtl: 21600 
    });

    return jsonResponse({ success: true, slot, videoId });
}