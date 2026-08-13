-- ============================================================
-- Reneo Live — Database Schema (Custom Auth, no Supabase Auth)
-- ============================================================
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor)
-- If you already ran the previous migration, run the DROP
-- statements first, or use a fresh project.
-- ============================================================

-- Drop old tables if re-running
DROP TABLE IF EXISTS chat_messages CASCADE;
DROP TABLE IF EXISTS live_sessions CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- ============================================================
-- 1. PROFILES (acts as the users table)
-- ============================================================
CREATE TABLE profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  avatar_url TEXT,
  role TEXT NOT NULL CHECK (role IN ('seller', 'customer')),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Allow reads and inserts from anon/authenticated (app handles auth)
CREATE POLICY "Allow all reads on profiles"
  ON profiles FOR SELECT USING (true);

CREATE POLICY "Allow inserts on profiles"
  ON profiles FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow updates on profiles"
  ON profiles FOR UPDATE USING (true) WITH CHECK (true);

-- ============================================================
-- 2. PRODUCTS
-- ============================================================
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  image_url TEXT,
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all reads on products"
  ON products FOR SELECT USING (true);

CREATE POLICY "Allow inserts on products"
  ON products FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow updates on products"
  ON products FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "Allow deletes on products"
  ON products FOR DELETE USING (true);

-- ============================================================
-- 3. LIVE SESSIONS
-- ============================================================
CREATE TABLE live_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'live', 'ended')),
  channel_name TEXT NOT NULL UNIQUE,
  viewer_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ
);

ALTER TABLE live_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all reads on live_sessions"
  ON live_sessions FOR SELECT USING (true);

CREATE POLICY "Allow inserts on live_sessions"
  ON live_sessions FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow updates on live_sessions"
  ON live_sessions FOR UPDATE USING (true) WITH CHECK (true);

-- ============================================================
-- 4. CHAT MESSAGES
-- ============================================================
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  sender_name TEXT NOT NULL,
  message TEXT NOT NULL CHECK (char_length(message) <= 500),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all reads on chat_messages"
  ON chat_messages FOR SELECT USING (true);

CREATE POLICY "Allow inserts on chat_messages"
  ON chat_messages FOR INSERT WITH CHECK (true);

-- ============================================================
-- 5. INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_chat_messages_session
  ON chat_messages(session_id, created_at);

CREATE INDEX IF NOT EXISTS idx_products_seller
  ON products(seller_id);

CREATE INDEX IF NOT EXISTS idx_live_sessions_status
  ON live_sessions(status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_email
  ON profiles(email);

-- ============================================================
-- 6. STORAGE BUCKET
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

-- Drop old policies first (safe re-run)
DROP POLICY IF EXISTS "Anyone can view product images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload product images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can update product images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete product images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload product images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own product images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own product images" ON storage.objects;

CREATE POLICY "Anyone can view product images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'product-images');

CREATE POLICY "Anyone can upload product images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'product-images');

CREATE POLICY "Anyone can update product images"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'product-images');

CREATE POLICY "Anyone can delete product images"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'product-images');

-- ============================================================
-- 7. REALTIME
-- ============================================================
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE live_sessions;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
