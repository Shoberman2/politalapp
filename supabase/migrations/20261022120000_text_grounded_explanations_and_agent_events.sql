-- 1. Bill explanations written from the bill's own text.
--
-- shared/billExplainer.js now reads the newest official text of the bill
-- (and the CRS summary when the text is long or missing) and stores rows
-- under (gpt-5.4-mini, prompt_version 3). These columns record what the
-- model read so every page can say so and link to it. Older rows
-- (gpt-4o-mini v2, written from titles) stay in the table; readers ignore them.

ALTER TABLE bill_explanations ADD COLUMN IF NOT EXISTS key_points JSONB;
ALTER TABLE bill_explanations ADD COLUMN IF NOT EXISTS source_kind TEXT;
ALTER TABLE bill_explanations ADD COLUMN IF NOT EXISTS source_label TEXT;
ALTER TABLE bill_explanations ADD COLUMN IF NOT EXISTS source_date TIMESTAMPTZ;
ALTER TABLE bill_explanations ADD COLUMN IF NOT EXISTS source_url TEXT;
-- 'on_demand' (a reader opened the bill: api/_lib/explanations.js) or
-- 'prewarm' (the ETL). The site-wide daily cap counts on_demand rows only.
ALTER TABLE bill_explanations ADD COLUMN IF NOT EXISTS generated_by TEXT;

CREATE INDEX IF NOT EXISTS bill_explanations_on_demand_created_idx
  ON bill_explanations (created_at)
  WHERE generated_by = 'on_demand';

COMMENT ON COLUMN bill_explanations.source_kind IS 'bill-text | bill-text-partial | crs-summary: what the model read';

-- 2. AI agent activity.
--
-- One row per request from a known AI agent (crawler, AI search, or an agent
-- fetching for a person), per request to an agent surface (/api/v1, /mcp,
-- llms.txt, /data, /.well-known, openapi.yaml) from any client, and per MCP
-- initialize / tool call. Written by middleware.js and api/mcp.js with the
-- service role; nobody else can read or write it.

CREATE TABLE IF NOT EXISTS agent_events (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- page | api | mcp | file
  surface TEXT NOT NULL,
  -- request | mcp_initialize | mcp_tool
  event TEXT NOT NULL DEFAULT 'request',
  path TEXT NOT NULL,
  -- e.g. ClaudeBot, ChatGPT-User, PerplexityBot; 'unknown' for unrecognized clients on agent surfaces
  agent TEXT NOT NULL,
  -- Anthropic, OpenAI, Perplexity, ...
  operator TEXT,
  -- training | search | user | client | unknown
  purpose TEXT,
  tool TEXT,
  detail JSONB,
  user_agent TEXT,
  ip_hash TEXT,
  country TEXT
);

CREATE INDEX IF NOT EXISTS idx_agent_events_created ON agent_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_events_agent_created ON agent_events (agent, created_at DESC);

ALTER TABLE agent_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON agent_events FROM anon, authenticated;
GRANT ALL ON agent_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE agent_events_id_seq TO service_role;

-- Daily roll-up for the report (scripts/agent-report.mjs).
CREATE OR REPLACE VIEW agent_activity_daily
WITH (security_invoker = true) AS
SELECT
  date_trunc('day', created_at)::date AS day,
  agent,
  operator,
  purpose,
  surface,
  event,
  tool,
  COUNT(*) AS events,
  COUNT(DISTINCT ip_hash) AS distinct_ips
FROM agent_events
GROUP BY 1, 2, 3, 4, 5, 6, 7;

REVOKE ALL ON agent_activity_daily FROM anon, authenticated;
GRANT SELECT ON agent_activity_daily TO service_role;
