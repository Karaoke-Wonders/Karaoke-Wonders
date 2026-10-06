export async function onRequest(context) {
    const { request, env } = context;

    // Ensure KV namespace "KW_STORAGE" is bound in Cloudflare Pages settings
    const kv = env.KW_STORAGE; 

    if (!kv) {
        console.error("[API Error] KW_STORAGE KV binding not found in environment variables.");
        return new Response(JSON.stringify({ error: "KV binding not found" }), { 
            status: 500, 
            headers: { "Content-Type": "application/json" } 
        });
    }

    const headers = {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache, no-store, must-revalidate"
    };

    // GET Request: Fetch current global announcement
    if (request.method === "GET") {
        try {
            const data = await kv.get("main_announcement", "json");
            
            // Fallback to empty announcements object if KV key is null/empty
            const responseData = data || { announcements: [] };

            return new Response(JSON.stringify(responseData), { 
                status: 200, 
                headers 
            });
        } catch (err) {
            console.error("[API Error] Failed to read from KV:", err);
            return new Response(JSON.stringify({ error: "Failed to fetch announcement" }), { 
                status: 500, 
                headers 
            });
        }
    }

    // POST Request: Save or Clear announcement from Admin/KW-Team panel
    if (request.method === "POST") {
        try {
            const body = await request.json();
            
            // Clear flag deletes the key from KV
            if (body.clear) {
                await kv.delete("main_announcement");
                return new Response(JSON.stringify({ 
                    success: true, 
                    message: "Announcement cleared globally" 
                }), { status: 200, headers });
            }

            // Save new announcement object or { announcements: [...] } structure
            await kv.put("main_announcement", JSON.stringify(body));
            
            return new Response(JSON.stringify({ 
                success: true, 
                message: "Announcement published globally" 
            }), { status: 200, headers });

        } catch (err) {
            console.error("[API Error] Invalid payload or KV write failure:", err);
            return new Response(JSON.stringify({ error: "Invalid request body" }), { 
                status: 400, 
                headers 
            });
        }
    }

    return new Response("Method not allowed", { status: 405 });
}