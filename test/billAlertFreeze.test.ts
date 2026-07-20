import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

const { renderBatch } = vi.hoisted(() => ({ renderBatch: vi.fn() }));
vi.mock('../server/alerts/render.js', () => ({ renderBatch }));

import { buildAndFreezeBillAlertBatches } from '../server/alerts/delivery.js';

function batchQuery(batches: any[]) {
  const query: any = {
    select: () => query, eq: () => query, order: () => query,
    limit: () => Promise.resolve({ data: batches, error: null }),
  };
  return query;
}

function client(user: any, freezeResult = true) {
  const rpc = vi.fn(async (name: string) => {
    if (name === 'build_bill_delivery_batches') return { data: 1, error: null };
    if (name === 'freeze_bill_delivery_batch') return { data: freezeResult, error: null };
    if (name === 'cancel_bill_delivery_batch') return { data: true, error: null };
    throw new Error(`unexpected rpc: ${name}`);
  });
  const supabase: any = {
    rpc,
    from: () => batchQuery([{ id: 'batch-1', user_id: 'user-1', bill_id: '119-hr-1' }]),
    auth: { admin: { getUserById: vi.fn().mockResolvedValue({ data: { user }, error: null }) } },
  };
  return { supabase: supabase as SupabaseClient, rpc };
}

beforeEach(() => {
  vi.clearAllMocks();
  renderBatch.mockResolvedValue({
    from: 'BallotWatch <alerts@example.com>', subject: 'Update', html: '<p>Update</p>',
    text: 'Update', headers: {}, payloadHash: 'hash-1',
  });
});

describe('delivery batch freezing', () => {
  it('freezes an immutable payload only for a confirmed auth email', async () => {
    const { supabase, rpc } = client({
      email: 'reader@example.com', email_confirmed_at: '2026-07-20T12:00:00Z',
    });
    await expect(buildAndFreezeBillAlertBatches(supabase, {
      from: 'BallotWatch <alerts@example.com>', publicOrigin: 'https://ballotwatch.example',
    })).resolves.toBe(1);
    expect(rpc).toHaveBeenCalledWith('freeze_bill_delivery_batch', expect.objectContaining({
      p_recipient_email: 'reader@example.com', p_payload_hash: 'hash-1',
    }));
  });

  it('cancels a batch when the auth user is missing or unconfirmed', async () => {
    const { supabase, rpc } = client({ email: 'reader@example.com', email_confirmed_at: null });
    await buildAndFreezeBillAlertBatches(supabase, {
      from: 'BallotWatch <alerts@example.com>', publicOrigin: 'https://ballotwatch.example',
    });
    expect(renderBatch).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith('cancel_bill_delivery_batch', {
      p_batch_id: 'batch-1', p_error_code: 'EMAIL_NOT_CONFIRMED',
    });
  });

  it('reconciles preference changes detected by the atomic freeze RPC', async () => {
    const { supabase, rpc } = client({
      email: 'reader@example.com', email_confirmed_at: '2026-07-20T12:00:00Z',
    }, false);
    await buildAndFreezeBillAlertBatches(supabase, {
      from: 'BallotWatch <alerts@example.com>', publicOrigin: 'https://ballotwatch.example',
    });
    expect(rpc).toHaveBeenCalledWith('cancel_bill_delivery_batch', {
      p_batch_id: 'batch-1', p_error_code: 'PREFERENCE_CHANGED',
    });
  });
});
