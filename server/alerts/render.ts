import type { SupabaseClient } from '@supabase/supabase-js';
import { contentHash, escapeHtml } from './canonical.js';

function formatBillId(id: string): string {
  const [, type, number] = id.split('-');
  const labels: Record<string, string> = {
    hr: 'H.R.', s: 'S.', hjres: 'H.J.Res.', sjres: 'S.J.Res.',
    hconres: 'H.Con.Res.', sconres: 'S.Con.Res.', hres: 'H.Res.', sres: 'S.Res.',
  };
  return `${labels[type] ?? type.toUpperCase()} ${number}`;
}

function eventTiming(event: any): string {
  if (event.scheduled_for) {
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium', timeStyle: 'short', timeZone: event.source_timezone || 'America/New_York',
    }).format(new Date(event.scheduled_for));
  }
  if (event.scheduled_date) return event.scheduled_date;
  if (event.scheduled_week_start) return `Week of ${event.scheduled_week_start}`;
  if (event.occurred_at) return new Date(event.occurred_at).toLocaleDateString('en-US', { dateStyle: 'medium' });
  return '';
}

export async function renderBatch(
  supabase: SupabaseClient,
  batch: { id: string; user_id: string; bill_id: string },
  options: { from: string; publicOrigin: string },
) {
  const { data: outbox, error: outboxError } = await supabase
    .from('bill_notification_outbox')
    .select('event_id')
    .eq('delivery_batch_id', batch.id)
    .eq('status', 'batched');
  if (outboxError) throw new Error(`Unable to load delivery events: ${outboxError.message}`);
  const eventIds = (outbox ?? []).map((row: any) => row.event_id);
  if (eventIds.length === 0) return null;

  const [{ data: events, error: eventError }, { data: bill, error: billError }] = await Promise.all([
    supabase.from('bill_events').select('*').in('id', eventIds).order('created_at', { ascending: true }),
    supabase.from('bills').select('id,title,source_url').eq('id', batch.bill_id).single(),
  ]);
  if (eventError) throw new Error(`Unable to load canonical events: ${eventError.message}`);
  if (billError) throw new Error(`Unable to load bill: ${billError.message}`);

  // Keep only the newest pending correction in each series.
  const coalesced = new Map<string, any>();
  for (const event of events ?? []) {
    coalesced.set(event.event_series_key || event.id, event);
  }
  const selected = [...coalesced.values()];
  if (selected.length === 0) return null;

  const billLabel = formatBillId(batch.bill_id);
  const subject = selected.length === 1
    ? `${billLabel}: ${selected[0].headline}`
    : `${billLabel}: ${selected.length} new updates`;
  const manageUrl = `${options.publicOrigin.replace(/\/$/, '')}/alerts`;
  const billUrl = `${options.publicOrigin.replace(/\/$/, '')}/bill/${batch.bill_id.replaceAll('-', '/')}`;
  const rows = selected.map((event) => {
    const timing = eventTiming(event);
    return `<div style="border-top:1px solid #E8E6E1;padding:18px 0">
      <div style="font:600 12px ui-monospace,monospace;color:#1D4ED8;text-transform:uppercase">${escapeHtml(event.event_type.replaceAll('_', ' '))}</div>
      <h2 style="font:400 24px Georgia,serif;color:#1A1A18;margin:6px 0">${escapeHtml(event.headline)}</h2>
      ${timing ? `<p style="margin:0 0 8px;color:#6B6861">${escapeHtml(timing)}</p>` : ''}
      ${event.detail ? `<p style="margin:0;color:#1A1A18;line-height:1.55">${escapeHtml(event.detail)}</p>` : ''}
      <p style="margin:10px 0 0"><a href="${escapeHtml(event.source_url)}" style="color:#1D4ED8">View the official source</a></p>
    </div>`;
  }).join('');
  const html = `<!doctype html><html><body style="margin:0;background:#FAFAF7;color:#1A1A18;font-family:Arial,sans-serif">
    <div style="max-width:620px;margin:0 auto;padding:32px 20px">
      <p style="font:600 12px ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase;color:#6B6861">BallotWatch · Bill alert</p>
      <h1 style="font:400 34px Georgia,serif;margin:8px 0 4px">${escapeHtml(billLabel)}</h1>
      <p style="color:#6B6861;margin:0 0 24px">${escapeHtml(bill.title)}</p>
      ${rows}
      <p style="margin:26px 0 8px"><a href="${escapeHtml(billUrl)}" style="color:#1D4ED8">Open this bill on BallotWatch</a></p>
      <p style="font-size:12px;color:#9C9789;line-height:1.5">You asked BallotWatch to monitor this bill. <a href="${escapeHtml(manageUrl)}" style="color:#1D4ED8">Manage your alerts</a> after signing in.</p>
    </div></body></html>`;
  const text = [
    `BallotWatch — ${billLabel}`,
    bill.title,
    '',
    ...selected.flatMap((event) => [
      event.headline,
      eventTiming(event),
      event.detail || '',
      `Official source: ${event.source_url}`,
      '',
    ]),
    `View bill: ${billUrl}`,
    `Manage alerts: ${manageUrl}`,
  ].filter((line) => line !== '').join('\n');

  return {
    from: options.from,
    subject,
    html,
    text,
    headers: { 'X-BallotWatch-Delivery': batch.id },
    payloadHash: contentHash({ subject, html, text, eventIds: selected.map((event) => event.id) }),
  };
}
