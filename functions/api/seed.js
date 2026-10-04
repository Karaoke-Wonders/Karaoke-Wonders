// functions/api/seed.js
import publicContent from '../../files/context.json';

export async function onRequestGet(context) {
  try {
    const { env, request } = context;
    const url = new URL(request.url);

    // Protection key check
    if (url.searchParams.get('key') !== 'customseed') {
      return new Response('Unauthorized', { status: 401 });
    }

    if (!env.AI || !env.VECTORIZE_INDEX) {
      return new Response(JSON.stringify({ error: "Missing AI or VECTORIZE_INDEX bindings." }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 1. Generate embeddings concurrently from context.json
    const vectors = await Promise.all(
      publicContent.map(async (item) => {
        const embedding = await env.AI.run('@cf/baai/bge-small-en-v1.5', { text: [item.text] });
        return {
          id: item.id,
          values: embedding.data[0],
          metadata: { text: item.text, url: item.url }
        };
      })
    );

    // 2. Upsert into Vectorize index
    await env.VECTORIZE_INDEX.upsert(vectors);

    return Response.json({ success: true, count: vectors.length });

  } catch (err) {
    return new Response(JSON.stringify({ error: `Seeding Error: ${err.message}` }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}