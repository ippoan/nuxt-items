/**
 * Cloudflare Worker entry。Nuxt/Nitro (cloudflare-module preset) の出力を包んで
 * `/ws/items/{orgId}` だけ items-sync worker (nuxt-items-sync) に **service binding**
 * 経由で転送し、それ以外は Nitro に委譲する。
 *
 * ItemsSyncDO は別 worker `nuxt-items-sync` に分離済み。app からは DO binding ではなく
 * **service binding (worker→worker fetch)** で叩く。orgId → DO instance の routing は
 * items-sync worker 側 (default fetch) が行う。app は DO binding (class_name 参照) を
 * 持たないので DO migration / class 登録を一切持たず、no-traffic `wrangler versions
 * upload` release を維持できる (DO binding だと class_name 参照が delete-class を
 * 阻む [error 10061])。
 */
// @ts-expect-error nuxt build (nitro cloudflare-module) が生成する成果物。
import nitroApp from "../.output/server/index.mjs";

interface NitroHandler {
  fetch(request: Request, env: unknown, ctx: ExecutionContext): Promise<Response>;
}

interface AppEnv {
  /** service binding → nuxt-items-sync worker (ItemsSyncDO を内包)。 */
  ITEMS_SYNC: Fetcher;
}

export default {
  async fetch(
    request: Request,
    env: AppEnv & Record<string, unknown>,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/ws/items/")) {
      // orgId 抽出と DO routing は items-sync worker (default fetch) が行う。
      // ここは原 request (WS upgrade + path + token) をそのまま転送するだけ。
      return env.ITEMS_SYNC.fetch(request);
    }
    return (nitroApp as NitroHandler).fetch(request, env, ctx);
  },
};
