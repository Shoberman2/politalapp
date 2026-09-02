import { describe, expect, it } from 'vitest';
import { parseForecastTarget, TARGET_PARSER_VERSION } from '../../etl/forecast/targetParser.js';

describe('parseForecastTarget', () => {
  it.each([
    ['On Passage of the Bill', 'final_passage', 'simple_majority_present_voting'],
    ['On Motion to Suspend the Rules and Pass', 'suspend_and_pass', 'two_thirds_present_voting'],
    ['On the Conference Report', 'final_passage', 'simple_majority_present_voting'],
    ['On Agreeing to the Conference Report', 'final_passage', 'simple_majority_present_voting'],
    ['Motion to Invoke Cloture', 'cloture', 'three_fifths_duly_chosen_sworn'],
    ['On the Motion to Proceed', 'motion_to_proceed', 'simple_majority_present_voting'],
    ['On the Nomination', 'other_procedural', null],
  ] as const)('parses %s', (text, target, threshold) => {
    const result = parseForecastTarget(text);
    expect(result.parserVersion).toBe(TARGET_PARSER_VERSION);
    expect(result.forecastTarget).toBe(target);
    expect(result.thresholdRule).toBe(threshold);
  });

  it('publishes only final passage and suspension targets', () => {
    expect(parseForecastTarget('On Passage').publicForecastSupported).toBe(true);
    expect(parseForecastTarget('On Cloture').publicForecastSupported).toBe(false);
  });

  it('does not promote a procedural motion about a conference report', () => {
    expect(parseForecastTarget('On the Motion to Recommit the Conference Report')).toMatchObject({
      forecastTarget: 'other_procedural',
      publicForecastSupported: false,
    });
  });

  it('fails closed for ambiguous or missing wording', () => {
    expect(parseForecastTarget('Consideration of the measure')).toMatchObject({
      forecastTarget: 'unknown',
      unsupportedReason: 'unrecognized_target_text',
      publicForecastSupported: false,
    });
    expect(parseForecastTarget(null)).toMatchObject({
      forecastTarget: 'unknown',
      unsupportedReason: 'missing_target_text',
    });
  });

  it('normalizes Unicode punctuation and whitespace without changing raw evidence', () => {
    const result = parseForecastTarget('  On\u00a0Passage — H.R. 1  ');
    expect(result.rawText).toBe('  On\u00a0Passage — H.R. 1  ');
    expect(result.normalizedText).toBe('on passage - h.r. 1');
    expect(result.forecastTarget).toBe('final_passage');
  });
});
