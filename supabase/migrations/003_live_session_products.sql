-- Many products per live session. live_sessions.product_id stays as the
-- "featured" product (shown big in the overlay); this table holds the full set.
CREATE TABLE IF NOT EXISTS live_session_products (
  session_id UUID NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, product_id)
);

ALTER TABLE live_session_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all reads on live_session_products"
  ON live_session_products FOR SELECT USING (true);
CREATE POLICY "Allow inserts on live_session_products"
  ON live_session_products FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow deletes on live_session_products"
  ON live_session_products FOR DELETE USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE live_session_products;

-- Backfill: every existing session's single product becomes its first entry.
INSERT INTO live_session_products (session_id, product_id)
SELECT id, product_id FROM live_sessions
ON CONFLICT DO NOTHING;
