CREATE OR REPLACE FUNCTION public.member_last_vote_dates()
RETURNS TABLE (politician_id TEXT, last_voted_at DATE)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
AS $$
  SELECT v.politician_id, MAX(v.voted_at)::date
  FROM votes v
  GROUP BY v.politician_id
$$;
REVOKE ALL ON FUNCTION public.member_last_vote_dates() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.member_last_vote_dates() TO service_role;
