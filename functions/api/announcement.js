export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);

    console.log(`[API Request] Method: ${request.method}, URL: ${request.url}`);

    // Ensure you have bound your KV namespace as "KW_STORAGE" in Cloudflare Pages settings
    const kv = env.KW_STORAGE; 

    if (!kv) {
        console.error("[API Error] KW_STORAGE KV binding not found in environment variables.");
        return new Response(JSON.stringify({ error: "KV binding not found" }), { 
            status: 500, 
            headers: { "Content-Type": "application/json" } 
        });
    }

    // GET request: Fetch the current announcement for all users on the main page
    if (request.method === "GET") {
        console.log("[API GET] Fetching 'main_announcement' from KV...");
        const data = await kv.get("main_announcement", "json");
        console.log("[API GET] Retrieved data:", JSON.stringify(data));
        
        return new Response(JSON.stringify(data || {}), {
            headers: { "Content-Type": "application/json" }
        });
    }

    // POST request: Save or Clear the announcement from the Admin Panel
    if (request.method === "POST") {
        try {
            const body = await request.json();
            console.log("[API POST] Parsed request body:", JSON.stringify(body));
            
            // If body is empty or action is clear, delete the record
            if (body.clear) {
                console.log("[API POST] Clearing 'main_announcement' from KV...");
                await kv.delete("main_announcement");
                console.log("[API POST] Successfully cleared announcement.");
                
                return new Response(JSON.stringify({ success: true, message: "Announcement cleared globally" }), {
                    headers: { "Content-Type": "application/json" }
                });
            }

            // Otherwise, save the new announcement data globally
            console.log("[API POST] Saving 'main_announcement' to KV...");
            await kv.put("main_announcement", JSON.stringify(body));
            console.log("[API POST] Successfully published announcement.");
            
            return new Response(JSON.stringify({ success: true, message: "Announcement published globally" }), {
                headers: { "Content-Type": "application/json" }
            });
        } catch (err) {
            console.error("[API Error] Failed to parse request body or save to KV:", err);
            return new Response(JSON.stringify({ error: "Invalid request body" }), { 
                status: 400, 
                headers: { "Content-Type": "application/json" } 
            });
        }
    }

    console.warn(`[API Warning] Method not allowed: ${request.method}`);
    return new Response("Method not allowed", { status: 405 });
}