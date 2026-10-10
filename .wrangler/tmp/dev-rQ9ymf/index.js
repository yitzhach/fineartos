var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/share/viewLink.ts
var SHARE_DAYS = 90;
var MAX_PICTURE_BYTES = 8 * 1024 * 1024;
var MAX_TITLE = 200;
var MAX_DETAILS = 4e3;
var PICTURE_TYPES = ["image/jpeg", "image/png", "image/webp"];
var ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;
function newShareId(randomBytes) {
  const bytes = randomBytes(16);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
__name(newShareId, "newShareId");
function isShareId(value) {
  return ID_PATTERN.test(value);
}
__name(isShareId, "isShareId");
function readCardInput(title, details) {
  if (typeof title !== "string" || typeof details !== "string") return null;
  const t = title.trim();
  const d = details.trim();
  if (!t || t.length > MAX_TITLE || d.length > MAX_DETAILS) return null;
  return { title: t, details: d };
}
__name(readCardInput, "readCardInput");
function expiresAt(now, days = SHARE_DAYS) {
  return new Date(now.getTime() + days * 864e5).toISOString();
}
__name(expiresAt, "expiresAt");
function isExpired(card, now) {
  const end = Date.parse(card.expiresAt);
  return !Number.isFinite(end) || end <= now.getTime();
}
__name(isExpired, "isExpired");
function isPicture(type, b) {
  if (type === "image/png") return b[0] === 137 && b[1] === 80 && b[2] === 78 && b[3] === 71;
  if (type === "image/jpeg") return b[0] === 255 && b[1] === 216;
  if (type === "image/webp")
    return b[0] === 82 && b[1] === 73 && b[2] === 70 && b[3] === 70 && b[8] === 87 && b[9] === 69 && b[10] === 66 && b[11] === 80;
  return false;
}
__name(isPicture, "isPicture");
function linkEndDate(iso, locale) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "an unknown date";
  return date.toLocaleDateString(locale ?? "en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}
__name(linkEndDate, "linkEndDate");
var escapeHtml = /* @__PURE__ */ __name((value) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c), "escapeHtml");
var STYLE = `
:root{--bg:#f4efe6;--ink:#2b2622;--muted:#6d645b;--card:#fffdf9;--line:#e2d9cb}
@media (prefers-color-scheme:dark){:root{--bg:#1d1a17;--ink:#efe8dd;--muted:#a99f93;--card:#27231f;--line:#3a342e}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif}
main{max-width:880px;margin:0 auto;padding:24px 16px 48px}
h1{font:600 1.6rem/1.25 Georgia,"Times New Roman",serif;margin:0 0 16px}
figure{margin:0 0 20px}
img{display:block;max-width:100%;max-height:78vh;margin:0 auto;border-radius:6px;box-shadow:0 2px 18px rgba(0,0,0,.18)}
.details{white-space:pre-wrap;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:16px;margin:0 0 16px;font:inherit}
.foot{color:var(--muted);font-size:.875rem;margin:0}
`;
function page(title, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer"><title>${escapeHtml(title)}</title><style>${STYLE}</style></head><body><main>${body}</main></body></html>`;
}
__name(page, "page");
function renderSharePage(card, id) {
  const details = card.details ? `<pre class="details">${escapeHtml(card.details)}</pre>` : "";
  return page(
    card.title,
    `<h1>${escapeHtml(card.title)}</h1><figure><img src="/p/${encodeURIComponent(id)}/picture" alt="${escapeHtml(card.title)}"></figure>${details}<p class="foot">Shared with you privately. This link stops working on ${escapeHtml(linkEndDate(card.expiresAt))}.</p>`
  );
}
__name(renderSharePage, "renderSharePage");
function renderGonePage() {
  return page(
    "Link no longer available",
    `<h1>This link is no longer available</h1><p>It may have expired or been removed by the artist. Ask them to send it again.</p>`
  );
}
__name(renderGonePage, "renderGonePage");

// worker/share.ts
var realClock = {
  now: /* @__PURE__ */ __name(() => /* @__PURE__ */ new Date(), "now"),
  randomBytes: /* @__PURE__ */ __name((n) => crypto.getRandomValues(new Uint8Array(n)), "randomBytes")
};
var json = /* @__PURE__ */ __name((v, status = 200) => Response.json(v, { status, headers: { "Cache-Control": "no-store" } }), "json");
var problem = /* @__PURE__ */ __name((status, message) => json({ error: { message } }, status), "problem");
var html = /* @__PURE__ */ __name((body, status) => new Response(body, {
  status,
  headers: {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow"
  }
}), "html");
var pictureKey = /* @__PURE__ */ __name((id) => `shares/${id}/picture`, "pictureKey");
var cardKey = /* @__PURE__ */ __name((id) => `shares/${id}/card.json`, "cardKey");
var ownerPrefix = /* @__PURE__ */ __name((owner) => `owners/${encodeURIComponent(owner)}/`, "ownerPrefix");
function isSharePath(pathname) {
  return pathname.startsWith("/share/") || pathname.startsWith("/p/");
}
__name(isSharePath, "isSharePath");
async function studioOwner(request, api) {
  const cookie = request.headers.get("Cookie");
  if (!cookie) return null;
  try {
    const res = await api.fetch(new Request(new URL("/v1/me", request.url), { headers: { Cookie: cookie } }));
    if (!res.ok) return null;
    const body = await res.json();
    const user = body?.data?.user ?? body?.user;
    const who = user?.id ?? user?.email;
    return typeof who === "string" && who ? who : null;
  } catch {
    return null;
  }
}
__name(studioOwner, "studioOwner");
async function readCard(bucket, id) {
  const stored = await bucket.get(cardKey(id));
  if (!stored) return null;
  try {
    return JSON.parse(await stored.text());
  } catch {
    return null;
  }
}
__name(readCard, "readCard");
async function handleShare(request, env, clock = realClock) {
  const url = new URL(request.url);
  const path = url.pathname;
  const bucket = env.SHARES;
  if (path === "/share/status") return json({ available: Boolean(bucket && env.API) });
  const view = path.match(/^\/p\/([^/]+)(\/picture)?\/?$/);
  if (view) {
    if (request.method !== "GET" && request.method !== "HEAD") return problem(405, "Method not allowed.");
    const [, id2 = "", picture] = view;
    if (!bucket || !isShareId(id2)) return picture ? new Response(null, { status: 404 }) : html(renderGonePage(), 404);
    const card = await readCard(bucket, id2);
    if (!card || isExpired(card, clock.now())) return picture ? new Response(null, { status: 404 }) : html(renderGonePage(), 404);
    if (!picture) return html(renderSharePage(card, id2), 200);
    const stored = await bucket.get(pictureKey(id2));
    if (!stored) return new Response(null, { status: 404 });
    return new Response(stored.body, {
      headers: {
        "Content-Type": card.type,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'"
      }
    });
  }
  if (!bucket || !env.API) return problem(503, "Viewing links aren\u2019t switched on for this copy of Artist OS.");
  const item = path.match(/^\/share\/pictures(?:\/([^/]+))?\/?$/);
  if (!item) return problem(404, "Not found.");
  const [, id] = item;
  const owner = await studioOwner(request, env.API);
  if (!owner) return problem(401, "Sign in to your studio to make a viewing link.");
  if (request.method === "POST" && !id) {
    let form;
    try {
      form = await request.formData();
    } catch {
      return problem(400, "The upload could not be read.");
    }
    const card = readCardInput(form.get("title"), form.get("details"));
    if (!card) return problem(400, "The picture needs a title, and the details must be under 4,000 characters.");
    const picture = form.get("picture");
    if (!picture || typeof picture === "string") return problem(400, "No picture came with the upload.");
    const type = picture.type;
    if (!PICTURE_TYPES.includes(type)) return problem(415, "Only JPEG, PNG or WebP pictures can be shared.");
    if (picture.size > MAX_PICTURE_BYTES) return problem(413, "The picture is over 8 MB.");
    const bytes = await picture.arrayBuffer();
    if (!isPicture(type, new Uint8Array(bytes))) return problem(400, "That file isn\u2019t the picture it claims to be.");
    const newId = newShareId(clock.randomBytes);
    const now = clock.now();
    const stored = { ...card, type, owner, createdAt: now.toISOString(), expiresAt: expiresAt(now) };
    try {
      await bucket.put(pictureKey(newId), bytes, { httpMetadata: { contentType: type } });
      await bucket.put(cardKey(newId), JSON.stringify(stored), { httpMetadata: { contentType: "application/json" } });
      await bucket.put(ownerPrefix(owner) + newId, "");
    } catch {
      return problem(502, "The picture could not be stored just now. Nothing was shared.");
    }
    return json({ data: { id: newId, url: new URL(`/p/${newId}`, request.url).href, expiresAt: stored.expiresAt } }, 201);
  }
  if (request.method === "GET" && !id) {
    const prefix2 = ownerPrefix(owner);
    const ids = [];
    let cursor;
    do {
      const page2 = await bucket.list({ prefix: prefix2, cursor });
      for (const object of page2.objects) ids.push(object.key.slice(prefix2.length));
      cursor = page2.truncated ? page2.cursor : void 0;
    } while (cursor);
    const now = clock.now();
    const links = [];
    for (const linkId of ids) {
      const card = isShareId(linkId) ? await readCard(bucket, linkId) : null;
      if (!card) continue;
      links.push({
        id: linkId,
        url: new URL(`/p/${linkId}`, request.url).href,
        title: card.title,
        createdAt: card.createdAt,
        expiresAt: card.expiresAt,
        expired: isExpired(card, now)
      });
    }
    links.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return json({ data: links });
  }
  if (request.method === "DELETE" && id) {
    if (!isShareId(id)) return problem(404, "That link doesn\u2019t exist.");
    const card = await readCard(bucket, id);
    if (!card) return problem(404, "That link doesn\u2019t exist, or was already removed.");
    if (card.owner !== owner) return problem(403, "Only the studio that made this link can remove it.");
    try {
      await bucket.delete([pictureKey(id), cardKey(id), ownerPrefix(owner) + id]);
    } catch {
      return problem(502, "The link could not be removed just now. It still works.");
    }
    return json({ data: { removed: id } });
  }
  return problem(405, "Method not allowed.");
}
__name(handleShare, "handleShare");

// worker/index.ts
var json2 = /* @__PURE__ */ __name((v, status = 200) => Response.json(v, { status, headers: { "Cache-Control": "no-store" } }), "json");
async function forward(request, target, what) {
  const down = /* @__PURE__ */ __name((message) => Response.json({ error: { code: "unavailable", message } }, { status: 503, headers: { "Cache-Control": "no-store" } }), "down");
  if (!target) return down(`The ${what} isn't connected to this copy of Artist OS.`);
  try {
    return await target.fetch(request);
  } catch {
    return down(`The ${what} can't be reached just now.`);
  }
}
__name(forward, "forward");
var worker_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/v1/")) return forward(request, env.API, "studio");
    if (url.pathname === "/assistant/status") return Response.json({ available: Boolean(env.ASSISTANT && env.API) }, { headers: { "Cache-Control": "no-store" } });
    if (url.pathname.startsWith("/assistant/")) return forward(request, env.ASSISTANT, "assistant");
    if (isSharePath(url.pathname)) return handleShare(request, env);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY)
      return json2({ error: "Cloud sync unavailable" }, 503);
    const auth = request.headers.get("Authorization");
    if (!auth?.startsWith("Bearer "))
      return json2({ error: "Authentication required" }, 401);
    const headers = {
      Authorization: auth,
      apikey: env.SUPABASE_ANON_KEY,
      "Content-Type": "application/json"
    };
    const user = await fetch(env.SUPABASE_URL + "/auth/v1/user", { headers });
    if (!user.ok) return json2({ error: "Invalid session" }, 401);
    const match = url.pathname.match(
      /^\/api\/workspaces\/([0-9a-f-]{36})\/(documents|images)(?:\/([a-zA-Z0-9-]+))?$/
    );
    if (!match) return json2({ error: "Not found" }, 404);
    const [, workspace, resource, id] = match;
    const member = await fetch(
      env.SUPABASE_URL + "/rest/v1/workspace_members?workspace_id=eq." + workspace + "&select=user_id",
      { headers }
    );
    if (!member.ok || !(await member.json()).length)
      return json2({ error: "Workspace access denied" }, 403);
    if (resource === "images") {
      if (!env.IMAGES) return json2({ error: "Image storage unavailable" }, 503);
      if (!id) return json2({ error: "Image ID required" }, 400);
      const key = workspace + "/" + id;
      if (request.method === "GET") {
        const image = await env.IMAGES.get(key);
        return image ? new Response(image.body, {
          headers: {
            "Content-Type": image.httpMetadata?.contentType || "application/octet-stream",
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff"
          }
        }) : json2({ error: "Not found" }, 404);
      }
      if (request.method === "PUT") {
        const type = request.headers.get("Content-Type") || "";
        if (!["image/png", "image/jpeg", "image/webp"].includes(type))
          return json2({ error: "Unsupported image" }, 415);
        const bytes = await request.arrayBuffer();
        if (bytes.byteLength > 8 * 1024 * 1024)
          return json2({ error: "Image exceeds 8 MB" }, 413);
        const b = new Uint8Array(bytes);
        const valid = type === "image/png" ? b[0] === 137 && b[1] === 80 && b[2] === 78 && b[3] === 71 : type === "image/jpeg" ? b[0] === 255 && b[1] === 216 : b[0] === 82 && b[1] === 73 && b[2] === 70 && b[3] === 70 && b[8] === 87 && b[9] === 69 && b[10] === 66 && b[11] === 80;
        if (!valid) return json2({ error: "Invalid image bytes" }, 400);
        await env.IMAGES.put(key, bytes, {
          httpMetadata: { contentType: type }
        });
        return json2({ id });
      }
      return json2({ error: "Method not allowed" }, 405);
    }
    if (request.method === "GET") {
      const res = await fetch(
        env.SUPABASE_URL + "/rest/v1/commission_documents?workspace_id=eq." + workspace + "&select=*" + (id ? "&id=eq." + id : ""),
        { headers }
      );
      return new Response(res.body, {
        status: res.status,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store"
        }
      });
    }
    if (request.method === "PUT" && id) {
      try {
        const input = await request.json();
        if (!Number.isInteger(input.expected_revision) || input.expected_revision < 0 || typeof input.operation_id !== "string" || !input.document || JSON.stringify(input.document).length > 2e6)
          return json2({ error: "Invalid write" }, 400);
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
              p_document: input.document
            })
          }
        );
        if (!res.ok)
          return json2({ error: "Write failed; retain local copy" }, res.status);
        const result = await res.json();
        return json2(result, result.conflict ? 409 : 200);
      } catch {
        return json2({ error: "Invalid document request" }, 400);
      }
    }
    return json2({ error: "Method not allowed" }, 405);
  }
};

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// wrangler-config:config:middleware/patch-console-prefix
var prefix = "[undefined]";

// node_modules/wrangler/templates/middleware/middleware-patch-console-prefix.ts
["log", "debug", "info"].forEach((method) => {
  globalThis.console[method] = new Proxy(globalThis.console[method], {
    apply(target, thisArg, argumentsList) {
      return target.apply(thisArg, [prefix, ...argumentsList]);
    }
  });
});
var passthrough = /* @__PURE__ */ __name((request, env, _ctx, middlewareCtx) => {
  return middlewareCtx.next(request, env);
}, "passthrough");
var middleware_patch_console_prefix_default = passthrough;

// .wrangler/tmp/bundle-rnrqmh/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default,
  middleware_patch_console_prefix_default
];
var middleware_insertion_facade_default = worker_default;

// node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-rnrqmh/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
