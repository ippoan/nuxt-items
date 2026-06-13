-- nuxt-items 統合テスト用 seed (migrations 適用後に実行)
-- rust-alc-api コンテナ (docker-compose.test.yml) の DB に投入される。
SET search_path TO alc_api;

-- Test tenant (X-Tenant-ID で参照、items の RLS / FK 先)
INSERT INTO tenants (id, name, slug) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Test Tenant', 'test-tenant');

-- list / get-by-id が参照する seed item
INSERT INTO items (id, tenant_id, owner_type, item_type, name) VALUES
  ('aaaaaaaa-0001-0001-0001-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111',
   'org', 'item', 'Seed Item');
