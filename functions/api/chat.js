// functions/api/chat.js
export async function onRequestPost(context) {
  const { env, request } = context;
  const { prompt } = await request.json();

  // 1. Convert user's question into a vector
  const userEmbedding = await env.AI.run('@cf/baai/bge-small-en-v1.5', { text: [prompt] });

  // 2. Query Vectorize for top matching site knowledge
  const matches = await env.VECTORIZE_INDEX.query(userEmbedding.data[0], { topK: 3 });
  
  const siteContext = matches.matches
    .map(m => m.vector.metadata.text)
    .join('\n\n');

  // 3. Generate response constrained to site context
  const aiResponse = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
    messages: [
      {
        role: 'system',
        content: `You are the official assistant for Karaoke Wonders (VRChat). Answer questions using ONLY the provided website context. If the information is not in the context, say "I don't have that information about Karaoke Wonders."

Website Context:
${siteContext}`
      },
      { role: 'user', content: prompt }
    ]
  });

  return new Response(JSON.stringify(aiResponse), {
    headers: { 'Content-Type': 'application/json' }
  });
}