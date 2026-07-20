import { supabaseAdmin } from '../_lib/supabase.js';
import { getHeader, readTextBody } from '../_lib/request.js';
import { resendDeliveryId, verifyResendWebhook } from '../../server/alerts/resendWebhook.js';

async function route(req: Request) {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return new Response('Resend webhook is not configured', { status: 500 });

  const headers = {
    id: getHeader(req, 'svix-id'),
    timestamp: getHeader(req, 'svix-timestamp'),
    signature: getHeader(req, 'svix-signature'),
  };
  if (!headers.id || !headers.timestamp || !headers.signature) {
    return new Response('Missing signature', { status: 400 });
  }
  const rawBody = await readTextBody(req);
  if (!verifyResendWebhook(rawBody, headers, secret)) {
    return new Response('Invalid signature', { status: 400 });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const data = event.data ?? {};
  const { data: inserted, error } = await supabaseAdmin.rpc('record_bill_email_provider_event', {
    p_provider_event_id: headers.id,
    p_event_type: String(event.type ?? 'unknown'),
    p_provider_message_id: data.email_id ?? data.id ?? null,
    p_delivery_id: resendDeliveryId(data),
    p_occurred_at: event.created_at ?? data.created_at ?? null,
    // Persist only delivery identifiers needed for reconciliation. Resend's
    // raw event may contain recipient addresses and does not belong in a
    // long-lived application log.
    p_payload: {
      type: event.type ?? null,
      created_at: event.created_at ?? null,
      data: {
        email_id: data.email_id ?? data.id ?? null,
        tags: data.tags ?? null,
      },
    },
  });
  if (error) {
    console.error('[resend-webhook] persistence failed', error.message);
    return new Response('Webhook persistence failed', { status: 500 });
  }
  return Response.json({ received: true, duplicate: inserted === false });
}

export default {
  fetch(request: Request) {
    return route(request);
  },
};
