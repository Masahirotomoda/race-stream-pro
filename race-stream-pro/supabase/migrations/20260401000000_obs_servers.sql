-- ============================================================
-- OBS Server Rental Feature
-- Migration: obs_servers + obs_server_assignments
-- ============================================================

-- ── OBSサーバー台帳 ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS obs_servers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL UNIQUE,       -- "obsserver-win01"
  gcp_instance    TEXT NOT NULL UNIQUE,       -- GCPインスタンス名
  gcp_zone        TEXT NOT NULL,              -- "asia-northeast1-c"
  gcp_project     TEXT NOT NULL,              -- "livestreaming-430703"
  internal_ip     TEXT NOT NULL,              -- "10.146.0.6"
  metrics_port    INTEGER NOT NULL DEFAULT 9090,
  secret_key      TEXT NOT NULL,              -- MetricsAgent x-secret-key
  status          TEXT NOT NULL DEFAULT 'available'
                  CHECK (status IN ('available','in_use','sysprep_needed','maintenance','error')),
  assigned_to     UUID REFERENCES reservations(id) ON DELETE SET NULL,
  rdp_host        TEXT,                       -- 外部RDP接続ホスト (外部IPまたはIAP)
  rdp_port        INTEGER NOT NULL DEFAULT 3389,
  rdp_username    TEXT NOT NULL DEFAULT 'obs',
  rdp_password    TEXT,                       -- 払い出し時に生成・更新
  notes           TEXT,
  last_sysprep_at TIMESTAMPTZ,               -- 最後にSysprepした時刻
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 割り当て履歴 ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS obs_server_assignments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obs_server_id   UUID NOT NULL REFERENCES obs_servers(id) ON DELETE CASCADE,
  reservation_id  UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  assigned_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  released_at     TIMESTAMPTZ,
  rdp_password    TEXT,                       -- 払い出し時パスワード（履歴保持）
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','released')),
  sysprep_job_id  TEXT,                       -- GCP操作ジョブID（自動Sysprep追跡用）
  notes           TEXT
);

-- ── インデックス ───────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_obs_servers_status ON obs_servers(status);
CREATE INDEX IF NOT EXISTS idx_obs_servers_assigned_to ON obs_servers(assigned_to);
CREATE INDEX IF NOT EXISTS idx_obs_server_assignments_reservation ON obs_server_assignments(reservation_id);
CREATE INDEX IF NOT EXISTS idx_obs_server_assignments_server ON obs_server_assignments(obs_server_id);
CREATE INDEX IF NOT EXISTS idx_obs_server_assignments_status ON obs_server_assignments(status);

-- ── updated_at 自動更新トリガー ────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER obs_servers_updated_at
  BEFORE UPDATE ON obs_servers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── RLS (Row Level Security) ───────────────────────────────
-- obs_servers / obs_server_assignments はサービスロール経由のみ
-- アプリ側は必ず service_role キー（createAdminClient）を使う

ALTER TABLE obs_servers ENABLE ROW LEVEL SECURITY;
ALTER TABLE obs_server_assignments ENABLE ROW LEVEL SECURITY;

-- 通常ユーザー（anon/authenticated）はアクセス不可
-- service_role は RLS をバイパスするため明示ポリシー不要

-- ── provisioning_jobs の拡張 ───────────────────────────────
-- action に 'sysprep' を追加し、metadata カラムを追加する

-- CHECK制約を更新（action に 'sysprep' を追加）
ALTER TABLE provisioning_jobs DROP CONSTRAINT IF EXISTS provisioning_jobs_action_check;
ALTER TABLE provisioning_jobs ADD CONSTRAINT provisioning_jobs_action_check
  CHECK (action IN ('provision', 'deprovision', 'sysprep'));

-- metadata カラム追加（Sysprep ジョブ用: obs_server_id, gcp_instance 等を保存）
ALTER TABLE provisioning_jobs
  ADD COLUMN IF NOT EXISTS metadata JSONB;

-- ── 初期データ挿入例（Supabase SQL Editor または gcloud scp 後に実行）──
-- 下記は obsserver-win01 の登録例。secret_key は実際の値に置き換えてください。
--
-- INSERT INTO obs_servers (
--   name, gcp_instance, gcp_zone, gcp_project,
--   internal_ip, metrics_port, secret_key,
--   rdp_host, rdp_port, rdp_username
-- ) VALUES
-- (
--   'obsserver-win01', 'obsserver-win01', 'asia-northeast1-c',
--   'livestreaming-430703', '10.146.0.6', 9090,
--   'REPLACE_WITH_ACTUAL_SECRET_KEY_1',
--   '34.xx.xx.xx', 3389, 'obs'
-- ),
-- (
--   'obsserver-win02', 'obsserver-win02', 'asia-northeast1-c',
--   'livestreaming-430703', '10.146.0.7', 9090,
--   'REPLACE_WITH_ACTUAL_SECRET_KEY_2',
--   '34.xx.xx.xy', 3389, 'obs'
-- );
