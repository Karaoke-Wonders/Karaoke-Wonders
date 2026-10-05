export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);

    // Ensure you have bound your KV namespace as "KW_STORAGE" in Cloudflare Pages settings
    const kv = env.KW_STORAGE; 

    if (!kv) {
        return new Response(JSON.stringify({ error: "KV binding not found" }), { 
            status: 500, 
            headers: { "Content-Type": "application/json" } 
        });
    }

    // GET request: Fetch the current announcement for all users on the main page
    if (request.method === "GET") {
        const data = await kv.get("main_announcement", "json");
        return new Response(JSON.stringify(data || {}), {
            headers: { "Content-Type": "application/json" }
        });
    }

    // POST request: Save or Clear the announcement from the Admin Panel
    if (request.method === "POST") {
        try {
            const body = await request.json();
            
            // If body is empty or action is clear, delete the record
            if (body.clear) {
                await kv.delete("main_announcement");
                return new Response(JSON.stringify({ success: true, message: "Announcement cleared globally" }), {
                    headers: { "Content-Type": "application/json" }
                });
            }

            // Otherwise, save the new announcement data globally
            await kv.put("main_announcement", JSON.stringify(body));
            return new Response(JSON.stringify({ success: true, message: "Announcement published globally" }), {
                headers: { "Content-Type": "application/json" }
            });
        } catch (err) {
            return new Response(JSON.stringify({ error: "Invalid request body" }), { 
                status: 400, 
                headers: { "Content-Type": "application/json" } 
            });
        }
    }

    return new Response("Method not allowed", { status: 405 });
}