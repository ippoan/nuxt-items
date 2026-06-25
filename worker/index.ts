/**
 * Cloudflare Worker entry。Nuxt/Nitro (cloudflare-module preset) の出力を包んで
 * `/ws/items/{orgId}` だけ ItemsSyncDO に振り分け、それ以外は Nitro に委譲する。
 *
 * ItemsSyncDO は別 worker `nuxt-items-sync` に分離済み (DO migration を含む version は
 * `wrangler versions upload` (no-traffic) では CF が拒否する [error 10211] ため)。
 * ここでは external DO binding (wrangler.toml の `script_name`) 経由で stub を引くだけ。
 * 本体 (app) は migration を持たないので no-traffic release を維持できる。
 */
// @ts-expect-error nuxt build (nitro cloudflare-module) が生成する成果物。
import nitroApp from "../.output/server/index.mjs";

interface NitroHandler {
  fetch(request: Request, env: unknown, ctx: ExecutionContext): Promise<Response>;
}

interface AppEnv {
  /** external DO binding → nuxt-items-sync worker の ItemsSyncDO。 */
  ITEMS_SYNC: DurableObjectNamespace;
}

export default {
  async fetch(
    request: Request,
    env: AppEnv & Record<string, unknown>,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/ws/items/")) {
      const orgId = url.pathname.split("/")[3];
      if (!orgId) return new Response("Bad Request", { status: 400 });
      const id = env.ITEMS_SYNC.idFromName(`items-${orgId}`);
      return env.ITEMS_SYNC.get(id).fetch(request);
    }
    return (nitroApp as NitroHandler).fetch(request, env, ctx);
  },
};
