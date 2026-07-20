-- =============================================================================
-- Bill Watch Alerts
-- Private authenticated follows + immutable official events + retry-safe email.
-- =============================================================================

ALTER TABLE public.etl_leases
  ADD COLUMN IF NOT EXISTS fence_token BIGINT NOT NULL DEFAULT 1;

CREATE TABLE public.bill_alert_preferences (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  history_days SMALLINT NOT NULL DEFAULT 30 CHECK (history_days = 30),
  suppressed_at TIMESTAMPTZ,
  suppression_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.bill_follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  bill_id TEXT NOT NULL REFERENCES public.bills(id) ON DELETE CASCADE,
  committee_alerts BOOLEAN NOT NULL DEFAULT TRUE,
  floor_alerts BOOLEAN NOT NULL DEFAULT TRUE,
  vote_alerts BOOLEAN NOT NULL DEFAULT TRUE,
  email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  paused_at TIMESTAMPTZ,
  stopped_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, bill_id),
  CHECK (committee_alerts OR floor_alerts OR vote_alerts)
);

CREATE INDEX bill_follows_active_bill_idx
  ON public.bill_follows (bill_id, created_at, id)
  WHERE stopped_at IS NULL AND paused_at IS NULL AND email_enabled;

CREATE TABLE public.bill_alert_runtime_settings (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  mode TEXT NOT NULL DEFAULT 'off' CHECK (mode IN ('off', 'shadow', 'internal', 'public')),
  senate_future_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.bill_alert_runtime_settings (singleton, mode)
VALUES (TRUE, 'off')
ON CONFLICT (singleton) DO NOTHING;

CREATE TABLE public.bill_alert_internal_users (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.bill_alert_source_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'succeeded', 'failed', 'partial')),
  cursor_before TEXT,
  cursor_after TEXT,
  items_observed INTEGER NOT NULL DEFAULT 0 CHECK (items_observed >= 0),
  unmatched_items INTEGER NOT NULL DEFAULT 0 CHECK (unmatched_items >= 0),
  events_recorded INTEGER NOT NULL DEFAULT 0 CHECK (events_recorded >= 0),
  error_code TEXT
);

CREATE INDEX bill_alert_source_runs_source_started_idx
  ON public.bill_alert_source_runs (source_name, started_at DESC);

CREATE TABLE public.bill_alert_source_state (
  source_name TEXT PRIMARY KEY,
  committed_cursor TEXT,
  etag TEXT,
  last_complete_run_id UUID REFERENCES public.bill_alert_source_runs(id) ON DELETE RESTRICT,
  last_succeeded_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.bill_source_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name TEXT NOT NULL,
  upstream_item_id TEXT NOT NULL,
  -- Items that cannot yet be matched live in bill_alert_unmatched_items. A
  -- canonical item always has a bill, which also makes its identity unique.
  bill_id TEXT NOT NULL REFERENCES public.bills(id) ON DELETE RESTRICT,
  source_status TEXT,
  content_hash TEXT NOT NULL,
  source_url TEXT NOT NULL CHECK (source_url ~ '^https://'),
  source_updated_at TIMESTAMPTZ,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_run_id UUID REFERENCES public.bill_alert_source_runs(id) ON DELETE RESTRICT,
  missing_observation_count SMALLINT NOT NULL DEFAULT 0 CHECK (missing_observation_count >= 0),
  UNIQUE (source_name, upstream_item_id, bill_id)
);

CREATE INDEX bill_source_items_bill_idx ON public.bill_source_items (bill_id, source_name);

CREATE TABLE public.bill_source_payloads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_item_id UUID NOT NULL REFERENCES public.bill_source_items(id) ON DELETE CASCADE,
  source_revision TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  payload JSONB NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  UNIQUE (source_item_id, source_revision)
);

CREATE INDEX bill_source_payloads_expiry_idx ON public.bill_source_payloads (expires_at);

CREATE TABLE public.bill_alert_unmatched_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name TEXT NOT NULL,
  upstream_item_id TEXT NOT NULL,
  source_revision TEXT NOT NULL,
  canonical_bill_hint TEXT,
  source_url TEXT NOT NULL CHECK (source_url ~ '^https://'),
  payload JSONB NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_bill_id TEXT REFERENCES public.bills(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  replayed_at TIMESTAMPTZ,
  UNIQUE (source_name, upstream_item_id, source_revision)
);

CREATE INDEX bill_alert_unmatched_unresolved_idx
  ON public.bill_alert_unmatched_items (first_seen_at)
  WHERE resolved_at IS NULL;

CREATE TABLE public.bill_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key TEXT NOT NULL UNIQUE CHECK (event_key ~ '^[0-9a-f]{64}$'),
  event_key_version SMALLINT NOT NULL DEFAULT 1 CHECK (event_key_version = 1),
  source_item_id UUID NOT NULL REFERENCES public.bill_source_items(id) ON DELETE RESTRICT,
  source_payload_id UUID REFERENCES public.bill_source_payloads(id) ON DELETE SET NULL,
  evidence_content_hash TEXT NOT NULL,
  bill_id TEXT NOT NULL REFERENCES public.bills(id) ON DELETE RESTRICT,
  event_series_key TEXT,
  is_correction BOOLEAN NOT NULL DEFAULT FALSE,
  supersedes_event_id UUID REFERENCES public.bill_events(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'committee_referral',
    'committee_meeting_scheduled',
    'committee_meeting_rescheduled',
    'committee_meeting_cancelled',
    'house_floor_listed',
    'house_floor_listing_changed',
    'senate_floor_attention',
    'floor_vote_recorded'
  )),
  headline TEXT NOT NULL CHECK (char_length(headline) BETWEEN 1 AND 320),
  detail TEXT,
  chamber TEXT CHECK (chamber IS NULL OR chamber IN ('house', 'senate', 'joint')),
  committee_code TEXT,
  occurred_at TIMESTAMPTZ,
  scheduled_for TIMESTAMPTZ,
  scheduled_date DATE,
  scheduled_week_start DATE,
  source_timezone TEXT,
  time_precision TEXT NOT NULL DEFAULT 'unknown'
    CHECK (time_precision IN ('exact', 'date', 'week', 'unknown')),
  source_url TEXT NOT NULL CHECK (source_url ~ '^https://'),
  source_published_at TIMESTAMPTZ,
  certainty TEXT NOT NULL CHECK (certainty IN ('recorded', 'scheduled', 'tentative')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (num_nonnulls(scheduled_for, scheduled_date, scheduled_week_start) <= 1)
);

CREATE INDEX bill_events_bill_created_idx ON public.bill_events (bill_id, created_at DESC);
CREATE INDEX bill_events_series_idx
  ON public.bill_events (event_series_key, created_at)
  WHERE event_series_key IS NOT NULL;

CREATE TABLE public.bill_alert_fanout_progress (
  event_id UUID PRIMARY KEY REFERENCES public.bill_events(id) ON DELETE CASCADE,
  last_follow_created_at TIMESTAMPTZ,
  last_follow_id UUID,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.bill_delivery_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  bill_id TEXT NOT NULL REFERENCES public.bills(id) ON DELETE RESTRICT,
  send_status TEXT NOT NULL DEFAULT 'building' CHECK (send_status IN (
    'building', 'ready', 'claimed', 'accepted', 'retryable',
    'permanently_failed', 'ambiguous', 'cancelled'
  )),
  payload_hash TEXT,
  recipient_email TEXT CHECK (recipient_email IS NULL OR char_length(recipient_email) <= 320),
  recipient_confirmed_at TIMESTAMPTZ,
  recipient_fingerprint TEXT,
  from_snapshot TEXT,
  subject_snapshot TEXT,
  html_snapshot TEXT,
  text_snapshot TEXT,
  headers_snapshot JSONB,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lease_expires_at TIMESTAMPTZ,
  claimed_by TEXT,
  claim_fence BIGINT NOT NULL DEFAULT 0,
  claimed_at TIMESTAMPTZ,
  provider_message_id TEXT,
  last_error_code TEXT,
  provider_first_attempt_at TIMESTAMPTZ,
  provider_last_attempt_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  CHECK (
    send_status IN ('building', 'cancelled')
    OR (
      payload_hash IS NOT NULL
      AND recipient_email IS NOT NULL
      AND recipient_confirmed_at IS NOT NULL
      AND recipient_fingerprint IS NOT NULL
      AND from_snapshot IS NOT NULL
      AND subject_snapshot IS NOT NULL
      AND html_snapshot IS NOT NULL
      AND text_snapshot IS NOT NULL
      AND headers_snapshot IS NOT NULL
    )
  )
);

CREATE INDEX bill_delivery_batches_due_idx
  ON public.bill_delivery_batches (next_attempt_at, created_at)
  WHERE send_status IN ('ready', 'retryable');
CREATE UNIQUE INDEX bill_delivery_batches_provider_id_idx
  ON public.bill_delivery_batches (provider_message_id)
  WHERE provider_message_id IS NOT NULL;
CREATE UNIQUE INDEX bill_delivery_batches_building_user_bill_idx
  ON public.bill_delivery_batches (user_id, bill_id)
  WHERE send_status = 'building';

CREATE TABLE public.bill_notification_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.bill_events(id) ON DELETE CASCADE,
  follow_id UUID NOT NULL REFERENCES public.bill_follows(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'email' CHECK (channel = 'email'),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'batched', 'sent', 'dead', 'cancelled')),
  delivery_batch_id UUID REFERENCES public.bill_delivery_batches(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  UNIQUE (event_id, follow_id, channel)
);

CREATE INDEX bill_notification_outbox_pending_idx
  ON public.bill_notification_outbox (created_at, user_id, event_id)
  WHERE status = 'pending';

CREATE TABLE public.bill_email_provider_events (
  provider_event_id TEXT PRIMARY KEY,
  delivery_batch_id UUID REFERENCES public.bill_delivery_batches(id) ON DELETE SET NULL,
  provider_message_id TEXT,
  event_type TEXT NOT NULL,
  occurred_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX bill_email_provider_events_batch_idx
  ON public.bill_email_provider_events (delivery_batch_id, occurred_at);

CREATE TABLE public.bill_alert_delivery_receipts (
  original_event_id UUID NOT NULL REFERENCES public.bill_events(id) ON DELETE RESTRICT,
  follow_id UUID NOT NULL REFERENCES public.bill_follows(id) ON DELETE CASCADE,
  event_series_key TEXT NOT NULL,
  delivered_at TIMESTAMPTZ NOT NULL,
  terminal_at TIMESTAMPTZ,
  retain_until TIMESTAMPTZ,
  PRIMARY KEY (original_event_id, follow_id),
  UNIQUE (event_series_key, follow_id)
);

-- -----------------------------------------------------------------------------
-- RLS and explicit grants
-- -----------------------------------------------------------------------------

ALTER TABLE public.bill_alert_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_alert_runtime_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_alert_internal_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_alert_source_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_alert_source_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_source_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_source_payloads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_alert_unmatched_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_alert_fanout_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_delivery_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_notification_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_email_provider_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_alert_delivery_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own bill alert preferences"
  ON public.bill_alert_preferences FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);
CREATE POLICY "Users can update own bill alert preferences"
  ON public.bill_alert_preferences FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can read own bill follows"
  ON public.bill_follows FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Public can read bill events"
  ON public.bill_events FOR SELECT TO public
  USING (true);

CREATE POLICY "No public API access" ON public.bill_alert_runtime_settings
  FOR ALL TO public USING (false) WITH CHECK (false);
CREATE POLICY "No public API access" ON public.bill_alert_internal_users
  FOR ALL TO public USING (false) WITH CHECK (false);
CREATE POLICY "No public API access" ON public.bill_alert_source_runs
  FOR ALL TO public USING (false) WITH CHECK (false);
CREATE POLICY "No public API access" ON public.bill_alert_source_state
  FOR ALL TO public USING (false) WITH CHECK (false);
CREATE POLICY "No public API access" ON public.bill_source_items
  FOR ALL TO public USING (false) WITH CHECK (false);
CREATE POLICY "No public API access" ON public.bill_source_payloads
  FOR ALL TO public USING (false) WITH CHECK (false);
CREATE POLICY "No public API access" ON public.bill_alert_unmatched_items
  FOR ALL TO public USING (false) WITH CHECK (false);
CREATE POLICY "No public API access" ON public.bill_alert_fanout_progress
  FOR ALL TO public USING (false) WITH CHECK (false);
CREATE POLICY "No public API access" ON public.bill_delivery_batches
  FOR ALL TO public USING (false) WITH CHECK (false);
CREATE POLICY "No public API access" ON public.bill_notification_outbox
  FOR ALL TO public USING (false) WITH CHECK (false);
CREATE POLICY "No public API access" ON public.bill_email_provider_events
  FOR ALL TO public USING (false) WITH CHECK (false);
CREATE POLICY "No public API access" ON public.bill_alert_delivery_receipts
  FOR ALL TO public USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE
  public.bill_alert_preferences,
  public.bill_follows,
  public.bill_alert_runtime_settings,
  public.bill_alert_internal_users,
  public.bill_alert_source_runs,
  public.bill_alert_source_state,
  public.bill_source_items,
  public.bill_source_payloads,
  public.bill_alert_unmatched_items,
  public.bill_events,
  public.bill_alert_fanout_progress,
  public.bill_delivery_batches,
  public.bill_notification_outbox,
  public.bill_email_provider_events,
  public.bill_alert_delivery_receipts
FROM anon, authenticated;

GRANT SELECT ON TABLE public.bill_alert_preferences, public.bill_follows TO authenticated;
GRANT SELECT ON TABLE public.bill_events TO anon, authenticated;
GRANT SELECT ON TABLE public.bills TO authenticated;

GRANT ALL ON TABLE
  public.bill_alert_preferences,
  public.bill_follows,
  public.bill_alert_runtime_settings,
  public.bill_alert_internal_users,
  public.bill_alert_source_runs,
  public.bill_alert_source_state,
  public.bill_source_items,
  public.bill_source_payloads,
  public.bill_alert_unmatched_items,
  public.bill_alert_fanout_progress,
  public.bill_delivery_batches,
  public.bill_notification_outbox,
  public.bill_email_provider_events,
  public.bill_alert_delivery_receipts
TO service_role;

GRANT SELECT ON TABLE public.bill_events TO service_role;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.bill_events FROM service_role;
-- Cursor changes are fenced through the source-run RPCs below. A stale worker
-- holding a service-role key cannot advance the committed watermark directly.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.bill_alert_source_runs FROM service_role;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.bill_alert_source_state FROM service_role;
GRANT SELECT ON TABLE public.bill_alert_source_runs, public.bill_alert_source_state TO service_role;
-- Evidence, unmatched-item, event, and fan-out mutations must go through the
-- fenced RPCs below. Service workers can inspect these tables but cannot write
-- around the active lease tuple after a failover.
REVOKE INSERT, UPDATE, DELETE ON TABLE
  public.bill_source_items,
  public.bill_source_payloads,
  public.bill_alert_unmatched_items,
  public.bill_alert_fanout_progress
FROM service_role;

CREATE TRIGGER update_bill_alert_preferences_updated_at
  BEFORE UPDATE ON public.bill_alert_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_bill_follows_updated_at
  BEFORE UPDATE ON public.bill_follows
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_bill_alert_runtime_settings_updated_at
  BEFORE UPDATE ON public.bill_alert_runtime_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- -----------------------------------------------------------------------------
-- Owner-scoped functions
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.bill_alert_category_enabled(
  p_event_type TEXT,
  p_committee_alerts BOOLEAN,
  p_floor_alerts BOOLEAN,
  p_vote_alerts BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_event_type LIKE 'committee_%' THEN p_committee_alerts
    WHEN p_event_type IN (
      'house_floor_listed', 'house_floor_listing_changed', 'senate_floor_attention'
    ) THEN p_floor_alerts
    WHEN p_event_type = 'floor_vote_recorded' THEN p_vote_alerts
    ELSE FALSE
  END
$$;

-- Cancel newly ineligible work for one follow. If a frozen batch contains a
-- mix of eligible and ineligible events, cancel that immutable payload and
-- return the still-eligible events to the pending queue for a clean rebuild.
CREATE OR REPLACE FUNCTION public.reconcile_bill_alert_follow_outbox(p_follow_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_batch_id UUID;
  v_cancelled INTEGER := 0;
  v_rows INTEGER;
BEGIN
  UPDATE public.bill_notification_outbox o
  SET status = 'cancelled'
  WHERE o.follow_id = p_follow_id
    AND o.status IN ('pending', 'batched')
    AND NOT EXISTS (
      SELECT 1
      FROM public.bill_follows f
      JOIN public.bill_alert_preferences p ON p.user_id = f.user_id
      JOIN public.bill_events e ON e.id = o.event_id
      WHERE f.id = o.follow_id
        AND f.stopped_at IS NULL
        AND f.paused_at IS NULL
        AND f.email_enabled
        AND p.email_enabled
        AND p.suppressed_at IS NULL
        AND public.bill_alert_category_enabled(
          e.event_type, f.committee_alerts, f.floor_alerts, f.vote_alerts
        )
    );
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_cancelled := v_cancelled + v_rows;

  FOR v_batch_id IN
    SELECT DISTINCT b.id
    FROM public.bill_delivery_batches b
    JOIN public.bill_notification_outbox o ON o.delivery_batch_id = b.id
    WHERE o.follow_id = p_follow_id
      AND o.status = 'cancelled'
      AND b.send_status IN ('building', 'ready', 'retryable', 'claimed')
      AND NOT (
        b.send_status = 'claimed'
        AND b.lease_expires_at IS NOT NULL
        AND b.lease_expires_at > NOW()
      )
  LOOP
    UPDATE public.bill_notification_outbox o
    SET status = 'pending', delivery_batch_id = NULL
    WHERE o.delivery_batch_id = v_batch_id
      AND o.status = 'batched'
      AND EXISTS (
        SELECT 1
        FROM public.bill_follows f
        JOIN public.bill_alert_preferences p ON p.user_id = f.user_id
        JOIN public.bill_events e ON e.id = o.event_id
        WHERE f.id = o.follow_id
          AND f.stopped_at IS NULL
          AND f.paused_at IS NULL
          AND f.email_enabled
          AND p.email_enabled
          AND p.suppressed_at IS NULL
          AND public.bill_alert_category_enabled(
            e.event_type, f.committee_alerts, f.floor_alerts, f.vote_alerts
          )
      );

    UPDATE public.bill_delivery_batches
    SET send_status = 'cancelled',
        last_error_code = 'PREFERENCE_CHANGED',
        claimed_by = NULL,
        claimed_at = NULL,
        lease_expires_at = NULL
    WHERE id = v_batch_id;
  END LOOP;

  RETURN v_cancelled;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_my_bill_alert_email_enabled(
  p_email_enabled BOOLEAN
)
RETURNS public.bill_alert_preferences
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := (select auth.uid());
  v_result public.bill_alert_preferences%ROWTYPE;
  v_follow_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'AUTH_REQUIRED';
  END IF;

  INSERT INTO public.bill_alert_preferences (user_id, email_enabled)
  VALUES (v_user_id, p_email_enabled)
  ON CONFLICT (user_id) DO UPDATE SET
    email_enabled = EXCLUDED.email_enabled,
    updated_at = NOW()
  RETURNING * INTO v_result;

  IF NOT p_email_enabled THEN
    FOR v_follow_id IN
      SELECT id FROM public.bill_follows
      WHERE user_id = v_user_id AND stopped_at IS NULL
    LOOP
      PERFORM public.reconcile_bill_alert_follow_outbox(v_follow_id);
    END LOOP;
  END IF;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.start_or_resume_bill_follow(
  p_bill_id TEXT,
  p_committee_alerts BOOLEAN DEFAULT TRUE,
  p_floor_alerts BOOLEAN DEFAULT TRUE,
  p_vote_alerts BOOLEAN DEFAULT TRUE
)
RETURNS public.bill_follows
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := (select auth.uid());
  v_existing public.bill_follows%ROWTYPE;
  v_count INTEGER;
  v_result public.bill_follows%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'AUTH_REQUIRED';
  END IF;
  IF NOT (p_committee_alerts OR p_floor_alerts OR p_vote_alerts) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_EVENT_SELECTION';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.bills WHERE id = p_bill_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BILL_NOT_FOUND';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user_id::TEXT, 0));

  SELECT * INTO v_existing
  FROM public.bill_follows
  WHERE user_id = v_user_id AND bill_id = p_bill_id;

  IF v_existing.id IS NULL OR v_existing.stopped_at IS NOT NULL THEN
    SELECT count(*) INTO v_count
    FROM public.bill_follows
    WHERE user_id = v_user_id AND stopped_at IS NULL;
    IF v_count >= 100 THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'FOLLOW_LIMIT_REACHED';
    END IF;
  END IF;

  INSERT INTO public.bill_alert_preferences (user_id)
  VALUES (v_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.bill_follows (
    user_id, bill_id, committee_alerts, floor_alerts, vote_alerts,
    email_enabled, paused_at, stopped_at
  )
  VALUES (
    v_user_id, p_bill_id, p_committee_alerts, p_floor_alerts, p_vote_alerts,
    TRUE, NULL, NULL
  )
  ON CONFLICT (user_id, bill_id) DO UPDATE SET
    committee_alerts = EXCLUDED.committee_alerts,
    floor_alerts = EXCLUDED.floor_alerts,
    vote_alerts = EXCLUDED.vote_alerts,
    email_enabled = TRUE,
    paused_at = NULL,
    stopped_at = NULL,
    updated_at = NOW()
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_my_bill_follow(
  p_bill_id TEXT,
  p_committee_alerts BOOLEAN,
  p_floor_alerts BOOLEAN,
  p_vote_alerts BOOLEAN,
  p_email_enabled BOOLEAN,
  p_paused BOOLEAN
)
RETURNS public.bill_follows
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := (select auth.uid());
  v_result public.bill_follows%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'AUTH_REQUIRED';
  END IF;
  IF NOT (p_committee_alerts OR p_floor_alerts OR p_vote_alerts) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_EVENT_SELECTION';
  END IF;

  UPDATE public.bill_follows SET
    committee_alerts = p_committee_alerts,
    floor_alerts = p_floor_alerts,
    vote_alerts = p_vote_alerts,
    email_enabled = p_email_enabled,
    paused_at = CASE WHEN p_paused THEN COALESCE(paused_at, NOW()) ELSE NULL END,
    updated_at = NOW()
  WHERE user_id = v_user_id AND bill_id = p_bill_id AND stopped_at IS NULL
  RETURNING * INTO v_result;

  IF v_result.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'FOLLOW_NOT_FOUND';
  END IF;
  PERFORM public.reconcile_bill_alert_follow_outbox(v_result.id);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.stop_bill_follow(p_bill_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := (select auth.uid());
  v_follow_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'AUTH_REQUIRED';
  END IF;

  UPDATE public.bill_follows SET stopped_at = NOW(), paused_at = NULL, updated_at = NOW()
  WHERE user_id = v_user_id AND bill_id = p_bill_id AND stopped_at IS NULL
  RETURNING id INTO v_follow_id;

  IF v_follow_id IS NULL THEN RETURN FALSE; END IF;

  UPDATE public.bill_notification_outbox
  SET status = 'cancelled'
  WHERE follow_id = v_follow_id AND status IN ('pending', 'batched');

  UPDATE public.bill_delivery_batches b
  SET send_status = 'cancelled', claimed_by = NULL, lease_expires_at = NULL
  WHERE b.user_id = v_user_id
    AND b.send_status IN ('building', 'ready', 'retryable', 'claimed')
    AND EXISTS (
      SELECT 1 FROM public.bill_notification_outbox o
      WHERE o.delivery_batch_id = b.id AND o.follow_id = v_follow_id
    );

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_bill_alert_history(
  p_limit INTEGER DEFAULT 50,
  p_before TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  event_id UUID,
  follow_id UUID,
  bill_id TEXT,
  event_type TEXT,
  headline TEXT,
  detail TEXT,
  certainty TEXT,
  occurred_at TIMESTAMPTZ,
  scheduled_for TIMESTAMPTZ,
  scheduled_date DATE,
  scheduled_week_start DATE,
  source_url TEXT,
  source_published_at TIMESTAMPTZ,
  outbox_status TEXT,
  send_status TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    e.id, f.id, e.bill_id, e.event_type, e.headline, e.detail, e.certainty,
    e.occurred_at, e.scheduled_for, e.scheduled_date, e.scheduled_week_start,
    e.source_url, e.source_published_at, o.status, b.send_status, e.created_at
  FROM public.bill_follows f
  JOIN public.bill_notification_outbox o ON o.follow_id = f.id
  JOIN public.bill_events e ON e.id = o.event_id
  LEFT JOIN public.bill_delivery_batches b ON b.id = o.delivery_batch_id
  WHERE f.user_id = (select auth.uid())
    AND e.created_at >= NOW() - INTERVAL '30 days'
    AND (p_before IS NULL OR e.created_at < p_before)
  ORDER BY e.created_at DESC, e.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100)
$$;

-- -----------------------------------------------------------------------------
-- Service-only lease, event, fan-out, queue, and receipt functions
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.acquire_etl_lease(
  p_lease_key TEXT,
  p_holder TEXT,
  p_ttl_seconds INTEGER,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE (holder TEXT, fence_token BIGINT, expires_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  INSERT INTO public.etl_leases AS l (
    lease_key, holder, acquired_at, expires_at, metadata, fence_token
  ) VALUES (
    p_lease_key, p_holder, NOW(),
    NOW() + pg_catalog.make_interval(
      secs => LEAST(GREATEST(COALESCE(p_ttl_seconds, 3600), 15), 86400)
    ),
    COALESCE(p_metadata, '{}'::jsonb), 1
  )
  ON CONFLICT (lease_key) DO UPDATE SET
    holder = EXCLUDED.holder,
    acquired_at = NOW(),
    expires_at = EXCLUDED.expires_at,
    metadata = EXCLUDED.metadata,
    fence_token = l.fence_token + 1
  WHERE l.expires_at <= NOW()
  RETURNING l.holder, l.fence_token, l.expires_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.renew_etl_lease(
  p_lease_key TEXT,
  p_holder TEXT,
  p_fence_token BIGINT,
  p_ttl_seconds INTEGER
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_expires TIMESTAMPTZ;
BEGIN
  UPDATE public.etl_leases
  SET expires_at = NOW()
    + pg_catalog.make_interval(
      secs => LEAST(GREATEST(COALESCE(p_ttl_seconds, 3600), 15), 86400)
    )
  WHERE lease_key = p_lease_key
    AND holder = p_holder
    AND fence_token = p_fence_token
    AND expires_at > NOW()
  RETURNING expires_at INTO v_expires;
  RETURN v_expires;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_etl_lease(
  p_lease_key TEXT,
  p_holder TEXT,
  p_fence_token BIGINT
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH deleted AS (
    DELETE FROM public.etl_leases
    WHERE lease_key = p_lease_key AND holder = p_holder AND fence_token = p_fence_token
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM deleted)
$$;

CREATE OR REPLACE FUNCTION public.begin_bill_alert_source_run(
  p_source_name TEXT,
  p_lease_key TEXT,
  p_holder TEXT,
  p_fence_token BIGINT
)
RETURNS TABLE (run_id UUID, cursor_before TEXT, prior_etag TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_run_id UUID; v_cursor TEXT; v_etag TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.etl_leases l
    WHERE l.lease_key = p_lease_key
      AND l.holder = p_holder
      AND l.fence_token = p_fence_token
      AND l.expires_at > NOW()
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'STALE_ETL_LEASE';
  END IF;

  UPDATE public.bill_alert_source_runs
  SET status = 'failed', completed_at = NOW(), error_code = 'LEASE_EXPIRED'
  WHERE source_name = p_source_name AND status = 'running';

  SELECT s.committed_cursor, s.etag INTO v_cursor, v_etag
  FROM public.bill_alert_source_state s
  WHERE s.source_name = p_source_name;

  INSERT INTO public.bill_alert_source_runs (source_name, cursor_before)
  VALUES (p_source_name, v_cursor)
  RETURNING id INTO v_run_id;

  RETURN QUERY SELECT v_run_id, v_cursor, v_etag;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_bill_alert_source_run(
  p_run_id UUID,
  p_lease_key TEXT,
  p_holder TEXT,
  p_fence_token BIGINT,
  p_cursor_after TEXT,
  p_etag TEXT,
  p_items_observed INTEGER,
  p_unmatched_items INTEGER,
  p_events_recorded INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_source_name TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.etl_leases l
    WHERE l.lease_key = p_lease_key
      AND l.holder = p_holder
      AND l.fence_token = p_fence_token
      AND l.expires_at > NOW()
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'STALE_ETL_LEASE';
  END IF;

  UPDATE public.bill_alert_source_runs
  SET status = CASE WHEN COALESCE(p_unmatched_items, 0) > 0 THEN 'partial' ELSE 'succeeded' END,
      completed_at = NOW(),
      cursor_after = p_cursor_after,
      items_observed = GREATEST(COALESCE(p_items_observed, 0), 0),
      unmatched_items = GREATEST(COALESCE(p_unmatched_items, 0), 0),
      events_recorded = GREATEST(COALESCE(p_events_recorded, 0), 0)
  WHERE id = p_run_id AND status = 'running'
  RETURNING source_name INTO v_source_name;

  IF v_source_name IS NULL THEN RETURN FALSE; END IF;

  INSERT INTO public.bill_alert_source_state (
    source_name, committed_cursor, etag, last_complete_run_id,
    last_succeeded_at, updated_at
  ) VALUES (
    v_source_name, p_cursor_after, p_etag, p_run_id, NOW(), NOW()
  )
  ON CONFLICT (source_name) DO UPDATE SET
    committed_cursor = EXCLUDED.committed_cursor,
    etag = EXCLUDED.etag,
    last_complete_run_id = EXCLUDED.last_complete_run_id,
    last_succeeded_at = EXCLUDED.last_succeeded_at,
    updated_at = NOW();
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_bill_alert_source_run(
  p_run_id UUID,
  p_lease_key TEXT,
  p_holder TEXT,
  p_fence_token BIGINT,
  p_error_code TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_updated UUID;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.etl_leases l
    WHERE l.lease_key = p_lease_key
      AND l.holder = p_holder
      AND l.fence_token = p_fence_token
      AND l.expires_at > NOW()
  ) THEN
    RETURN FALSE;
  END IF;

  UPDATE public.bill_alert_source_runs
  SET status = 'failed', completed_at = NOW(), error_code = left(p_error_code, 120)
  WHERE id = p_run_id AND status = 'running'
  RETURNING id INTO v_updated;
  RETURN v_updated IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.bill_alert_assert_active_lease(
  p_lease_key TEXT,
  p_holder TEXT,
  p_fence_token BIGINT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- The share lock keeps an expired lease from being reassigned until the
  -- caller's mutation commits, making the validation and write one fenced unit.
  PERFORM 1
  FROM public.etl_leases l
  WHERE l.lease_key = p_lease_key
    AND l.holder = p_holder
    AND l.fence_token = p_fence_token
    AND l.expires_at > NOW()
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'STALE_ETL_LEASE';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.bill_alert_assert_source_lease(
  p_run_id UUID,
  p_lease_key TEXT,
  p_holder TEXT,
  p_fence_token BIGINT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_source_name TEXT;
BEGIN
  PERFORM public.bill_alert_assert_active_lease(
    p_lease_key, p_holder, p_fence_token
  );
  SELECT source_name INTO v_source_name
  FROM public.bill_alert_source_runs
  WHERE id = p_run_id AND status = 'running';
  IF v_source_name IS NULL
     OR p_lease_key <> 'bill-alerts:source:' || v_source_name THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'STALE_SOURCE_RUN';
  END IF;
  RETURN v_source_name;
END;
$$;

CREATE OR REPLACE FUNCTION public.persist_bill_alert_unmatched_item(
  p_run_id UUID,
  p_lease_key TEXT,
  p_holder TEXT,
  p_fence_token BIGINT,
  p_item JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_source_name TEXT; v_id UUID;
BEGIN
  v_source_name := public.bill_alert_assert_source_lease(
    p_run_id, p_lease_key, p_holder, p_fence_token
  );
  IF v_source_name <> p_item->>'source_name' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SOURCE_RUN_MISMATCH';
  END IF;

  INSERT INTO public.bill_alert_unmatched_items AS u (
    source_name, upstream_item_id, source_revision, canonical_bill_hint,
    source_url, payload, last_seen_at
  ) VALUES (
    v_source_name, p_item->>'upstream_item_id', p_item->>'source_revision',
    NULLIF(p_item->>'canonical_bill_hint', ''), p_item->>'source_url',
    p_item->'payload', NOW()
  )
  ON CONFLICT (source_name, upstream_item_id, source_revision) DO UPDATE SET
    canonical_bill_hint = EXCLUDED.canonical_bill_hint,
    source_url = EXCLUDED.source_url,
    payload = EXCLUDED.payload,
    last_seen_at = NOW()
  RETURNING u.id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_bill_alert_unmatched_item(
  p_run_id UUID,
  p_lease_key TEXT,
  p_holder TEXT,
  p_fence_token BIGINT,
  p_item_id UUID,
  p_bill_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_source_name TEXT; v_id UUID;
BEGIN
  v_source_name := public.bill_alert_assert_source_lease(
    p_run_id, p_lease_key, p_holder, p_fence_token
  );
  UPDATE public.bill_alert_unmatched_items
  SET resolved_bill_id = p_bill_id, resolved_at = NOW(), replayed_at = NOW()
  WHERE id = p_item_id AND source_name = v_source_name AND resolved_at IS NULL
  RETURNING id INTO v_id;
  RETURN v_id IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.persist_bill_alert_observation(
  p_run_id UUID,
  p_lease_key TEXT,
  p_holder TEXT,
  p_fence_token BIGINT,
  p_observation JSONB,
  p_event JSONB DEFAULT NULL
)
RETURNS TABLE (event_id UUID, inserted BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_source_name TEXT;
  v_source_item_id UUID;
  v_source_payload_id UUID;
  v_existing_payload_hash TEXT;
  v_mode TEXT;
  v_event_id UUID;
BEGIN
  v_source_name := public.bill_alert_assert_source_lease(
    p_run_id, p_lease_key, p_holder, p_fence_token
  );
  IF v_source_name <> p_observation->>'source_name' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SOURCE_RUN_MISMATCH';
  END IF;

  INSERT INTO public.bill_source_items AS si (
    source_name, upstream_item_id, bill_id, source_status, content_hash,
    source_url, source_updated_at, last_seen_at, last_seen_run_id,
    missing_observation_count
  ) VALUES (
    v_source_name, p_observation->>'upstream_item_id', p_observation->>'bill_id',
    NULLIF(p_observation->>'source_status', ''), p_observation->>'item_content_hash',
    p_observation->>'source_url',
    NULLIF(p_observation->>'source_updated_at', '')::TIMESTAMPTZ,
    NOW(), p_run_id, 0
  )
  ON CONFLICT (source_name, upstream_item_id, bill_id) DO UPDATE SET
    source_status = EXCLUDED.source_status,
    content_hash = EXCLUDED.content_hash,
    source_url = EXCLUDED.source_url,
    source_updated_at = EXCLUDED.source_updated_at,
    last_seen_at = NOW(),
    last_seen_run_id = p_run_id,
    missing_observation_count = 0
  RETURNING si.id INTO v_source_item_id;

  INSERT INTO public.bill_source_payloads AS sp (
    source_item_id, source_revision, content_hash, payload, expires_at
  ) VALUES (
    v_source_item_id, p_observation->>'source_revision',
    p_observation->>'payload_content_hash', p_observation->'payload',
    NOW() + INTERVAL '90 days'
  )
  ON CONFLICT (source_item_id, source_revision) DO NOTHING
  RETURNING sp.id INTO v_source_payload_id;

  IF v_source_payload_id IS NULL THEN
    SELECT id, content_hash INTO v_source_payload_id, v_existing_payload_hash
    FROM public.bill_source_payloads
    WHERE source_item_id = v_source_item_id
      AND source_revision = p_observation->>'source_revision';
    IF v_existing_payload_hash IS DISTINCT FROM p_observation->>'payload_content_hash' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SOURCE_REVISION_REUSED';
    END IF;
  END IF;

  IF p_event IS NULL THEN
    RETURN QUERY SELECT NULL::UUID, FALSE;
    RETURN;
  END IF;
  IF p_event->>'bill_id' IS DISTINCT FROM p_observation->>'bill_id'
     OR p_event->>'evidence_content_hash' IS DISTINCT FROM p_observation->>'payload_content_hash' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_EVENT_EVIDENCE';
  END IF;

  SELECT mode INTO v_mode FROM public.bill_alert_runtime_settings WHERE singleton;
  IF COALESCE(v_mode, 'off') = 'off' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BILL_ALERTS_DISABLED';
  END IF;

  INSERT INTO public.bill_events (
    event_key, event_key_version, source_item_id, source_payload_id,
    evidence_content_hash, bill_id, event_series_key, is_correction, supersedes_event_id,
    event_type, headline, detail, chamber, committee_code, occurred_at,
    scheduled_for, scheduled_date, scheduled_week_start, source_timezone,
    time_precision, source_url, source_published_at, certainty
  ) VALUES (
    p_event->>'event_key', COALESCE((p_event->>'event_key_version')::SMALLINT, 1),
    v_source_item_id, v_source_payload_id, p_event->>'evidence_content_hash',
    p_event->>'bill_id', NULLIF(p_event->>'event_series_key', ''),
    COALESCE((p_event->>'is_correction')::BOOLEAN, FALSE),
    NULLIF(p_event->>'supersedes_event_id', '')::UUID,
    p_event->>'event_type', p_event->>'headline', NULLIF(p_event->>'detail', ''),
    NULLIF(p_event->>'chamber', ''), NULLIF(p_event->>'committee_code', ''),
    NULLIF(p_event->>'occurred_at', '')::TIMESTAMPTZ,
    NULLIF(p_event->>'scheduled_for', '')::TIMESTAMPTZ,
    NULLIF(p_event->>'scheduled_date', '')::DATE,
    NULLIF(p_event->>'scheduled_week_start', '')::DATE,
    NULLIF(p_event->>'source_timezone', ''), COALESCE(p_event->>'time_precision', 'unknown'),
    p_event->>'source_url', NULLIF(p_event->>'source_published_at', '')::TIMESTAMPTZ,
    p_event->>'certainty'
  )
  ON CONFLICT (event_key) DO NOTHING
  RETURNING id INTO v_event_id;

  IF v_event_id IS NULL THEN
    SELECT id INTO v_event_id FROM public.bill_events
    WHERE event_key = p_event->>'event_key';
    RETURN QUERY SELECT v_event_id, FALSE;
    RETURN;
  END IF;

  IF v_mode IN ('internal', 'public') THEN
    INSERT INTO public.bill_alert_fanout_progress (event_id) VALUES (v_event_id)
    ON CONFLICT (event_id) DO NOTHING;
  END IF;
  RETURN QUERY SELECT v_event_id, TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.fan_out_bill_event(
  p_event_id UUID,
  p_lease_key TEXT,
  p_holder TEXT,
  p_fence_token BIGINT,
  p_limit INTEGER DEFAULT 1000
)
RETURNS TABLE (selected_count INTEGER, completed BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event public.bill_events%ROWTYPE;
  v_last UUID;
  v_last_created_at TIMESTAMPTZ;
  v_complete TIMESTAMPTZ;
  v_mode TEXT;
  v_senate_enabled BOOLEAN;
  v_count INTEGER := 0;
  v_max UUID;
BEGIN
  PERFORM public.bill_alert_assert_active_lease(
    p_lease_key, p_holder, p_fence_token
  );
  SELECT * INTO v_event FROM public.bill_events WHERE id = p_event_id;
  IF v_event.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'EVENT_NOT_FOUND';
  END IF;

  SELECT last_follow_created_at, last_follow_id, completed_at
  INTO v_last_created_at, v_last, v_complete
  FROM public.bill_alert_fanout_progress WHERE event_id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 0, TRUE;
    RETURN;
  END IF;
  IF v_complete IS NOT NULL THEN RETURN QUERY SELECT 0, TRUE; RETURN; END IF;

  SELECT mode, senate_future_enabled INTO v_mode, v_senate_enabled
  FROM public.bill_alert_runtime_settings WHERE singleton;
  IF v_mode NOT IN ('internal', 'public')
     OR (v_event.event_type = 'senate_floor_attention' AND NOT v_senate_enabled) THEN
    UPDATE public.bill_alert_fanout_progress SET completed_at = NOW(), updated_at = NOW()
    WHERE event_id = p_event_id;
    RETURN QUERY SELECT 0, TRUE;
    RETURN;
  END IF;

  WITH eligible AS MATERIALIZED (
    SELECT f.id, f.user_id
    FROM public.bill_follows f
    JOIN public.bill_alert_preferences p ON p.user_id = f.user_id
    WHERE f.bill_id = v_event.bill_id
      -- Stable keyset cursor: UUID order alone is not creation order.
      AND (
        v_last_created_at IS NULL
        OR (f.created_at, f.id) > (v_last_created_at, v_last)
      )
      -- Baseline against the official occurrence/publication time, not when our
      -- crawler inserted the row. A newly-followed bill never emits old facts.
      AND f.created_at <= CASE
        -- Date-only actions use a synthetic noon occurred_at. Prefer the exact
        -- publication/update timestamp so a follow created earlier that same
        -- day is not incorrectly treated as newer than the official action.
        WHEN v_event.time_precision <> 'exact'
          THEN COALESCE(
            v_event.source_published_at, v_event.occurred_at, v_event.created_at
          )
        ELSE COALESCE(
          NULLIF(
            LEAST(
              COALESCE(v_event.occurred_at, 'infinity'::TIMESTAMPTZ),
              COALESCE(v_event.source_published_at, 'infinity'::TIMESTAMPTZ)
            ),
            'infinity'::TIMESTAMPTZ
          ),
          v_event.created_at
        )
      END
      AND f.stopped_at IS NULL AND f.paused_at IS NULL AND f.email_enabled
      AND p.email_enabled AND p.suppressed_at IS NULL
      AND (
        public.bill_alert_category_enabled(
          v_event.event_type, f.committee_alerts, f.floor_alerts, f.vote_alerts
        )
      )
      AND (
        v_mode = 'public'
        OR EXISTS (SELECT 1 FROM public.bill_alert_internal_users i WHERE i.user_id = f.user_id)
      )
      -- Corrections are only sent to people for whom the original event has a
      -- provider-confirmed delivery receipt.
      AND (
        NOT v_event.is_correction
        OR EXISTS (
          SELECT 1
          FROM public.bill_alert_delivery_receipts r
          WHERE r.follow_id = f.id
            AND r.event_series_key = v_event.event_series_key
        )
      )
    ORDER BY f.created_at, f.id
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 1000), 1), 5000)
  ), inserted_rows AS (
    INSERT INTO public.bill_notification_outbox (event_id, follow_id, user_id)
    SELECT p_event_id, id, user_id FROM eligible
    ON CONFLICT (event_id, follow_id, channel) DO NOTHING
    RETURNING 1
  )
  SELECT count(*)::INTEGER,
         (array_agg(id ORDER BY created_at DESC, id DESC))[1],
         max(created_at)
  INTO v_count, v_max, v_last_created_at
  FROM eligible;

  UPDATE public.bill_alert_fanout_progress SET
    last_follow_created_at = COALESCE(v_last_created_at, last_follow_created_at),
    last_follow_id = COALESCE(v_max, last_follow_id),
    completed_at = CASE WHEN v_count < LEAST(GREATEST(COALESCE(p_limit, 1000), 1), 5000)
      THEN NOW() ELSE NULL END,
    updated_at = NOW()
  WHERE event_id = p_event_id;

  RETURN QUERY SELECT v_count, v_count < LEAST(GREATEST(COALESCE(p_limit, 1000), 1), 5000);
END;
$$;

CREATE OR REPLACE FUNCTION public.build_bill_delivery_batches(p_limit INTEGER DEFAULT 100)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_group RECORD;
  v_batch_id UUID;
  v_batched INTEGER;
  v_created INTEGER := 0;
BEGIN
  FOR v_group IN
    SELECT o.user_id, e.bill_id, min(o.created_at) AS oldest
    FROM public.bill_notification_outbox o
    JOIN public.bill_events e ON e.id = o.event_id
    WHERE o.status = 'pending' AND o.created_at <= NOW() - INTERVAL '5 minutes'
    GROUP BY o.user_id, e.bill_id
    ORDER BY oldest
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500)
  LOOP
    v_batch_id := NULL;
    -- Two builders can discover the same group. Serialize only that user/bill
    -- pair, then reuse its single building batch if one already exists.
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_group.user_id::TEXT || ':' || v_group.bill_id, 0)
    );

    INSERT INTO public.bill_delivery_batches (user_id, bill_id)
    VALUES (v_group.user_id, v_group.bill_id)
    ON CONFLICT (user_id, bill_id) WHERE send_status = 'building' DO NOTHING
    RETURNING id INTO v_batch_id;

    IF v_batch_id IS NULL THEN
      SELECT id INTO v_batch_id
      FROM public.bill_delivery_batches
      WHERE user_id = v_group.user_id
        AND bill_id = v_group.bill_id
        AND send_status = 'building'
      FOR UPDATE;
    END IF;

    UPDATE public.bill_notification_outbox o SET
      status = 'batched', delivery_batch_id = v_batch_id
    FROM public.bill_events e
    WHERE o.event_id = e.id
      AND o.user_id = v_group.user_id
      AND e.bill_id = v_group.bill_id
      AND o.status = 'pending';
    GET DIAGNOSTICS v_batched = ROW_COUNT;
    IF v_batched > 0 THEN
      v_created := v_created + 1;
    ELSE
      DELETE FROM public.bill_delivery_batches b
      WHERE b.id = v_batch_id
        AND b.send_status = 'building'
        AND NOT EXISTS (
          SELECT 1 FROM public.bill_notification_outbox o
          WHERE o.delivery_batch_id = b.id
        );
    END IF;
  END LOOP;
  RETURN v_created;
END;
$$;

CREATE OR REPLACE FUNCTION public.freeze_bill_delivery_batch(
  p_batch_id UUID,
  p_recipient_email TEXT,
  p_recipient_confirmed_at TIMESTAMPTZ,
  p_recipient_fingerprint TEXT,
  p_from TEXT,
  p_subject TEXT,
  p_html TEXT,
  p_text TEXT,
  p_headers JSONB,
  p_payload_hash TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_updated UUID;
BEGIN
  UPDATE public.bill_delivery_batches b SET
    recipient_email = p_recipient_email,
    recipient_confirmed_at = p_recipient_confirmed_at,
    recipient_fingerprint = p_recipient_fingerprint,
    from_snapshot = p_from,
    subject_snapshot = p_subject,
    html_snapshot = p_html,
    text_snapshot = p_text,
    headers_snapshot = COALESCE(p_headers, '{}'::jsonb),
    payload_hash = p_payload_hash,
    send_status = 'ready',
    next_attempt_at = NOW()
  WHERE b.id = p_batch_id AND b.send_status = 'building'
    AND EXISTS (
      SELECT 1 FROM public.bill_alert_preferences p
      WHERE p.user_id = b.user_id AND p.email_enabled AND p.suppressed_at IS NULL
    )
    AND EXISTS (
      SELECT 1 FROM public.bill_notification_outbox o
      JOIN public.bill_follows f ON f.id = o.follow_id
      JOIN public.bill_events e ON e.id = o.event_id
      WHERE o.delivery_batch_id = b.id AND o.status = 'batched'
        AND f.stopped_at IS NULL AND f.paused_at IS NULL AND f.email_enabled
        AND public.bill_alert_category_enabled(
          e.event_type, f.committee_alerts, f.floor_alerts, f.vote_alerts
        )
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.bill_notification_outbox o
      JOIN public.bill_follows f ON f.id = o.follow_id
      JOIN public.bill_events e ON e.id = o.event_id
      WHERE o.delivery_batch_id = b.id AND o.status = 'batched'
        AND NOT (
          f.stopped_at IS NULL AND f.paused_at IS NULL AND f.email_enabled
          AND public.bill_alert_category_enabled(
            e.event_type, f.committee_alerts, f.floor_alerts, f.vote_alerts
          )
        )
    )
  RETURNING b.id INTO v_updated;
  RETURN v_updated IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_bill_delivery_batch(
  p_batch_id UUID,
  p_error_code TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_updated UUID;
BEGIN
  UPDATE public.bill_delivery_batches
  SET send_status = 'cancelled',
      last_error_code = left(p_error_code, 120),
      claimed_by = NULL,
      claimed_at = NULL,
      lease_expires_at = NULL
  WHERE id = p_batch_id
    AND send_status IN ('building', 'ready', 'retryable', 'claimed')
  RETURNING id INTO v_updated;

  IF v_updated IS NULL THEN RETURN FALSE; END IF;
  IF p_error_code = 'PREFERENCE_CHANGED' THEN
    UPDATE public.bill_notification_outbox o
    SET status = 'pending', delivery_batch_id = NULL
    WHERE o.delivery_batch_id = p_batch_id
      AND o.status = 'batched'
      AND EXISTS (
        SELECT 1
        FROM public.bill_follows f
        JOIN public.bill_alert_preferences p ON p.user_id = f.user_id
        JOIN public.bill_events e ON e.id = o.event_id
        WHERE f.id = o.follow_id
          AND f.stopped_at IS NULL
          AND f.paused_at IS NULL
          AND f.email_enabled
          AND p.email_enabled
          AND p.suppressed_at IS NULL
          AND public.bill_alert_category_enabled(
            e.event_type, f.committee_alerts, f.floor_alerts, f.vote_alerts
          )
      );
  END IF;

  UPDATE public.bill_notification_outbox
  SET status = 'cancelled'
  WHERE delivery_batch_id = p_batch_id AND status IN ('pending', 'batched');
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_bill_alert_delivery_batches(
  p_limit INTEGER,
  p_worker_id TEXT,
  p_lease_seconds INTEGER DEFAULT 120
)
RETURNS SETOF public.bill_delivery_batches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_mode TEXT;
BEGIN
  SELECT mode INTO v_mode
  FROM public.bill_alert_runtime_settings
  WHERE singleton;

  IF v_mode NOT IN ('internal', 'public') THEN
    RETURN;
  END IF;

  -- Re-check current consent immediately before claiming. Stopping a follow,
  -- pausing it, disabling all email, or a provider suppression all cancel work
  -- that has not already entered an active network attempt.
  UPDATE public.bill_delivery_batches b
  SET send_status = 'cancelled',
      last_error_code = 'PREFERENCE_CHANGED',
      claimed_by = NULL,
      claimed_at = NULL,
      lease_expires_at = NULL
  WHERE (
      b.send_status IN ('ready', 'retryable')
      OR (b.send_status = 'claimed' AND b.lease_expires_at <= NOW())
    )
    AND (
      NOT EXISTS (
        SELECT 1 FROM public.bill_alert_preferences p
        WHERE p.user_id = b.user_id
          AND p.email_enabled
          AND p.suppressed_at IS NULL
      )
      OR NOT EXISTS (
        SELECT 1
        FROM public.bill_notification_outbox o
        JOIN public.bill_follows f ON f.id = o.follow_id
        JOIN public.bill_events e ON e.id = o.event_id
        WHERE o.delivery_batch_id = b.id
          AND o.status = 'batched'
          AND f.stopped_at IS NULL
          AND f.paused_at IS NULL
          AND f.email_enabled
          AND public.bill_alert_category_enabled(
            e.event_type, f.committee_alerts, f.floor_alerts, f.vote_alerts
          )
      )
      OR EXISTS (
        SELECT 1
        FROM public.bill_notification_outbox o
        JOIN public.bill_follows f ON f.id = o.follow_id
        JOIN public.bill_events e ON e.id = o.event_id
        WHERE o.delivery_batch_id = b.id
          AND o.status = 'batched'
          AND NOT (
            f.stopped_at IS NULL
            AND f.paused_at IS NULL
            AND f.email_enabled
            AND public.bill_alert_category_enabled(
              e.event_type, f.committee_alerts, f.floor_alerts, f.vote_alerts
            )
          )
      )
    );

  UPDATE public.bill_notification_outbox o
  SET status = 'pending', delivery_batch_id = NULL
  FROM public.bill_delivery_batches b,
       public.bill_follows f,
       public.bill_alert_preferences p,
       public.bill_events e
  WHERE o.delivery_batch_id = b.id
    AND o.follow_id = f.id
    AND p.user_id = f.user_id
    AND e.id = o.event_id
    AND o.status = 'batched'
    AND b.send_status = 'cancelled'
    AND b.last_error_code = 'PREFERENCE_CHANGED'
    AND f.stopped_at IS NULL
    AND f.paused_at IS NULL
    AND f.email_enabled
    AND p.email_enabled
    AND p.suppressed_at IS NULL
    AND public.bill_alert_category_enabled(
      e.event_type, f.committee_alerts, f.floor_alerts, f.vote_alerts
    );

  UPDATE public.bill_notification_outbox o
  SET status = 'cancelled'
  FROM public.bill_delivery_batches b
  WHERE o.delivery_batch_id = b.id
    AND o.status = 'batched'
    AND b.send_status = 'cancelled'
    AND b.last_error_code = 'PREFERENCE_CHANGED';

  -- If a provider request remained ambiguous beyond Resend's 24-hour
  -- idempotency window, never send it again automatically.
  UPDATE public.bill_delivery_batches
  SET send_status = 'ambiguous',
      claimed_by = NULL,
      claimed_at = NULL,
      lease_expires_at = NULL,
      last_error_code = COALESCE(last_error_code, 'IDEMPOTENCY_WINDOW_EXPIRED')
  WHERE send_status = 'claimed'
    AND lease_expires_at <= NOW()
    AND provider_first_attempt_at <= NOW() - INTERVAL '23 hours';

  UPDATE public.bill_notification_outbox o
  SET status = 'dead'
  FROM public.bill_delivery_batches b
  WHERE o.delivery_batch_id = b.id
    AND o.status = 'batched'
    AND b.send_status = 'ambiguous'
    AND b.last_error_code = 'IDEMPOTENCY_WINDOW_EXPIRED';

  RETURN QUERY
  WITH candidates AS (
    SELECT id
    FROM public.bill_delivery_batches
    WHERE (
      (send_status IN ('ready', 'retryable') AND next_attempt_at <= NOW())
      OR (
        send_status = 'claimed'
        AND lease_expires_at <= NOW()
        AND provider_first_attempt_at > NOW() - INTERVAL '23 hours'
      )
    )
      AND (
        v_mode = 'public'
        OR EXISTS (
          SELECT 1 FROM public.bill_alert_internal_users i
          WHERE i.user_id = bill_delivery_batches.user_id
        )
      )
    ORDER BY next_attempt_at, created_at
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100)
  )
  UPDATE public.bill_delivery_batches b SET
    send_status = 'claimed',
    claimed_by = p_worker_id,
    claim_fence = b.claim_fence + 1,
    claimed_at = NOW(),
    lease_expires_at = NOW() + pg_catalog.make_interval(
      secs => LEAST(GREATEST(COALESCE(p_lease_seconds, 120), 15), 900)
    ),
    attempt_count = b.attempt_count + 1,
    provider_first_attempt_at = COALESCE(b.provider_first_attempt_at, NOW()),
    provider_last_attempt_at = NOW()
  FROM candidates c
  WHERE b.id = c.id
  RETURNING b.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_bill_alert_delivery_batch(
  p_batch_id UUID,
  p_worker_id TEXT,
  p_claim_fence BIGINT,
  p_outcome TEXT,
  p_provider_message_id TEXT DEFAULT NULL,
  p_error_code TEXT DEFAULT NULL,
  p_next_attempt_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_status TEXT; v_updated UUID;
BEGIN
  v_status := CASE p_outcome
    WHEN 'accepted' THEN 'accepted'
    WHEN 'retryable' THEN 'retryable'
    WHEN 'permanently_failed' THEN 'permanently_failed'
    WHEN 'ambiguous' THEN 'ambiguous'
    WHEN 'cancelled' THEN 'cancelled'
    ELSE NULL
  END;
  IF v_status IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_DELIVERY_OUTCOME';
  END IF;

  UPDATE public.bill_delivery_batches SET
    send_status = v_status,
    provider_message_id = COALESCE(p_provider_message_id, provider_message_id),
    last_error_code = p_error_code,
    next_attempt_at = CASE WHEN v_status = 'retryable'
      THEN COALESCE(p_next_attempt_at, NOW() + INTERVAL '5 minutes') ELSE next_attempt_at END,
    accepted_at = CASE WHEN v_status = 'accepted' THEN NOW() ELSE accepted_at END,
    claimed_by = NULL,
    claimed_at = NULL,
    lease_expires_at = NULL
  WHERE id = p_batch_id
    AND send_status = 'claimed'
    AND claimed_by = p_worker_id
    AND claim_fence = p_claim_fence
    AND lease_expires_at > NOW()
  RETURNING id INTO v_updated;

  IF v_updated IS NULL THEN RETURN FALSE; END IF;

  UPDATE public.bill_notification_outbox SET
    status = CASE
      WHEN v_status = 'accepted' THEN 'sent'
      WHEN v_status IN ('permanently_failed', 'ambiguous') THEN 'dead'
      WHEN v_status = 'cancelled' THEN 'cancelled'
      ELSE status
    END,
    sent_at = CASE WHEN v_status = 'accepted' THEN NOW() ELSE sent_at END
  WHERE delivery_batch_id = p_batch_id;
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_bill_email_provider_event(
  p_provider_event_id TEXT,
  p_event_type TEXT,
  p_provider_message_id TEXT,
  p_delivery_id UUID,
  p_occurred_at TIMESTAMPTZ,
  p_payload JSONB DEFAULT '{}'::jsonb
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_batch_id UUID; v_user_id UUID; v_inserted TEXT;
BEGIN
  SELECT b.id, b.user_id INTO v_batch_id, v_user_id
  FROM public.bill_delivery_batches b
  WHERE (p_provider_message_id IS NOT NULL AND b.provider_message_id = p_provider_message_id)
     OR (p_delivery_id IS NOT NULL AND b.id = p_delivery_id)
  ORDER BY CASE WHEN b.provider_message_id = p_provider_message_id THEN 0 ELSE 1 END
  LIMIT 1;

  INSERT INTO public.bill_email_provider_events (
    provider_event_id, delivery_batch_id, provider_message_id,
    event_type, occurred_at, payload
  ) VALUES (
    p_provider_event_id, v_batch_id, p_provider_message_id,
    p_event_type, p_occurred_at, COALESCE(p_payload, '{}'::jsonb)
  )
  ON CONFLICT (provider_event_id) DO NOTHING
  RETURNING provider_event_id INTO v_inserted;
  IF v_inserted IS NULL THEN RETURN FALSE; END IF;

  IF p_event_type = 'email.delivered' AND v_batch_id IS NOT NULL THEN
    INSERT INTO public.bill_alert_delivery_receipts (
      original_event_id, follow_id, event_series_key, delivered_at, retain_until
    )
    SELECT e.id, o.follow_id, e.event_series_key, COALESCE(p_occurred_at, NOW()),
           COALESCE(p_occurred_at, NOW()) + INTERVAL '180 days'
    FROM public.bill_notification_outbox o
    JOIN public.bill_events e ON e.id = o.event_id
    JOIN public.bill_follows f ON f.id = o.follow_id
    WHERE o.delivery_batch_id = v_batch_id
      AND e.event_series_key IS NOT NULL
      AND f.stopped_at IS NULL
    ON CONFLICT DO NOTHING;

    -- A correction may have been observed before this provider-confirmed
    -- receipt arrived. Rewind its idempotent fan-out so this newly eligible
    -- recipient is considered on the next scheduled sweep.
    UPDATE public.bill_alert_fanout_progress fp
    SET last_follow_created_at = NULL,
        last_follow_id = NULL,
        completed_at = NULL,
        updated_at = NOW()
    FROM public.bill_events correction
    WHERE fp.event_id = correction.id
      AND correction.is_correction
      AND correction.event_series_key IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.bill_notification_outbox original_outbox
        JOIN public.bill_events original_event
          ON original_event.id = original_outbox.event_id
        WHERE original_outbox.delivery_batch_id = v_batch_id
          AND original_event.event_series_key = correction.event_series_key
      );
  END IF;

  IF p_event_type IN ('email.bounced', 'email.complained', 'email.suppressed')
     AND v_user_id IS NOT NULL THEN
    UPDATE public.bill_alert_preferences SET
      suppressed_at = COALESCE(suppressed_at, NOW()),
      suppression_reason = p_event_type,
      updated_at = NOW()
    WHERE user_id = v_user_id;
  END IF;
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.purge_expired_bill_alert_data()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_payloads INTEGER;
  v_outbox INTEGER;
  v_batches INTEGER;
  v_receipts INTEGER;
  v_provider_events INTEGER;
BEGIN
  DELETE FROM public.bill_source_payloads WHERE expires_at <= NOW();
  GET DIAGNOSTICS v_payloads = ROW_COUNT;

  DELETE FROM public.bill_notification_outbox
  WHERE created_at < NOW() - INTERVAL '31 days';
  GET DIAGNOSTICS v_outbox = ROW_COUNT;

  DELETE FROM public.bill_delivery_batches
  WHERE created_at < NOW() - INTERVAL '31 days'
    AND send_status IN ('accepted', 'permanently_failed', 'ambiguous', 'cancelled');
  GET DIAGNOSTICS v_batches = ROW_COUNT;

  DELETE FROM public.bill_email_provider_events
  WHERE received_at < NOW() - INTERVAL '90 days';
  GET DIAGNOSTICS v_provider_events = ROW_COUNT;

  DELETE FROM public.bill_alert_delivery_receipts
  WHERE retain_until IS NOT NULL AND retain_until <= NOW();
  GET DIAGNOSTICS v_receipts = ROW_COUNT;

  RETURN jsonb_build_object(
    'source_payloads', v_payloads,
    'outbox', v_outbox,
    'delivery_batches', v_batches,
    'provider_events', v_provider_events,
    'delivery_receipts', v_receipts
  );
END;
$$;

-- Function execution is opt-in. Owner RPCs derive auth.uid(); pipeline RPCs
-- are service-only and never accept browser-selected identities or recipients.
REVOKE EXECUTE ON FUNCTION public.set_my_bill_alert_email_enabled(BOOLEAN) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.start_or_resume_bill_follow(TEXT, BOOLEAN, BOOLEAN, BOOLEAN) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_my_bill_follow(TEXT, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.stop_bill_follow(TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_my_bill_alert_history(INTEGER, TIMESTAMPTZ) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.bill_alert_category_enabled(TEXT, BOOLEAN, BOOLEAN, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reconcile_bill_alert_follow_outbox(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_my_bill_alert_email_enabled(BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_or_resume_bill_follow(TEXT, BOOLEAN, BOOLEAN, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_my_bill_follow(TEXT, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stop_bill_follow(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_bill_alert_history(INTEGER, TIMESTAMPTZ) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.acquire_etl_lease(TEXT, TEXT, INTEGER, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.renew_etl_lease(TEXT, TEXT, BIGINT, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_etl_lease(TEXT, TEXT, BIGINT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.begin_bill_alert_source_run(TEXT, TEXT, TEXT, BIGINT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.complete_bill_alert_source_run(UUID, TEXT, TEXT, BIGINT, TEXT, TEXT, INTEGER, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fail_bill_alert_source_run(UUID, TEXT, TEXT, BIGINT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bill_alert_assert_active_lease(TEXT, TEXT, BIGINT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bill_alert_assert_source_lease(UUID, TEXT, TEXT, BIGINT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.persist_bill_alert_unmatched_item(UUID, TEXT, TEXT, BIGINT, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.resolve_bill_alert_unmatched_item(UUID, TEXT, TEXT, BIGINT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.persist_bill_alert_observation(UUID, TEXT, TEXT, BIGINT, JSONB, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fan_out_bill_event(UUID, TEXT, TEXT, BIGINT, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.build_bill_delivery_batches(INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.freeze_bill_delivery_batch(UUID, TEXT, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cancel_bill_delivery_batch(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_bill_alert_delivery_batches(INTEGER, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.complete_bill_alert_delivery_batch(UUID, TEXT, BIGINT, TEXT, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_bill_email_provider_event(TEXT, TEXT, TEXT, UUID, TIMESTAMPTZ, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.purge_expired_bill_alert_data() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.acquire_etl_lease(TEXT, TEXT, INTEGER, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.renew_etl_lease(TEXT, TEXT, BIGINT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_etl_lease(TEXT, TEXT, BIGINT) TO service_role;
GRANT EXECUTE ON FUNCTION public.begin_bill_alert_source_run(TEXT, TEXT, TEXT, BIGINT) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_bill_alert_source_run(UUID, TEXT, TEXT, BIGINT, TEXT, TEXT, INTEGER, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_bill_alert_source_run(UUID, TEXT, TEXT, BIGINT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.bill_alert_assert_active_lease(TEXT, TEXT, BIGINT) TO service_role;
GRANT EXECUTE ON FUNCTION public.bill_alert_assert_source_lease(UUID, TEXT, TEXT, BIGINT) TO service_role;
GRANT EXECUTE ON FUNCTION public.persist_bill_alert_unmatched_item(UUID, TEXT, TEXT, BIGINT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_bill_alert_unmatched_item(UUID, TEXT, TEXT, BIGINT, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.persist_bill_alert_observation(UUID, TEXT, TEXT, BIGINT, JSONB, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.fan_out_bill_event(UUID, TEXT, TEXT, BIGINT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.build_bill_delivery_batches(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.freeze_bill_delivery_batch(UUID, TEXT, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_bill_delivery_batch(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_bill_alert_delivery_batches(INTEGER, TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_bill_alert_delivery_batch(UUID, TEXT, BIGINT, TEXT, TEXT, TEXT, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_bill_email_provider_event(TEXT, TEXT, TEXT, UUID, TIMESTAMPTZ, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_expired_bill_alert_data() TO service_role;

NOTIFY pgrst, 'reload schema';
