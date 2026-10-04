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
    url: 'https://karaokewonders.com',
    text: 'Welcome to Karaoke Wonders in VRChat (https://karaokewonders.com). We host weekly live karaoke events, community meetups, and open mic nights every Friday and Saturday.'
  },
  {
    id: 'doc-about',
    url: 'https://karaokewonders.com/about',
    text: 'Karaoke Wonders is a VRChat venue created for singers and performers. Rules include treating everyone with respect, waiting your turn in line, and keeping song requests appropriate.'
  },
  {
    id: 'doc-careers',
    url: 'https://karaokewonders.com/careers',
    text: 'Karaoke Wonders offers community staff roles such as Event Host, Stage DJ, and World Moderator. Apply directly on our careers page at https://karaokewonders.com/careers.'
  },
  {
    id: 'doc-main',
    url: 'https://karaokewonders.com/main',
    text: 'This is the main page of Karaoke Wonders, where you can request songs to be approved by moderators, view songs that have been approved, and more.'
  },
  {
    id: 'doc-inbox',
    url: 'https://karaokewonders.com/inbox',
    text: 'This is where you can view your song requests, check their approval status, and other information about your account.'
  },
  {
    id: 'doc-settings',
    url: 'https://karaokewonders.com/settings',
    text: 'This is where you can change your account details, check account status, and more.'
  },
  {
    id: 'doc-world',
    url: 'https://vrchat.com/home/world/wrld_916c8605-94c1-4271-ac07-dddf5403c793',
    text: 'This is our VRChat world where you can sing and hangout with players around VRChat.'
  },
  {
    id: 'doc-group',
    url: 'https://vrchat.com/home/group/grp_67cc6d58-8e66-44a5-af92-f53d31f5a694',
    text: 'This is the official group for karaoke wonders. KAWON is the ID for Karaoke Wonders Group.'
  },
  {
    id: 'doc-staff group',
    url: 'https://vrchat.com/home/group/grp_636e6717-e0b4-4e38-b881-3e49a796f5be',
    text: 'This is the official staff group for karaoke wonders. KWCARE is the ID for KW Caretakers group.'
  },
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