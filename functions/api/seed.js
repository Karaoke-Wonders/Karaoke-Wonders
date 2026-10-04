// functions/api/seed.js
export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);

  // Simple protection so random visitors can't re-seed your database
  if (url.searchParams.get('key') !== 'customseed') {
    return new Response('Unauthorized', { status: 401 });
  }

  // 1. Your public website & VRChat world knowledge
  const publicContent = [
    {
      id: 'doc-home',
      text: 'Welcome to Karaoke Wonders in VRChat. We host weekly live karaoke events, community meetups, and open mic nights.'
    },
    {
      id: 'doc-about',
      text: 'Karaoke Wonders is a VRChat venue created for singers and performers. Rules include treating everyone with respect and waiting your turn in line.'
    },
    {
      id: 'doc-careers',
      text: 'Karaoke Wonders offers community roles such as Event Host, Stage DJ, and World Moderator. Apply on the careers page.'
    },
    {
      id: 'doc-main',
      text: 'The main VRChat world features dynamic lighting, song queue systems, and custom audio mixing tools for performers.'
    }
  ];

  // 2. Generate embeddings using Workers AI on Cloudflare's servers
  const vectors = [];
  for (const item of publicContent) {
    const embedding = await env.AI.run('@cf/baai/bge-small-en-v1.5', { text: [item.text] });
    
    vectors.push({
      id: item.id,
      values: embedding.data[0],
      metadata: { text: item.text }
    });
  }

  // 3. Upsert into your Vectorize index
  await env.VECTORIZE_INDEX.upsert(vectors);

  return new Response(JSON.stringify({ success: true, count: vectors.length }), {
    headers: { 'Content-Type': 'application/json' }
  });
}