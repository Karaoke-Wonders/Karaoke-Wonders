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
      return Response.json({ response: "Server error: Missing Cloudflare AI or Vectorize bindings." }, { status: 500 });
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

    // 3. Extract metadata text from Vectorize matches
    let siteContext = matches?.matches
      ?.map(m => m.metadata?.text)
      ?.filter(Boolean)
      ?.join('\n\n') || '';

    // 4. Web Search Fallback via Tavily (if vector database yields no matching knowledge)
    if (!siteContext && env.TAVILY_API_KEY) {
      try {
        const searchRes = await fetch("https://api.tavily.com/search", {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${env.TAVILY_API_KEY}`
          },
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
        } else {
          console.error("Tavily Search API Error:", await searchRes.text());
        }
      } catch (searchErr) {
        console.error("Tavily Search Exception:", searchErr);
      }
    }

    // 5. Fallback SSE stream if both Vectorize and Tavily yield no context
    if (!siteContext) {
      const fallbackText = "I do not have that specific information in my context base right now.";
      const sseFallback = `data: ${JSON.stringify({ choices: [{ delta: { content: fallbackText } }] })}\n\ndata: [DONE]\n\n`;
      
      return new Response(sseFallback, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        }
      });
    }

    // 6. Request streaming response from GLM-4.7 Flash with context
    const stream = await env.AI.run('@cf/zai-org/glm-4.7-flash', {
      temperature: 0.5,
      stream: true,
      messages: [
        {
          role: 'system',
          content: `You are the official AI assistant for Karaoke Wonders in VRChat (https://karaokewonders.com).

Strict Response Guidelines:
- Answer ONLY using the facts provided in the Context below.
- Do NOT assume, make up, or extrapolate details not mentioned in the Context.
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

    // 7. Return SSE stream directly to frontend
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