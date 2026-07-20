import { createHmac, randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { rpc } = vi.hoisted(() => ({
  rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
}));
vi.mock('../../api/_lib/supabase.js', () => ({
  supabaseAdmin: { rpc },
}));

import handler from '../../api/webhooks/resend.js';

const originalSecret = process.env.RESEND_WEBHOOK_SECRET;

afterEach(() => {
  rpc.mockClear();
  if (originalSecret === undefined) delete process.env.RESEND_WEBHOOK_SECRET;
  else process.env.RESEND_WEBHOOK_SECRET = originalSecret;
});

function signedRequest(payload: string, secretBytes: Buffer, timestamp = Math.floor(Date.now() / 1000)) {
  const id = 'msg_bill_alert_test';
  const signature = createHmac('sha256', secretBytes)
    .update(`${id}.${timestamp}.${payload}`)
    .digest('base64');
  return new Request('http://localhost/api/webhooks/resend', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'svix-id': id,
      'svix-timestamp': String(timestamp),
      'svix-signature': `v1,${signature}`,
    },
    body: payload,
  });
}

describe('Resend webhook', () => {
  it('verifies the exact raw body and persists the provider event', async () => {
    const key = randomBytes(32);
    process.env.RESEND_WEBHOOK_SECRET = `whsec_${key.toString('base64')}`;
    const payload = JSON.stringify({
      type: 'email.delivered',
      created_at: '2026-07-20T20:00:00Z',
      data: {
        email_id: 'email_123',
        tags: [{ name: 'delivery_id', value: '21cd8bdc-08eb-4acf-b3a2-cdda4c115bce' }],
      },
    });
    const response = await handler.fetch(signedRequest(payload, key));
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('record_bill_email_provider_event', expect.objectContaining({
      p_provider_event_id: 'msg_bill_alert_test',
      p_event_type: 'email.delivered',
      p_provider_message_id: 'email_123',
      p_delivery_id: '21cd8bdc-08eb-4acf-b3a2-cdda4c115bce',
    }));
  });

  it('rejects a signature for a different body', async () => {
    const key = randomBytes(32);
    process.env.RESEND_WEBHOOK_SECRET = `whsec_${key.toString('base64')}`;
    const request = signedRequest('{"type":"email.delivered"}', key);
    const tampered = new Request(request.url, {
      method: 'POST', headers: request.headers, body: '{"type":"email.bounced"}',
    });
    const response = await handler.fetch(tampered);
    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
});
