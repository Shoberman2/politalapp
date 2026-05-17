/**
 * Forbidden-word filter for AI-generated narrations.
 *
 * Shared by:
 *   - Frontend voting pattern narration (src/services/votingPatternNarration.js)
 *   - Edge Function explain-bill-path (supabase/functions/explain-bill-path/)
 *
 * Lives at repo root /shared/ so the Deno Edge Function and Node/Vite client
 * can both import without cross-runtime resolution issues.
 *
 * Politically-loaded terms the LLM must never produce. The filter runs ONLY
 * against LLM-added clauses, never against verbatim bill titles which may
 * legitimately include words like "anti-corruption".
 */

export const FORBIDDEN_REGEX = /\b(bias(ed)?|anti-american|corrupt(ion)?|influence[- ]peddling)\b/i;

/**
 * Check if a narration string contains any forbidden term.
 */
export function containsForbidden(narration: string | null | undefined): boolean {
  if (!narration || typeof narration !== 'string') return false;
  return FORBIDDEN_REGEX.test(narration);
}

/**
 * Retry-once helper: takes an async generator function that produces a
 * narration string. If the first call returns forbidden language, calls
 * once more. If the second call still has forbidden language OR either
 * call returns null/empty, returns the fallback string.
 *
 * Caller must handle telemetry — this util only enforces the rule.
 *
 * @param generate - async fn returning a narration string (may throw)
 * @param fallback - deterministic template string to substitute on failure
 * @returns { narration: string, source: 'first' | 'retry' | 'fallback' }
 */
export async function generateWithForbiddenFilter(
  generate: () => Promise<string | null | undefined>,
  fallback: string
): Promise<{ narration: string; source: 'first' | 'retry' | 'fallback' }> {
  // First attempt
  let first: string | null | undefined = null;
  try {
    first = await generate();
  } catch {
    return { narration: fallback, source: 'fallback' };
  }
  if (first && !containsForbidden(first)) {
    return { narration: first, source: 'first' };
  }

  // Retry once
  let retry: string | null | undefined = null;
  try {
    retry = await generate();
  } catch {
    return { narration: fallback, source: 'fallback' };
  }
  if (retry && !containsForbidden(retry)) {
    return { narration: retry, source: 'retry' };
  }

  // Fallback
  return { narration: fallback, source: 'fallback' };
}
