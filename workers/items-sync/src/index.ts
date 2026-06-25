// nuxt-items-sync — ItemsSyncDO 専用 worker。
// app (nuxt-items) から external DO binding (script_name="nuxt-items-sync") 経由で
// のみ使われる。DO は migration を含むため versions upload 不可 → この worker は
// `wrangler deploy` で配備し、app 本体は migration を持たず no-traffic release を維持する
// (Refs ippoan/ci-dashboard error 10211 / nuxt-items#... DO 分離)。
export { ItemsSyncDO } from "./items-sync-do";

export default {
  async fetch(): Promise<Response> {
    // 直接 fetch されることは無い (app が DO stub 経由で叩く)。健康確認のみ。
    return new Response("nuxt-items-sync: durable object worker", { status: 404 });
  },
};
