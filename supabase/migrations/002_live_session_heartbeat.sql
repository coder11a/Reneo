-- Host presence heartbeat: sessions only count as "live" while the host keeps
-- checking in. A host that closes the tab or crashes stops updating this, so
-- stale 'live' rows drop off the customer feed instead of showing a dead stream.
ALTER TABLE live_sessions
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now();
