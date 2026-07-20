import { createHmac, timingSafeEqual } from 'node:crypto';

const MAX_AGE_SECONDS = 5 * 60;

export function verifyResendWebhook(
  payload: string,
  headers: { id: string; timestamp: string; signature: string },
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  const timestamp = Number(headers.timestamp);
  if (!headers.id || !Number.isFinite(timestamp)) return false;
  if (Math.abs(nowSeconds - timestamp) > MAX_AGE_SECONDS) return false;
  const encodedSecret = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  let key: Buffer;
  try {
    key = Buffer.from(encodedSecret, 'base64');
  } catch {
    return false;
  }
  if (key.length === 0) return false;
  const expected = createHmac('sha256', key)
    .update(`${headers.id}.${headers.timestamp}.${payload}`)
    .digest();
  return headers.signature.split(' ').some((part) => {
    const [version, encoded] = part.split(',', 2);
    if (version !== 'v1' || !encoded) return false;
    const supplied = Buffer.from(encoded, 'base64');
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  });
}

export function resendDeliveryId(data: any): string | null {
  if (typeof data?.tags?.delivery_id === 'string') return data.tags.delivery_id;
  if (Array.isArray(data?.tags)) {
    const tag = data.tags.find((entry: any) => entry?.name === 'delivery_id');
    if (typeof tag?.value === 'string') return tag.value;
  }
  return null;
}
