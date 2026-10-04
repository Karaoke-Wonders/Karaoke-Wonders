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
      return Response.json(
        { error: "Missing env.AI or env.VECTORIZE_INDEX bindings." }, 
        { status: 500 }
      );
    }

    if (!Array.isArray(publicContent) || publicContent.length === 0) {
      return Response.json(
        { error: "context.json is empty or not formatted as an array." }, 
        { status: 400 }
      );
    }

    // 1. Generate embeddings concurrently from context.json
    const vectors = await Promise.all(
      publicContent.map(async (item) => {
        if (!item.id || !item.text) {
          throw new Error(`Invalid context entry: missing 'id' or 'text'.`);
        }

        const embedding = await env.AI.run('@cf/baai/bge-small-en-v1.5', { 
          text: [item.text] 
        });

        if (!embedding?.data?.[0]) {
          throw new Error(`Failed to generate embedding for ID: ${item.id}`);
        }

        return {
          id: String(item.id),
          values: embedding.data[0],
          metadata: { 
            text: item.text, 
            url: item.url || 'https://karaokewonders.com' 
          }
        };
      })
    );

    // 2. Upsert into Vectorize index
    await env.VECTORIZE_INDEX.upsert(vectors);

    return Response.json({ 
      success: true, 
      count: vectors.length 
    });

  } catch (err) {
    console.error("Seeding Error:", err.stack || err.message);
    return Response.json(
      { error: `Seeding Error: ${err.message}` }, 
      { status: 500 }
    );
  }
}