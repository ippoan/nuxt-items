// nuxt-items-sync — ItemsSyncDO 専用 worker。
// app (nuxt-items) から **service binding** 経由で /ws/items/{orgId} が転送されてくる。
// default fetch が orgId → DO instance に routing する (DO binding はこの worker 内部、
// migration もこの worker が持つ)。app 側は DO binding / migration を持たず no-traffic
// release を維持する (Refs error 10211/10061 / nuxt-items DO 分離 #290)。
export { ItemsSyncDO } from "./items-sync-do";

interface SyncWorkerEnv {
  /** この worker 内部の DO namespace (wrangler.toml の durable_objects.bindings)。 */
  ITEMS_SYNC: DurableObjectNamespace;
}

export default {
  async fetch(request: Request, env: SyncWorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    // app の service binding から転送された /ws/items/{orgId} を DO に振り分ける。
    if (url.pathname.startsWith("/ws/items/")) {
      const orgId = url.pathname.split("/")[3];
      if (!orgId) return new Response("Bad Request", { status: 400 });
      const id = env.ITEMS_SYNC.idFromName(`items-${orgId}`);
      return env.ITEMS_SYNC.get(id).fetch(request);
    }
    return new Response("nuxt-items-sync: durable object worker", { status: 404 });
  },
};
