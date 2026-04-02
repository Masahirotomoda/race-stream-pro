-- ============================================================
-- OBS VM テンプレート管理
-- Migration: obs_vm_templates
-- 案B: 予約ごとにスナップショットから新規VMを作成する方式
-- ============================================================

-- ── VMテンプレート定義テーブル ─────────────────────────────
CREATE TABLE IF NOT EXISTS obs_vm_templates (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,                       -- 管理用表示名 "OBS Template v1"
  snapshot_name  TEXT NOT NULL,                       -- GCPスナップショット名
                                                      --例: obsserver-win01-asia-northeast1-c-20260331064023-iwc1ql1t
  gcp_zone       TEXT NOT NULL DEFAULT 'asia-northeast1-c',
  gcp_project    TEXT NOT NULL DEFAULT 'livestreaming-430703',
  machine_type   TEXT NOT NULL DEFAULT 'n1-standard-4',
  disk_size_gb   INTEGER NOT NULL DEFAULT 100,
  metrics_port   INTEGER NOT NULL DEFAULT 9090,
  secret_key     TEXT NOT NULL,                       -- MetricsAgent x-secret-key（全VM共通 or テンプレート単位）
  rdp_username   TEXT NOT NULL DEFAULT 'obs',
  rdp_port       INTEGER NOT NULL DEFAULT 3389,
  is_active      BOOLEAN NOT NULL DEFAULT true,       -- true = 新規予約に使用するテンプレート
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- is_active は1件のみ true を許可（排他制御はアプリ側 + トリガーで保証）
-- ※ 複数 true は技術的に許容し、アプリ側で .order('created_at', desc).limit(1) で最新を使う

-- ── インデックス ───────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_obs_vm_templates_active ON obs_vm_templates(is_active);
CREATE INDEX IF NOT EXISTS idx_obs_vm_templates_created ON obs_vm_templates(created_at DESC);

-- ── updated_at 自動更新 ────────────────────────────────────
CREATE TRIGGER obs_vm_templates_updated_at
  BEFORE UPDATE ON obs_vm_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── RLS ────────────────────────────────────────────────────
ALTER TABLE obs_vm_templates ENABLE ROW LEVEL SECURITY;
-- service_role のみアクセス可（RLSバイパス）

-- ── obs_servers テーブルの動的VM対応カラム追加 ────────────
-- 案B では obs_servers レコードを予約ごとに動的に作成・削除する
-- template_id: 作成元テンプレートを記録
-- vm_instance_name: gcloud で作成したインスタンス名
-- is_dynamic: true = 予約ごとに作成/削除するVM（案B）

ALTER TABLE obs_servers
  ADD COLUMN IF NOT EXISTS template_id    UUID REFERENCES obs_vm_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vm_instance_name TEXT,   -- gcloud インスタンス名（動的VM）
  ADD COLUMN IF NOT EXISTS is_dynamic     BOOLEAN NOT NULL DEFAULT false;

-- ── 初期テンプレート登録（Supabase SQL Editor で実行） ─────
-- secret_key は obsserver-win01 の MetricsAgent と同じ値を設定してください
--
-- INSERT INTO obs_vm_templates (
--   name, snapshot_name, gcp_zone, gcp_project,
--   machine_type, disk_size_gb, metrics_port,
--   secret_key, rdp_username, rdp_port, is_active, notes
-- ) VALUES (
--   'OBS Template v1 (2026-03-31)',
--   'obsserver-win01-asia-northeast1-c-20260331064023-iwc1ql1t',
--   'asia-northeast1-c',
--   'livestreaming-430703',
--   'n1-standard-4',
--   100,
--   9090,
--   'REPLACE_WITH_YOUR_SECRET_KEY',
--   'obs',
--   3389,
--   true,
--   'OBS Studio + MetricsAgent インストール済み'
-- );
