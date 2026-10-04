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

    // 1. Generate query embedding
    const userEmbedding = await env.AI.run('@cf/baai/bge-small-en-v1.5', { text: [prompt] });

    // 2. Query Vectorize
    const matches = await env.VECTORIZE_INDEX.query(userEmbedding.data[0], { topK: 3 });
    const siteContext = matches.matches.map(m => m.vector.metadata?.text || '').join('\n\n');

    // 3. Generate response using @cf/meta/llama-3.2-1b-instruct with Markdown rules
    const aiResponse = await env.AI.run('@cf/meta/llama-3.2-1b-instruct', {
      messages: [
        {
          role: 'system',
          content: `You are the official assistant for Karaoke Wonders (VRChat). Answer strictly using this context:\n${siteContext}\n\nFormatting rules:\n- Format responses using clean standard Markdown.\n- Use separate paragraphs for readability.\n- Use bulleted or numbered lists when giving options or steps.\n- Format links as clickable Markdown: [Link Text](https://example.com). All the pu`
        },
        { role: 'user', content: prompt }
      ]
    });

    return Response.json(aiResponse);

  } catch (err) {
    return new Response(JSON.stringify({ response: `Server Error: ${err.message}` }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}