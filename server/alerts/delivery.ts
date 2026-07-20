import { timingSafeEqual } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { sha256 } from './canonical.js';
import { renderBatch } from './render.js';
import type { DeliveryBatch } from './types.js';

async function cancelBatch(supabase: SupabaseClient, batchId: string, code: string) {
  const { error } = await supabase.rpc('cancel_bill_delivery_batch', {
    p_batch_id: batchId,
    p_error_code: code,
  });
  if (error) throw new Error(`Unable to cancel delivery ${batchId}: ${error.message}`);
}

export async function buildAndFreezeBillAlertBatches(
  supabase: SupabaseClient,
  options: { from: string; publicOrigin: string },
) {
  const { error: buildError } = await supabase.rpc('build_bill_delivery_batches', { p_limit: 100 });
  if (buildError) throw new Error(`Unable to build bill alert batches: ${buildError.message}`);

  const { data: batches, error: batchError } = await supabase
    .from('bill_delivery_batches')
    .select('id,user_id,bill_id')
    .eq('send_status', 'building')
    .order('created_at', { ascending: true })
    .limit(100);
  if (batchError) throw new Error(`Unable to load building batches: ${batchError.message}`);

  let frozen = 0;
  for (const batch of batches ?? []) {
    const { data: authData, error: authError } = await supabase.auth.admin.getUserById(batch.user_id);
    const user = authData?.user;
    if (authError || !user?.email) {
      await cancelBatch(supabase, batch.id, 'AUTH_USER_NOT_FOUND');
      continue;
    }
    if (!user.email_confirmed_at) {
      await cancelBatch(supabase, batch.id, 'EMAIL_NOT_CONFIRMED');
      continue;
    }

    const rendered = await renderBatch(supabase, batch, options);
    if (!rendered) {
      await cancelBatch(supabase, batch.id, 'NO_ACTIVE_EVENTS');
      continue;
    }
    const recipientEmail = user.email.trim();
    const { data: didFreeze, error: freezeError } = await supabase.rpc('freeze_bill_delivery_batch', {
      p_batch_id: batch.id,
      p_recipient_email: recipientEmail,
      p_recipient_confirmed_at: user.email_confirmed_at,
      p_recipient_fingerprint: sha256(recipientEmail.toLowerCase()),
      p_from: rendered.from,
      p_subject: rendered.subject,
      p_html: rendered.html,
      p_text: rendered.text,
      p_headers: rendered.headers,
      p_payload_hash: rendered.payloadHash,
    });
    if (freezeError) throw new Error(`Unable to freeze delivery ${batch.id}: ${freezeError.message}`);
    if (didFreeze === true) frozen += 1;
    else await cancelBatch(supabase, batch.id, 'PREFERENCE_CHANGED');
  }
  return frozen;
}

function retryAt(attemptCount: number, retryAfter: string | null): string {
  const retrySeconds = Number(retryAfter);
  const delay = Number.isFinite(retrySeconds) && retrySeconds > 0
    ? retrySeconds * 1000
    : Math.min(3_600_000, 30_000 * (2 ** Math.max(attemptCount - 1, 0)));
  return new Date(Date.now() + delay).toISOString();
}

async function complete(
  supabase: SupabaseClient,
  batch: DeliveryBatch,
  outcome: string,
  providerMessageId: string | null,
  errorCode: string | null,
  nextAttemptAt: string | null,
) {
  const { data, error } = await supabase.rpc('complete_bill_alert_delivery_batch', {
    p_batch_id: batch.id,
    p_worker_id: batch.claimed_by,
    p_claim_fence: batch.claim_fence,
    p_outcome: outcome,
    p_provider_message_id: providerMessageId,
    p_error_code: errorCode,
    p_next_attempt_at: nextAttemptAt,
  });
  if (error) throw new Error(`Unable to complete delivery ${batch.id}: ${error.message}`);
  if (data !== true) throw new Error(`Delivery claim expired before completion: ${batch.id}`);
}

async function sendBatch(supabase: SupabaseClient, batch: DeliveryBatch, resendApiKey: string) {
  let response: Response;
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${resendApiKey}`,
        'content-type': 'application/json',
        'idempotency-key': `bill-alert/${batch.id}`,
      },
      body: JSON.stringify({
        from: batch.from_snapshot,
        to: [batch.recipient_email],
        subject: batch.subject_snapshot,
        html: batch.html_snapshot,
        text: batch.text_snapshot,
        headers: batch.headers_snapshot,
        tags: [{ name: 'delivery_id', value: batch.id }],
      }),
    });
  } catch (error) {
    await complete(
      supabase,
      batch,
      'ambiguous',
      null,
      error instanceof Error ? error.name.toUpperCase() : 'NETWORK_ERROR',
      null,
    );
    return 'ambiguous';
  }

  const body = await response.json().catch(() => ({})) as any;
  if (response.ok && body.id) {
    await complete(supabase, batch, 'accepted', String(body.id), null, null);
    return 'accepted';
  }

  const code = String(body.name ?? body.statusCode ?? `HTTP_${response.status}`).slice(0, 120);
  if (response.status === 408 || response.status === 409 || response.status === 429 || response.status >= 500) {
    const outcome = response.status === 409 ? 'ambiguous' : 'retryable';
    await complete(
      supabase,
      batch,
      outcome,
      body.id ? String(body.id) : null,
      code,
      outcome === 'retryable' ? retryAt(batch.attempt_count, response.headers.get('retry-after')) : null,
    );
    return outcome;
  }
  await complete(supabase, batch, 'permanently_failed', null, code, null);
  return 'permanently_failed';
}

export async function sendBillAlertBatches(
  supabase: SupabaseClient,
  resendApiKey: string,
  workerId = `alerts-${process.pid}-${Date.now()}`,
) {
  const { data, error } = await supabase.rpc('claim_bill_alert_delivery_batches', {
    p_limit: 20,
    p_worker_id: workerId,
    p_lease_seconds: 120,
  });
  if (error) throw new Error(`Unable to claim bill alert deliveries: ${error.message}`);
  const batches = (data ?? []) as DeliveryBatch[];
  const outcomes: Record<string, number> = {};
  for (const batch of batches) {
    const outcome = await sendBatch(supabase, batch, resendApiKey);
    outcomes[outcome] = (outcomes[outcome] ?? 0) + 1;
    // Resend defaults to 5 requests/second per team. Stay below that limit.
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return { claimed: batches.length, outcomes };
}

export function validCronAuthorization(header: string, secret: string): boolean {
  if (!header.startsWith('Bearer ') || !secret) return false;
  const supplied = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
