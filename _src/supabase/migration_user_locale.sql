-- =============================================================
-- migration_user_locale.sql
-- ユーザーのロケール・タイムゾーン対応
-- 将来の多言語・多地域対応に備えた拡張
-- =============================================================

-- -------------------------------------------------------------
-- 1. profiles テーブルが存在しない場合は作成
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -------------------------------------------------------------
-- 2. ロケール・タイムゾーン カラムを追加
-- -------------------------------------------------------------
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS timezone    TEXT NOT NULL DEFAULT 'Asia/Tokyo',
  ADD COLUMN IF NOT EXISTS locale      TEXT NOT NULL DEFAULT 'ja',
  ADD COLUMN IF NOT EXISTS date_format TEXT NOT NULL DEFAULT 'YYYY/MM/DD';

COMMENT ON COLUMN profiles.timezone    IS 'IANA timezone (例: Asia/Tokyo, America/New_York)';
COMMENT ON COLUMN profiles.locale      IS 'BCP 47 言語タグ (例: ja, en-US, de, fr)';
COMMENT ON COLUMN profiles.date_format IS '日付フォーマット (例: YYYY/MM/DD, MM/DD/YYYY)';

-- -------------------------------------------------------------
-- 3. updated_at トリガー（未作成の場合）
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;

$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- -------------------------------------------------------------
-- 4. RLS
-- -------------------------------------------------------------
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_read_own_profile" ON profiles;
CREATE POLICY "users_read_own_profile"
  ON profiles FOR SELECT
  USING (id = auth.uid());

DROP POLICY IF EXISTS "users_update_own_profile" ON profiles;
CREATE POLICY "users_update_own_profile"
  ON profiles FOR UPDATE
  USING (id = auth.uid());

DROP POLICY IF EXISTS "service_role_all_profiles" ON profiles;
CREATE POLICY "service_role_all_profiles"
  ON profiles FOR ALL
  USING (auth.role() = 'service_role');

-- -------------------------------------------------------------
-- 5. 新規ユーザー登録時に profiles を自動作成するトリガー
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, timezone, locale)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    'Asia/Tokyo',
    'ja'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;

$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- -------------------------------------------------------------
-- 6. 既存ユーザーの profiles を一括生成
-- -------------------------------------------------------------
INSERT INTO profiles (id, display_name, timezone, locale)
SELECT
  id,
  COALESCE(raw_user_meta_data->>'full_name', email),
  'Asia/Tokyo',
  'ja'
FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- -------------------------------------------------------------
-- 7. 確認クエリ
-- -------------------------------------------------------------
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'profiles'
  AND table_schema = 'public'
ORDER BY ordinal_position;
