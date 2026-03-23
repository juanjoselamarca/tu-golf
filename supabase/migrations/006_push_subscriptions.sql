-- ============================================================
-- Golfers+ — Migración 006: Push Notifications
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(endpoint)
);

-- Allow anonymous subscriptions (spectators without account)
-- user_id can be NULL for anonymous spectators

-- Notification preferences per user
CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  birdies BOOLEAN DEFAULT true,
  eagles BOOLEAN DEFAULT true,
  leader_changes BOOLEAN DEFAULT true,
  round_updates BOOLEAN DEFAULT true,
  round_finished BOOLEAN DEFAULT true,
  marketing BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS policies
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

-- Push subscriptions: anyone can insert (anonymous spectators), users can manage their own
CREATE POLICY "push_sub_insert" ON push_subscriptions FOR INSERT WITH CHECK (true);
CREATE POLICY "push_sub_select_own" ON push_subscriptions FOR SELECT USING (user_id = auth.uid() OR user_id IS NULL);
CREATE POLICY "push_sub_delete_own" ON push_subscriptions FOR DELETE USING (user_id = auth.uid() OR user_id IS NULL);
CREATE POLICY "push_sub_update_own" ON push_subscriptions FOR UPDATE USING (user_id = auth.uid() OR user_id IS NULL);

-- Notification preferences: users manage their own
CREATE POLICY "notif_prefs_all" ON notification_preferences FOR ALL USING (user_id = auth.uid());
CREATE POLICY "notif_prefs_insert" ON notification_preferences FOR INSERT WITH CHECK (user_id = auth.uid());

-- Index for fast lookup by user
CREATE INDEX IF NOT EXISTS idx_push_sub_user ON push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_sub_endpoint ON push_subscriptions(endpoint);
