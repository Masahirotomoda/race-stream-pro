-- =============================================================
-- migration_vm_provision.sql
-- Windows OBS VM 貸出機能 用スキーマ追加
-- =============================================================

-- -------------------------------------------------------------
-- 1. reservations テーブルにカラム追加
-- -------------------------------------------------------------
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS gcp_instance_name  TEXT,
  ADD COLUMN IF NOT EXISTS gcp_instance_zone  TEXT,
  ADD COLUMN IF NOT EXISTS gcp_project_id     TEXT,
  ADD COLUMN IF NOT EXISTS provision_status   TEXT;

-- -------------------------------------------------------------
-- 2. reservation_resources テーブル
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reservation_resources (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id   UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  resource_type    TEXT NOT NULL,
  data             JSONB NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_reservation_resource UNIQUE (reservation_id, resource_type)
);

-- -------------------------------------------------------------
-- 3. provisioning_jobs テーブル
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS provisioning_jobs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  action         TEXT NOT NULL CHECK (action IN ('provision', 'deprovision')),
  status         TEXT NOT NULL DEFAULT 'queued'
                   CHECK (status IN ('queued', 'pending', 'succeeded', 'error')),
  attempts       INTEGER NOT NULL DEFAULT 0,
  last_error     TEXT,
  locked_at      TIMESTAMPTZ,
  locked_by      TEXT,
  run_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_provisioning_jobs_status
  ON provisioning_jobs (status, created_at)
  WHERE status IN ('queued', 'pending');

CREATE INDEX IF NOT EXISTS idx_provisioning_jobs_reservation
  ON provisioning_jobs (reservation_id);

-- -------------------------------------------------------------
-- 4. updated_at 自動更新トリガー
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;

$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_reservation_resources_updated_at ON reservation_resources;
CREATE TRIGGER trg_reservation_resources_updated_at
  BEFORE UPDATE ON reservation_resources
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_provisioning_jobs_updated_at ON provisioning_jobs;
CREATE TRIGGER trg_provisioning_jobs_updated_at
  BEFORE UPDATE ON provisioning_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- -------------------------------------------------------------
-- 5. RLS 設定
-- -------------------------------------------------------------

-- reservation_resources
ALTER TABLE reservation_resources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_read_own_resources" ON reservation_resources;
CREATE POLICY "users_read_own_resources"
  ON reservation_resources FOR SELECT
  USING (
    reservation_id IN (
      SELECT id FROM reservations WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "service_role_all_resources" ON reservation_resources;
CREATE POLICY "service_role_all_resources"
  ON reservation_resources FOR ALL
  USING (auth.role() = 'service_role');

-- provisioning_jobs
ALTER TABLE provisioning_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_jobs" ON provisioning_jobs;
CREATE POLICY "service_role_all_jobs"
  ON provisioning_jobs FOR ALL
  USING (auth.role() = 'service_role');

-- -------------------------------------------------------------
-- 6. 実行確認クエリ
-- -------------------------------------------------------------
SELECT
  'reservations columns' AS check_target,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_name = 'reservations'
  AND column_name IN (
    'gcp_instance_name','gcp_instance_zone','gcp_project_id','provision_status'
  )
UNION ALL
SELECT
  'tables created' AS check_target,
  table_name AS column_name,
  'TABLE' AS data_type
FROM information_schema.tables
WHERE table_name IN ('reservation_resources', 'provisioning_jobs')
  AND table_schema = 'public'
ORDER BY check_target, column_name;
