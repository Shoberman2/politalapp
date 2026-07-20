/**
 * Bill alert pipeline entry point.
 *
 * Secrets are read only at runtime. None of these values use VITE_ prefixes,
 * so an open-source build cannot bundle them into browser JavaScript.
 */
import { createClient } from '@supabase/supabase-js';
import { ingestBillAlertSources } from '../server/alerts/ingest.js';
import { buildAndFreezeBillAlertBatches, sendBillAlertBatches } from '../server/alerts/delivery.js';
import { billAlertModeCapabilities, type BillAlertRuntimeMode } from '../server/alerts/runtime.js';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function main() {
  const supabaseUrl = required('SUPABASE_URL');
  const serviceRoleKey = required('SUPABASE_SERVICE_ROLE_KEY');
  const congressApiKey = required('CONGRESS_API_KEY');
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: settings, error: settingsError } = await supabase
    .from('bill_alert_runtime_settings')
    .select('mode')
    .eq('singleton', true)
    .single();
  if (settingsError) throw new Error(`Unable to load alert mode: ${settingsError.message}`);

  const mode = settings.mode as BillAlertRuntimeMode;
  const capabilities = billAlertModeCapabilities(mode);
  const sourceResults = capabilities.ingest
    ? await ingestBillAlertSources(supabase, congressApiKey)
    : 'disabled_by_runtime_mode';
  const report: Record<string, unknown> = { mode, sources: sourceResults };
  if (capabilities.deliver) {
    const resendApiKey = required('RESEND_API_KEY');
    const from = required('BILL_ALERTS_FROM_EMAIL');
    const publicOrigin = required('VITE_PUBLIC_ORIGIN');
    report.batchesFrozen = await buildAndFreezeBillAlertBatches(supabase, { from, publicOrigin });
    report.delivery = await sendBillAlertBatches(supabase, resendApiKey);
  } else {
    report.delivery = 'disabled_by_runtime_mode';
  }
  const { data: purged, error: purgeError } = await supabase.rpc('purge_expired_bill_alert_data');
  if (purgeError) throw new Error(`Unable to purge expired alert data: ${purgeError.message}`);
  report.purged = purged;
  console.log(JSON.stringify(report));
}

main().catch((error) => {
  console.error('[bill-alerts]', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
