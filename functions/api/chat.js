export async function onRequestPost(context) {
  try {
    const { env, request } = context;

    // 1. Safely parse JSON body
    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json({ response: "Invalid JSON request body." }, { status: 400 });
    }

    const prompt = body?.prompt?.trim();
    if (!prompt) {
      return Response.json({ response: "Prompt cannot be empty." }, { status: 400 });
    }

    // 2. Verify Bindings
    if (!env.AI || !env.VECTORIZE_INDEX) {
      console.error("Missing Cloudflare Bindings: AI or VECTORIZE_INDEX missing.");
      return Response.json({ response: "Server configuration error: Missing AI bindings." }, { status: 500 });
    }

    // 3. Generate query embedding safely
    const userEmbedding = await env.AI.run('@cf/baai/bge-small-en-v1.5', { text: [prompt] });
    
    if (!userEmbedding?.data?.[0]) {
      throw new Error("Failed to generate embedding vector from Workers AI.");
    }

    // 4. Query Vectorize
    const matches = await env.VECTORIZE_INDEX.query(userEmbedding.data[0], { topK: 3 });
    const siteContext = matches?.matches?.map(m => m.vector?.metadata?.text || '').filter(Boolean).join('\n\n') || '';

    // 5. Generate response using Llama model
    const aiResponse = await env.AI.run('@cf/meta/llama-3.2-1b-instruct', {
      messages: [
        {
          role: 'system',
          content: `You are the official AI assistant for Karaoke Wonders in VRChat, hosted on the central Information & Support page (https://karaokewonders.com/chat).

Use strictly this site knowledge context to answer questions:
${siteContext}

Formatting rules:
- Format responses using clean standard Markdown.
- Use separate paragraphs for readability.
- Use bulleted or numbered lists when explaining steps, systems, or features.
- Format links as clickable Markdown: [Link Text](https://example.com).`
        },
        { role: 'user', content: prompt }
      ]
    });

    return Response.json(aiResponse);

  } catch (err) {
    // Log full error details to Cloudflare Dashboard Logs
    console.error("Chat API Execution Error:", err.stack || err.message || err);

    return Response.json(
      { response: `Server Error: ${err.message || "An unexpected error occurred."}` },
      { status: 500 }
    );
  }
}