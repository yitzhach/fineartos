interface Env {
  ASSETS: { fetch(r: Request): Promise<Response> };
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  IMAGES?: {
    get(
      key: string,
    ): Promise<{
      body: ReadableStream;
      httpMetadata?: { contentType?: string };
    } | null>;
    put(key: string, value: ArrayBuffer, options: unknown): Promise<unknown>;
  };
}
const json = (v: unknown, status = 200) =>
  Response.json(v, { status, headers: { "Cache-Control": "no-store" } });
export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY)
      return json({ error: "Cloud sync unavailable" }, 503);
    const auth = request.headers.get("Authorization");
    if (!auth?.startsWith("Bearer "))
      return json({ error: "Authentication required" }, 401);
    const headers = {
      Authorization: auth,
      apikey: env.SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
    };
    const user = await fetch(env.SUPABASE_URL + "/auth/v1/user", { headers });
    if (!user.ok) return json({ error: "Invalid session" }, 401);
    const match = url.pathname.match(
      /^\/api\/workspaces\/([0-9a-f-]{36})\/(documents|images)(?:\/([a-zA-Z0-9-]+))?$/,
    );
    if (!match) return json({ error: "Not found" }, 404);
    const [, workspace, resource, id] = match;
    // Membership is checked through the caller's JWT and RLS, never a service role.
    const member = await fetch(
      env.SUPABASE_URL +
        "/rest/v1/workspace_members?workspace_id=eq." +
        workspace +
        "&select=user_id",
      { headers },
    );
    if (!member.ok || !((await member.json()) as unknown[]).length)
      return json({ error: "Workspace access denied" }, 403);
    if (resource === "images") {
      if (!env.IMAGES) return json({ error: "Image storage unavailable" }, 503);
      if (!id) return json({ error: "Image ID required" }, 400);
      const key = workspace + "/" + id;
      if (request.method === "GET") {
        const image = await env.IMAGES.get(key);
        return image
          ? new Response(image.body, {
              headers: {
                "Content-Type":
                  image.httpMetadata?.contentType || "application/octet-stream",
                "Cache-Control": "private, no-store",
                "X-Content-Type-Options": "nosniff",
              },
            })
          : json({ error: "Not found" }, 404);
      }
      if (request.method === "PUT") {
        const type = request.headers.get("Content-Type") || "";
        if (!["image/png", "image/jpeg", "image/webp"].includes(type))
          return json({ error: "Unsupported image" }, 415);
        const bytes = await request.arrayBuffer();
        if (bytes.byteLength > 8 * 1024 * 1024)
          return json({ error: "Image exceeds 8 MB" }, 413);
        const b = new Uint8Array(bytes);
        const valid =
          type === "image/png"
            ? b[0] === 137 && b[1] === 80 && b[2] === 78 && b[3] === 71
            : type === "image/jpeg"
              ? b[0] === 255 && b[1] === 216
              : b[0] === 82 &&
                b[1] === 73 &&
                b[2] === 70 &&
                b[3] === 70 &&
                b[8] === 87 &&
                b[9] === 69 &&
                b[10] === 66 &&
                b[11] === 80;
        if (!valid) return json({ error: "Invalid image bytes" }, 400);
        await env.IMAGES.put(key, bytes, {
          httpMetadata: { contentType: type },
        });
        return json({ id });
      }
      return json({ error: "Method not allowed" }, 405);
    }
    if (request.method === "GET") {
      const res = await fetch(
        env.SUPABASE_URL +
          "/rest/v1/commission_documents?workspace_id=eq." +
          workspace +
          "&select=*" +
          (id ? "&id=eq." + id : ""),
        { headers },
      );
      return new Response(res.body, {
        status: res.status,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      });
    }
    if (request.method === "PUT" && id) {
      try {
        const input = (await request.json()) as {
          document: unknown;
          expected_revision: number;
          operation_id: string;
        };
        if (
          !Number.isInteger(input.expected_revision) ||
          input.expected_revision < 0 ||
          typeof input.operation_id !== "string" ||
          !input.document ||
          JSON.stringify(input.document).length > 2000000
        )
          return json({ error: "Invalid write" }, 400);
        const res = await fetch(
          env.SUPABASE_URL + "/rest/v1/rpc/save_commission",
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              p_workspace: workspace,
              p_id: id,
              p_expected: input.expected_revision,
              p_operation: input.operation_id,
              p_document: input.document,
            }),
          },
        );
        if (!res.ok)
          return json({ error: "Write failed; retain local copy" }, res.status);
        const result = await res.json();
        return json(result, result.conflict ? 409 : 200);
      } catch {
        return json({ error: "Invalid document request" }, 400);
      }
    }
    return json({ error: "Method not allowed" }, 405);
  },
};
