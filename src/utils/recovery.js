// A password-reset link signs the reader in through /auth/callback. Only that
// arrival may open the set-password form: an ordinary signed-in session must
// not be able to change the password without the current one. The marker
// lives for this tab only.
const KEY = 'bw-recovery'

export function markRecovery() {
  try { sessionStorage.setItem(KEY, '1') } catch { /* storage unavailable: the form stays closed */ }
}

export function hasRecovery() {
  try { return sessionStorage.getItem(KEY) === '1' } catch { return false }
}

export function clearRecovery() {
  try { sessionStorage.removeItem(KEY) } catch { /* nothing to clear */ }
}
