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

    // 2. Query Vectorize index (topK = 3)
    const matches = await env.VECTORIZE_INDEX.query(userEmbedding.data[0], {
      topK: 3,
      returnMetadata: 'all'
    });

    // 3. Extract metadata text
    let siteContext = matches?.matches
      ?.map(m => m.metadata?.text)
      ?.filter(Boolean)
      ?.join('\n\n') || '';

    // 4. Web Search Fallback (If vector database has no matching knowledge)
    if (!siteContext && env.TAVILY_API_KEY) {
      try {
        const searchRes = await fetch("https://api.tavily.com/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            api_key: env.TAVILY_API_KEY,
            query: prompt,
            search_depth: "basic",
            max_results: 3
          })
        });

        if (searchRes.ok) {
          const searchData = await searchRes.json();
          siteContext = searchData.results
            ?.map(r => `Title: ${r.title}\nURL: ${r.url}\nContent: ${r.content}`)
            .join('\n\n') || '';
        }
      } catch (searchErr) {
        console.error("Web Search Error:", searchErr);
      }
    }

    // Fallback response if both Vectorize and Web Search yield no context
    if (!siteContext) {
      return Response.json({
        response: "I do not have information regarding that in my database right now."
      });
    }

    // 5. Request streaming response from GLM-4.7 Flash
    const stream = await env.AI.run('@cf/zai-org/glm-4.7-flash', {
      temperature: 0.5,
      stream: true,
      messages: [
        {
          role: 'system',
          content: `You are the official AI assistant for Karaoke Wonders in VRChat (https://karaokewonders.com).

Strict Response Guidelines:
- Answer using the facts provided in the Context.
- Don't assume any facts if you don't know them. If you have an idea of some facts, you can tell them.
- If the question cannot be answered directly using the Context, state: "I do not have that specific information right now."

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

    // 6. Return Server-Sent Events (SSE) response stream
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });

  } catch (err) {
    console.error("Chat Error:", err.stack || err.message);
    return Response.json(
      { response: `Server Error: ${err.message || "An unexpected error occurred."}` },
      { status: 500 }
    );
  }
}