export async function onRequestPost(context) {
  try {
    const { env, request } = context;
    const { prompt } = await request.json();

    if (!env.AI) {
      return new Response(JSON.stringify({ response: "Error: AI binding is missing." }), { status: 500 });
    }
    if (!env.VECTORIZE_INDEX) {
      return new Response(JSON.stringify({ response: "Error: VECTORIZE_INDEX binding is missing." }), { status: 500 });
    }

    // 1. Embed user query
    const userEmbedding = await env.AI.run('@cf/baai/bge-small-en-v1.5', { text: [prompt] });

    // 2. Query Vectorize index
    const matches = await env.VECTORIZE_INDEX.query(userEmbedding.data[0], { topK: 3 });
    const siteContext = matches.matches.map(m => m.vector.metadata?.text || '').join('\n\n');

    // 3. Generate response with active model @cf/meta/llama-3.1-8b-instruct
    const aiResponse = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        {
          role: 'system',
          content: `You are the official assistant for Karaoke Wonders (VRChat). Answer using strictly this context:\n${siteContext}`
        },
        { role: 'user', content: prompt }
      ]
    });

    return new Response(JSON.stringify(aiResponse), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ response: `Server Error: ${err.message}` }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}