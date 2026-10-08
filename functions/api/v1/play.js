export async function onRequestGet({ request, env }) {
    const url = new URL(request.url);
    const slot = url.searchParams.get('slot');

    if (slot === null) {
        return new Response('Missing slot parameter', { status: 400 });
    }

    const slotData = await env.KARAOKE_KV.get(`slot_${slot}`);
    if (!slotData) {
        return new Response('No song currently assigned to this slot', { status: 404 });
    }

    const { videoId } = JSON.parse(slotData);
    return Response.redirect(`https://www.youtube.com/watch?v=${videoId}`, 302);
}