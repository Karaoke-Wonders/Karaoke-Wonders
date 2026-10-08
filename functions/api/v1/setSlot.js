import { jsonResponse } from '../../_middleware/utils.js';

export async function onRequestGet({ request, env }) {
    const url = new URL(request.url);
    const slot = url.searchParams.get('slot');
    const videoId = url.searchParams.get('videoId');

    if (!slot || !videoId) {
        return jsonResponse({ error: 'Missing slot or videoId' }, 400);
    }

    // Save mapping into KV (auto-expires after 6 hours)
    await env.KARAOKE_KV.put(`slot_${slot}`, JSON.stringify({ videoId }), {
        expirationTtl: 21600
    });

    return jsonResponse({ success: true, slot, videoId });
}