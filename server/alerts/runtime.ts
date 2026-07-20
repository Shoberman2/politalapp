export type BillAlertRuntimeMode = 'off' | 'shadow' | 'internal' | 'public';

export function billAlertModeCapabilities(mode: BillAlertRuntimeMode) {
  return {
    ingest: mode !== 'off',
    deliver: mode === 'internal' || mode === 'public',
  };
}
