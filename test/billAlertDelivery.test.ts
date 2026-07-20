import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { renderBatch } from '../server/alerts/render.js';
import { sendBillAlertBatches } from '../server/alerts/delivery.js';

afterEach(() => vi.unstubAllGlobals());

const batch = {
  id: 'batch-1', user_id: 'user-1', bill_id: '119-hr-1', send_status: 'claimed',
  claim_fence: 3, claimed_by: 'worker-1', attempt_count: 1,
  recipient_email: 'reader@example.com', from_snapshot: 'BallotWatch <alerts@example.com>',
  subject_snapshot: 'H.R. 1 update', html_snapshot: '<p>Update</p>', text_snapshot: 'Update',
  headers_snapshot: { 'X-BallotWatch-Delivery': 'batch-1' },
};

function deliveryClient() {
  const rpc = vi.fn(async (name: string, args: any) => {
    if (name === 'claim_bill_alert_delivery_batches') {
      return { data: [{ ...batch, claimed_by: args.p_worker_id }], error: null };
    }
    if (name === 'complete_bill_alert_delivery_batch') return { data: true, error: null };
    throw new Error(`unexpected rpc: ${name}`);
  });
  return { supabase: { rpc } as any as SupabaseClient, rpc };
}

function completion(rpc: ReturnType<typeof vi.fn>) {
  return rpc.mock.calls.find((call) => call[0] === 'complete_bill_alert_delivery_batch')?.[1];
}

describe('Resend delivery outcomes', () => {
  it('records an accepted provider message with the stable delivery tag', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'email-1' }), { status: 200 })));
    const { supabase, rpc } = deliveryClient();
    await expect(sendBillAlertBatches(supabase, 'resend-secret', 'worker-1')).resolves.toEqual({
      claimed: 1, outcomes: { accepted: 1 },
    });
    expect(completion(rpc)).toMatchObject({ p_outcome: 'accepted', p_provider_message_id: 'email-1' });
    const request = (fetch as any).mock.calls[0][1];
    expect(request.headers['idempotency-key']).toBe('bill-alert/batch-1');
    expect(JSON.parse(request.body).tags).toEqual([{ name: 'delivery_id', value: 'batch-1' }]);
  });

  it('honors Retry-After for a rate-limited response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ name: 'rate_limit_exceeded' }), {
      status: 429, headers: { 'retry-after': '60' },
    })));
    const { supabase, rpc } = deliveryClient();
    const before = Date.now();
    await sendBillAlertBatches(supabase, 'resend-secret', 'worker-1');
    const completed = completion(rpc);
    expect(completed.p_outcome).toBe('retryable');
    expect(new Date(completed.p_next_attempt_at).getTime()).toBeGreaterThanOrEqual(before + 59_000);
  });

  it('does not retry a permanent provider rejection', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ name: 'invalid_from_address' }), { status: 422 })));
    const { supabase, rpc } = deliveryClient();
    await sendBillAlertBatches(supabase, 'resend-secret', 'worker-1');
    expect(completion(rpc)).toMatchObject({ p_outcome: 'permanently_failed', p_next_attempt_at: null });
  });

  it('marks a network failure ambiguous instead of risking a duplicate send', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('socket closed')));
    const { supabase, rpc } = deliveryClient();
    await sendBillAlertBatches(supabase, 'resend-secret', 'worker-1');
    expect(completion(rpc)).toMatchObject({ p_outcome: 'ambiguous', p_error_code: 'TYPEERROR' });
  });
});

function tableQuery(result: { data: any; error: any }) {
  const query: any = {
    select: () => query, eq: () => query, in: () => query, order: () => Promise.resolve(result),
    single: () => Promise.resolve(result), then: (resolve: any) => Promise.resolve(result).then(resolve),
  };
  return query;
}

describe('bill alert email rendering', () => {
  it('escapes official text and keeps management links on the configured origin', async () => {
    const supabase: any = {
      from(table: string) {
        if (table === 'bill_notification_outbox') return tableQuery({ data: [{ event_id: 'event-1' }], error: null });
        if (table === 'bill_events') return tableQuery({ data: [{
          id: 'event-1', event_series_key: null, event_type: 'committee_referral',
          headline: '<script>alert(1)</script>', detail: 'Rules & markup',
          source_url: 'https://congress.gov/item', created_at: '2026-07-20T15:00:00Z',
        }], error: null });
        if (table === 'bills') return tableQuery({ data: {
          id: '119-hr-1', title: 'A <safe> bill', source_url: 'https://congress.gov/bill',
        }, error: null });
        throw new Error(`unexpected table: ${table}`);
      },
    };
    const rendered = await renderBatch(supabase, { id: 'batch-1', user_id: 'user-1', bill_id: '119-hr-1' }, {
      from: 'BallotWatch <alerts@example.com>', publicOrigin: 'https://ballotwatch.example/',
    });
    expect(rendered?.html).not.toContain('<script>');
    expect(rendered?.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(rendered?.html).toContain('https://ballotwatch.example/alerts');
  });
});
