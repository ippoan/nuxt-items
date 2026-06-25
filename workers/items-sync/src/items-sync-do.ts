/**
 * ItemsSyncDO — マルチデバイス/タブ間の items 変更通知を中継する Durable Object。
 *
 * 元は yhonda-ohishi-pub-dev/cf-grpc-proxy に居たが、(1) cf-grpc-proxy を経由
 * する必然性が無い (gRPC とは無関係)、(2) 共有 `JWT_SECRET` で token を自前検証
 * していて #290 の「consumer に JWT_SECRET を配らない」方針に反する、(3) token の
 * tenant と接続先 orgId の一致を見ておらず cross-tenant 相乗りができた、という
 * 3 点から nuxt-items 自身に移設し、認証を auth-worker `/auth/introspect`
 * ハンドシェイクに置き換えた。本 DO は `JWT_SECRET` を持たない。
 *
 * 接続: `wss://items.ippoan.org/ws/items/{orgId}?token=<browser JWT>`
 * worker entry (`worker/index.ts`) が `idFromName("items-{orgId}")` で同一 org の
 * 全クライアントを 1 DO に集約し、その DO がここで token を introspect 検証する。
 */
import { DurableObject } from "cloudflare:workers";
import { decideSyncAuth, type IntrospectResult } from "./auth-decision";

/** SecretsStoreSecret (`.get()`) / 文字列 のどちらの binding でも値を取り出す。 */
async function resolveSecret(binding: unknown): Promise<string> {
  if (typeof binding === "string") return binding;
  if (binding && typeof (binding as { get?: unknown }).get === "function") {
    return (await (binding as { get(): Promise<string> }).get()) ?? "";
  }
  return "";
}

export interface ItemsSyncEnv {
  ITEMS_SYNC: DurableObjectNamespace;
  /** auth-worker introspect 用 shared secret (CF Secrets Store binding)。 */
  INTERNAL_SHARED_SECRET?: unknown;
  /** auth-worker origin (wrangler vars と共有)。 */
  NUXT_PUBLIC_AUTH_WORKER_URL?: string;
}

/** WS hibernation の serialized attachment。 */
interface SocketAttachment {
  userId: string;
}

/** クライアント↔DO の sync メッセージ wire 形式。 */
interface SyncMessage {
  type: string;
  action?: string;
  parentId?: string;
  ownerType?: string;
  userId?: string;
}

export class ItemsSyncDO extends DurableObject<ItemsSyncEnv> {
  constructor(ctx: DurableObjectState, env: ItemsSyncEnv) {
    super(ctx, env);
    // ping/pong は runtime が自動応答 (hibernation 中も DO を起こさない)。
    this.ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair("ping", "pong"),
    );
  }

  /**
   * auth-worker `/auth/introspect` を直接叩く (DO は h3 context を持たないので
   * @ippoan/auth-client/server の requireAuth は使えない)。raw shared secret を
   * Authorization に載せる (auth-worker `resolveAllSharedSecrets` #189 と対)。
   * 失敗は全て fail-closed (`{ active: false }`)。
   */
  private async introspect(
    token: string,
    origin: string,
  ): Promise<IntrospectResult> {
    const sharedSecret = await resolveSecret(this.env.INTERNAL_SHARED_SECRET);
    if (!sharedSecret) return { active: false };
    const authWorkerUrl =
      this.env.NUXT_PUBLIC_AUTH_WORKER_URL || "https://auth.ippoan.org";
    try {
      const res = await fetch(`${authWorkerUrl}/auth/introspect`, {
        method: "POST",
        headers: {
          Authorization: sharedSecret,
          "Content-Type": "application/json",
          "User-Agent": "nuxt-items/items-sync-do",
        },
        body: JSON.stringify({ token, origin }),
      });
      if (!res.ok) return { active: false };
      const data = (await res.json()) as Record<string, unknown>;
      if (!data || data.active !== true) return { active: false };
      return {
        active: true,
        tenant_id: typeof data.tenant_id === "string" ? data.tenant_id : "",
        sub: typeof data.sub === "string" ? data.sub : "",
        email: typeof data.email === "string" ? data.email : "",
      };
    } catch {
      return { active: false };
    }
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }
    const url = new URL(request.url);
    // /ws/items/{orgId} → ["", "ws", "items", "{orgId}"]
    const orgId = url.pathname.split("/")[3] || "";
    const token = url.searchParams.get("token");
    if (!token || !orgId) {
      return new Response("Missing token", { status: 401 });
    }

    // origin は APP_TENANT_ACL 分割用。custom_domain の公開 host から組む
    // (items.ippoan.org / items-staging.ippoan.org)。
    const result = await this.introspect(token, `https://${url.host}`);
    const decision = decideSyncAuth(result, orgId);
    if (decision.status !== 101) {
      return new Response(
        decision.status === 403
          ? "Forbidden: tenant mismatch"
          : "Invalid or expired token",
        { status: decision.status },
      );
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server, [decision.userId]);
    server.serializeAttachment({ userId: decision.userId } as SocketAttachment);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(
    ws: WebSocket,
    message: string | ArrayBuffer,
  ): Promise<void> {
    if (typeof message !== "string") return;
    let data: SyncMessage;
    try {
      data = JSON.parse(message) as SyncMessage;
    } catch {
      return;
    }
    if (data.type !== "items_changed") return;

    const sender = ws.deserializeAttachment() as SocketAttachment | null;
    const senderUserId = sender?.userId ?? "";
    const broadcastMsg = JSON.stringify({
      type: "items_changed",
      action: data.action,
      parentId: data.parentId,
      ownerType: data.ownerType,
      userId: senderUserId,
    });

    for (const sock of this.ctx.getWebSockets()) {
      if (sock === ws) continue;
      if (data.ownerType === "personal") {
        // personal アイテムは同一 user の別デバイス/タブにだけ通知する。
        const att = sock.deserializeAttachment() as SocketAttachment | null;
        if (att?.userId && att.userId === senderUserId) sock.send(broadcastMsg);
      } else {
        // org アイテムは同 org の全クライアントに通知する。
        sock.send(broadcastMsg);
      }
    }
  }

  async webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
  ): Promise<void> {
    ws.close(code, reason);
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    console.error("ItemsSyncDO WebSocket error:", error);
    ws.close(1011, "Internal error");
  }
}
