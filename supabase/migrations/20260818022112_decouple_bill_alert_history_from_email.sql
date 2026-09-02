-- In-app watchlists are a product surface of their own. Persist their event
-- fan-out independently so source polling and pause/resume semantics never
-- depend on whether email delivery is enabled.
CREATE TABLE public.bill_in_app_notifications (
  event_id UUID NOT NULL REFERENCES public.bill_events(id) ON DELETE CASCADE,
  follow_id UUID NOT NULL REFERENCES public.bill_follows(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (event_id, follow_id)
);

CREATE INDEX bill_in_app_notifications_user_created_idx
  ON public.bill_in_app_notifications (user_id, created_at DESC, event_id DESC);

ALTER TABLE public.bill_in_app_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No public API access" ON public.bill_in_app_notifications
  FOR ALL TO public USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public.bill_in_app_notifications FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.bill_in_app_notifications TO service_role;

-- Keep a new in-app follow out of the email-eligible set for the entire
-- transaction. Calling the older RPC and disabling email in a second request
-- creates a small but real race with the alert worker.
CREATE OR REPLACE FUNCTION public.start_or_resume_bill_follow_in_app(
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
  v_result public.bill_follows%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'AUTH_REQUIRED';
  END IF;

  v_result := public.start_or_resume_bill_follow(
    p_bill_id, p_committee_alerts, p_floor_alerts, p_vote_alerts
  );

  UPDATE public.bill_follows
  SET email_enabled = FALSE, updated_at = NOW()
  WHERE id = v_result.id AND user_id = v_user_id
  RETURNING * INTO v_result;

  PERFORM public.reconcile_bill_alert_follow_outbox(v_result.id);
  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.start_or_resume_bill_follow_in_app(TEXT, BOOLEAN, BOOLEAN, BOOLEAN)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_or_resume_bill_follow_in_app(TEXT, BOOLEAN, BOOLEAN, BOOLEAN)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.fan_out_bill_event_in_app(
  p_event_id UUID,
  p_lease_key TEXT,
  p_holder TEXT,
  p_fence_token BIGINT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event public.bill_events%ROWTYPE;
  v_count INTEGER := 0;
BEGIN
  PERFORM public.bill_alert_assert_active_lease(
    p_lease_key, p_holder, p_fence_token
  );

  SELECT * INTO v_event
  FROM public.bill_events
  WHERE id = p_event_id;

  IF v_event.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'EVENT_NOT_FOUND';
  END IF;

  INSERT INTO public.bill_in_app_notifications (event_id, follow_id, user_id)
  SELECT v_event.id, f.id, f.user_id
  FROM public.bill_follows f
  WHERE f.bill_id = v_event.bill_id
    AND f.stopped_at IS NULL
    AND f.paused_at IS NULL
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
    AND public.bill_alert_category_enabled(
      v_event.event_type, f.committee_alerts, f.floor_alerts, f.vote_alerts
    )
  ON CONFLICT (event_id, follow_id) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fan_out_bill_event_in_app(UUID, TEXT, TEXT, BIGINT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fan_out_bill_event_in_app(UUID, TEXT, TEXT, BIGINT)
  TO service_role;

-- Seed up to 30 days of history for currently active follows. The same
-- official-time baseline prevents a newly followed bill from gaining old facts.
INSERT INTO public.bill_in_app_notifications (event_id, follow_id, user_id)
SELECT e.id, f.id, f.user_id
FROM public.bill_follows f
JOIN public.bill_events e
  ON e.bill_id = f.bill_id
 AND f.created_at <= CASE
   WHEN e.time_precision <> 'exact'
     THEN COALESCE(e.source_published_at, e.occurred_at, e.created_at)
   ELSE COALESCE(
     NULLIF(
       LEAST(
         COALESCE(e.occurred_at, 'infinity'::TIMESTAMPTZ),
         COALESCE(e.source_published_at, 'infinity'::TIMESTAMPTZ)
       ),
       'infinity'::TIMESTAMPTZ
     ),
     e.created_at
   )
 END
WHERE f.stopped_at IS NULL
  AND f.paused_at IS NULL
  AND e.created_at >= NOW() - INTERVAL '30 days'
  AND public.bill_alert_category_enabled(
    e.event_type, f.committee_alerts, f.floor_alerts, f.vote_alerts
  )
ON CONFLICT (event_id, follow_id) DO NOTHING;

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
    e.id,
    n.follow_id,
    e.bill_id,
    e.event_type,
    e.headline,
    e.detail,
    e.certainty,
    e.occurred_at,
    e.scheduled_for,
    e.scheduled_date,
    e.scheduled_week_start,
    e.source_url,
    e.source_published_at,
    o.status,
    b.send_status,
    e.created_at
  FROM public.bill_in_app_notifications n
  JOIN public.bill_events e ON e.id = n.event_id
  LEFT JOIN public.bill_notification_outbox o
    ON o.follow_id = n.follow_id
   AND o.event_id = n.event_id
   AND o.channel = 'email'
  LEFT JOIN public.bill_delivery_batches b ON b.id = o.delivery_batch_id
  WHERE n.user_id = (select auth.uid())
    AND e.created_at >= NOW() - INTERVAL '30 days'
    AND (p_before IS NULL OR e.created_at < p_before)
  ORDER BY e.created_at DESC, e.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100)
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_bill_alert_history(INTEGER, TIMESTAMPTZ)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_bill_alert_history(INTEGER, TIMESTAMPTZ)
  TO authenticated;
