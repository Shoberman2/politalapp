-- Repair two production alert functions that Postgres lint identified as
-- invalid at execution time. Both changes preserve the existing behavior:
-- qualify the progress-table conflict target, and carry the follow timestamp
-- through the keyset CTE that already orders and aggregates by it.

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
    ON CONFLICT ON CONSTRAINT bill_alert_fanout_progress_pkey DO NOTHING;
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
    SELECT f.id, f.user_id, f.created_at
    FROM public.bill_follows f
    JOIN public.bill_alert_preferences p ON p.user_id = f.user_id
    WHERE f.bill_id = v_event.bill_id
      AND (
        v_last_created_at IS NULL
        OR (f.created_at, f.id) > (v_last_created_at, v_last)
      )
      AND f.created_at <= CASE
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
      AND public.bill_alert_category_enabled(
        v_event.event_type, f.committee_alerts, f.floor_alerts, f.vote_alerts
      )
      AND (
        v_mode = 'public'
        OR EXISTS (
          SELECT 1 FROM public.bill_alert_internal_users i WHERE i.user_id = f.user_id
        )
      )
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
    completed_at = CASE
      WHEN v_count < LEAST(GREATEST(COALESCE(p_limit, 1000), 1), 5000)
        THEN NOW()
      ELSE NULL
    END,
    updated_at = NOW()
  WHERE event_id = p_event_id;

  RETURN QUERY SELECT
    v_count,
    v_count < LEAST(GREATEST(COALESCE(p_limit, 1000), 1), 5000);
END;
$$;
