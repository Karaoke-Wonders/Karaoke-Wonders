export async function onRequestPost(context) {
  try {
    const { env, request } = context;

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

    if (!env.AI || !env.VECTORIZE_INDEX) {
      return Response.json({ response: "Server error: Missing bindings." }, { status: 500 });
    }

    // 1. Generate query embedding vector
    const userEmbedding = await env.AI.run('@cf/baai/bge-small-en-v1.5', { text: [prompt] });
    
    if (!userEmbedding?.data?.[0]) {
      throw new Error("Failed to generate embedding vector.");
    }

    // 2. Query Vectorize
    const matches = await env.VECTORIZE_INDEX.query(userEmbedding.data[0], {
      topK: 5,
      returnMetadata: 'all'
    });

    // FIX: Access m.metadata directly (m.vector is undefined on query matches)
    const siteContext = matches?.matches
      ?.map(m => m.metadata?.text)
      ?.filter(Boolean)
      ?.join('\n\n') || '';

    console.log("Retrieved siteContext:", siteContext);

    // Fallback if no context text was retrieved
    if (!siteContext) {
      return Response.json({
        response: "I do not have information regarding that in my database right now."
      });
    }

    // 3. Query Llama 3.1 8B Instruct with temperature set to 0.0
    const aiResponse = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      temperature: 0.0,
      messages: [
        {
          role: 'system',
          content: `You are the official AI assistant for Karaoke Wonders in VRChat (https://karaokewonders.com).

Strict Response Guidelines:
- Answer ONLY using the facts provided in the Context below.
- Do NOT assume, make up, or extrapolate any roles, teams, names, or features not mentioned in the Context.
- If the question cannot be answered directly using the Context, state: "I do not have that specific information in my context right now."

Context:
${siteContext}

Formatting rules:
- Format responses using clean standard Markdown.
- Use separate paragraphs and bullet points for lists.
- Format URLs as clickable links: [Text](URL).`
        },
        { role: 'user', content: prompt }
      ]
    });

    return Response.json(aiResponse);

  } catch (err) {
    console.error("Chat Error:", err.stack || err.message);
    return Response.json(
      { response: `Server Error: ${err.message || "An unexpected error occurred."}` },
      { status: 500 }
    );
  }
}