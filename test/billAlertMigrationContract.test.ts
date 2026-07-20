import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260720203000_add_bill_watch_alerts.sql'),
  'utf8',
);

describe('bill alert migration safety contract', () => {
  it('requires fenced leases for evidence, event, and fan-out mutations', () => {
    expect(sql).toContain('persist_bill_alert_observation');
    expect(sql).toContain('bill_alert_assert_source_lease');
    expect(sql).toContain('bill_alert_assert_active_lease');
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.fan_out_bill_event\([\s\S]*?p_fence_token BIGINT/);
    expect(sql).toMatch(/REVOKE INSERT, UPDATE, DELETE ON TABLE[\s\S]*?public\.bill_alert_fanout_progress[\s\S]*?FROM service_role/);
  });

  it('resumes corrections after delayed delivery receipts', () => {
    expect(sql).toMatch(/email\.delivered[\s\S]*?UPDATE public\.bill_alert_fanout_progress fp[\s\S]*?completed_at = NULL/);
  });

  it('rechecks category consent before frozen or claimed mail can send', () => {
    expect(sql).toContain('bill_alert_category_enabled');
    expect(sql).toMatch(/freeze_bill_delivery_batch[\s\S]*?AND NOT EXISTS[\s\S]*?bill_alert_category_enabled/);
    expect(sql).toMatch(/claim_bill_alert_delivery_batches[\s\S]*?PREFERENCE_CHANGED[\s\S]*?bill_alert_category_enabled/);
  });

  it('baselines fan-out against official occurrence or publication time', () => {
    expect(sql).toMatch(/f\.created_at <= CASE[\s\S]*?v_event\.time_precision <> 'exact'[\s\S]*?v_event\.source_published_at[\s\S]*?v_event\.occurred_at/);
  });

  it('keeps private alert tables inaccessible to anonymous and authenticated clients', () => {
    expect(sql).toMatch(/REVOKE ALL ON TABLE[\s\S]*?public\.bill_notification_outbox[\s\S]*?FROM anon, authenticated/);
    expect(sql).not.toMatch(/GRANT (?:INSERT|UPDATE|DELETE|ALL)[^;]*bill_notification_outbox[^;]*authenticated/);
  });
});
