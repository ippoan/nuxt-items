/**
 * Cloudflare Worker entry。Nuxt/Nitro (cloudflare-module preset) の出力を包んで
 * `/ws/items/{orgId}` だけ ItemsSyncDO に振り分け、それ以外は Nitro に委譲する。
 *
 * Nitro 単体では Durable Object を export できないため、`wrangler.toml` の
 * `main` をこの wrapper に差し替えて DO を同居させる (Nuxt+CF で DO を足す
 * 定石)。`../.output/server/index.mjs` は `npm run build` が生成するので、
 * typecheck (nuxi) からは除外し wrangler の esbuild bundle 時にだけ解決する。
 */
// @ts-expect-error nuxt build (nitro cloudflare-module) が生成する成果物。
import nitroApp from "../.output/server/index.mjs";
import { ItemsSyncDO, type ItemsSyncEnv } from "./items-sync-do";

export { ItemsSyncDO };

interface NitroHandler {
  fetch(request: Request, env: unknown, ctx: ExecutionContext): Promise<Response>;
}

export default {
  async fetch(
    request: Request,
    env: ItemsSyncEnv & Record<string, unknown>,
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
