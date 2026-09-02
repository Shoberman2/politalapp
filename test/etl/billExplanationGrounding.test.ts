import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const edgeSource = readFileSync(
  resolve(process.cwd(), 'supabase/functions/explain-bill/index.ts'),
  'utf8',
);
const prewarmSource = readFileSync(
  resolve(process.cwd(), 'etl/preWarmBillExplanations.ts'),
  'utf8',
);

describe('bill explanation grounding contract', () => {
  it('never authorizes title-only inference in the Edge Function', () => {
    expect(edgeSource).not.toMatch(/Reason from the title/i);
    expect(edgeSource).not.toMatch(/most likely concrete effects/i);
    expect(edgeSource).toMatch(/official CRS summaries/i);
    expect(edgeSource).toMatch(/MODEL = 'official-crs'/);
    expect(edgeSource).toMatch(/PROMPT_VERSION = 1/);
    expect(edgeSource).not.toMatch(/api\.openai\.com/);
    expect(edgeSource).toContain('api.congress.gov/v3/bill');
    expect(edgeSource).toContain("Deno.env.get('CONGRESS_API_KEY')");
    expect(edgeSource).not.toMatch(/body\?\.summary/);
    expect(edgeSource).toContain('officialBill.summary');
  });

  it('pre-warms only bills with official CRS summaries using the same cache version', () => {
    expect(prewarmSource).toMatch(/select\('id, title, crs_summary'\)/);
    expect(prewarmSource).toMatch(/MODEL = 'official-crs'/);
    expect(prewarmSource).toMatch(/PROMPT_VERSION = 1/);
    expect(prewarmSource).not.toMatch(/generateExplanationWithOpenAI/);
    expect(prewarmSource).not.toMatch(/Reason from the title/i);
  });

  it('renders official summary text without injecting remote HTML', () => {
    const billDetailSource = readFileSync(
      resolve(process.cwd(), 'src/components/BillDetail.jsx'),
      'utf8',
    );
    expect(billDetailSource).not.toContain('dangerouslySetInnerHTML');
  });
});
