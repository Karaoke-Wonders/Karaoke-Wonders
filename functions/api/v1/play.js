import { getRequestIp } from '../../_middleware/utils.js';

export async function onRequestGet({ request, env }) {
    const url = new URL(request.url);
    const slot = url.searchParams.get('slot');

    if (slot === null) {
        return new Response('Missing slot parameter', { status: 400 });
    }

    if (!env.KARAOKE_KV) {
        return new Response('KV binding missing', { status: 500 });
    }

    // Match the exact same instance isolation scope when USharpVideo requests playback
    const instanceId = getRequestIp(request) || 'global';
    const kvKey = `inst_${instanceId}_slot_${slot}`;

    const slotData = await env.KARAOKE_KV.get(kvKey);
    if (!slotData) {
        return new Response('No song currently assigned to this slot for this instance', { status: 404 });
    }

    const { videoId } = JSON.parse(slotData);
    return Response.redirect(`https://www.youtube.com/watch?v=${videoId}`, 302);
}