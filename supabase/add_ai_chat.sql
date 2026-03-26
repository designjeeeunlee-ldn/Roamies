-- ── AI chat messages ─────────────────────────────────────────────────────────
-- Run this in Supabase SQL editor (Dashboard → SQL Editor → New query)

CREATE TABLE trip_ai_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id     UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('user','ai','ai_vote','proactive')),
  text        TEXT,
  intro       TEXT,
  options     JSONB,        -- [{text: string}] for ai_vote type
  sent_by     UUID REFERENCES profiles(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE trip_ai_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trip_ai_messages_select" ON trip_ai_messages FOR SELECT
  USING (trip_id IN (SELECT trip_id FROM trip_members WHERE user_id = auth.uid()));

CREATE POLICY "trip_ai_messages_insert" ON trip_ai_messages FOR INSERT
  WITH CHECK (trip_id IN (SELECT trip_id FROM trip_members WHERE user_id = auth.uid()));

-- Required for real-time DELETE events to carry old row data
ALTER TABLE trip_ai_messages REPLICA IDENTITY FULL;

-- ── AI chat votes ─────────────────────────────────────────────────────────────

CREATE TABLE trip_ai_votes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id  UUID NOT NULL REFERENCES trip_ai_messages(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL,
  option_idx  INTEGER NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id)
);

ALTER TABLE trip_ai_votes ENABLE ROW LEVEL SECURITY;

-- Trip members can read votes
CREATE POLICY "trip_ai_votes_select" ON trip_ai_votes FOR SELECT
  USING (
    message_id IN (
      SELECT m.id FROM trip_ai_messages m
      JOIN trip_members tm ON tm.trip_id = m.trip_id
      WHERE tm.user_id = auth.uid()
    )
  );

-- Users can manage their own votes
CREATE POLICY "trip_ai_votes_all" ON trip_ai_votes FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

ALTER TABLE trip_ai_votes REPLICA IDENTITY FULL;

-- ── Enable real-time ──────────────────────────────────────────────────────────
-- In Supabase Dashboard → Database → Replication, enable both tables.
-- Or run:
-- ALTER PUBLICATION supabase_realtime ADD TABLE trip_ai_messages;
-- ALTER PUBLICATION supabase_realtime ADD TABLE trip_ai_votes;
