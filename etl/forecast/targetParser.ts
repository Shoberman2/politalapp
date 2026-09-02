export const TARGET_PARSER_VERSION = '1.0.0';

export type ForecastTarget =
  | 'final_passage'
  | 'suspend_and_pass'
  | 'cloture'
  | 'motion_to_proceed'
  | 'other_procedural'
  | 'unknown';

export type ThresholdRule =
  | 'simple_majority_present_voting'
  | 'two_thirds_present_voting'
  | 'three_fifths_duly_chosen_sworn';

export interface TargetParse {
  parserVersion: string;
  rawText: string;
  normalizedText: string;
  forecastTarget: ForecastTarget;
  thresholdRule: ThresholdRule | null;
  confidence: number;
  unsupportedReason: string | null;
  publicForecastSupported: boolean;
}
function normalizeTargetText(raw: string): string {
  return raw
    .normalize('NFKC')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u2010-\u2015]/g, '-')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function parsed(
  rawText: string,
  normalizedText: string,
  forecastTarget: ForecastTarget,
  thresholdRule: ThresholdRule | null,
  confidence: number,
  unsupportedReason: string | null,
): TargetParse {
  return {
    parserVersion: TARGET_PARSER_VERSION,
    rawText,
    normalizedText,
    forecastTarget,
    thresholdRule,
    confidence,
    unsupportedReason,
    publicForecastSupported:
      forecastTarget === 'final_passage' || forecastTarget === 'suspend_and_pass',
  };
}

/**
 * Conservative, versioned parsing of official floor-vote question text.
 * A false `unknown` only withholds a forecast; a false passage label could
 * publish the wrong threshold, so ambiguous wording always fails closed.
 */
export function parseForecastTarget(rawText: string | null | undefined): TargetParse {
  const raw = rawText ?? '';
  const normalized = normalizeTargetText(raw);
  if (!normalized) {
    return parsed(raw, normalized, 'unknown', null, 0, 'missing_target_text');
  }

  if (
    /\bsuspend(?:ing)? the rules\b/.test(normalized) &&
    /\b(pass|agree|adopt)(?:age|ed|ing)?\b/.test(normalized)
  ) {
    return parsed(
      raw,
      normalized,
      'suspend_and_pass',
      'two_thirds_present_voting',
      0.99,
      null,
    );
  }

  if (/\bcloture\b|\binvoke cloture\b/.test(normalized)) {
    return parsed(
      raw,
      normalized,
      'cloture',
      'three_fifths_duly_chosen_sworn',
      0.98,
      'target_not_publicly_supported',
    );
  }

  if (/\bmotion to proceed\b|\bproceed to consideration\b/.test(normalized)) {
    return parsed(
      raw,
      normalized,
      'motion_to_proceed',
      'simple_majority_present_voting',
      0.98,
      'target_not_publicly_supported',
    );
  }

  if (
    /\b(?:motion|amendment|nomination|confirmation|recommit|table|discharge|journal)\b/.test(
      normalized,
    )
  ) {
    return parsed(
      raw,
      normalized,
      'other_procedural',
      null,
      0.9,
      'procedural_target_not_supported',
    );
  }

  if (/\b(?:on )?(?:the )?(?:final )?passage\b|\bon passing\b/.test(normalized)) {
    return parsed(
      raw,
      normalized,
      'final_passage',
      'simple_majority_present_voting',
      0.98,
      null,
    );
  }

  if (/^(?:on )?(?:agreeing to )?(?:the )?conference report$/.test(normalized)) {
    return parsed(
      raw,
      normalized,
      'final_passage',
      'simple_majority_present_voting',
      0.98,
      null,
    );
  }

  return parsed(raw, normalized, 'unknown', null, 0.25, 'unrecognized_target_text');
}
