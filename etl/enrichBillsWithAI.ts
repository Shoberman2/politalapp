/**
 * AI Enrichment Module - Bill Summaries & Topic Tags
 *
 * Uses AI to generate human-readable summaries for bills.
 *
 * CRITICAL SAFETY RULES:
 * 1. AI is ONLY used for non-factual enrichment (summaries, topics)
 * 2. AI must NEVER invent, infer, or modify vote data
 * 3. AI output is cached in bills.summary
 * 4. AI is only called if summary is missing or explicitly requested
 *
 * This module can use either OpenAI or Anthropic's Claude API.
 */

import type { Bill, ETLConfig } from './types.js';
import { logger, sleep, retry } from './utils.js';
import { getBillsNeedingSummaries, updateBillSummary } from './load.js';

// =============================================================================
// AI CLIENT CONFIGURATION
// =============================================================================

interface AIConfig {
  provider: 'openai' | 'anthropic';
  apiKey: string;
  model: string;
}

function isAIUnavailableError(message: string): boolean {
  return (
    /API key.*not configured/i.test(message) ||
    /429/.test(message) ||
    /quota/i.test(message) ||
    /billing/i.test(message)
  );
}

function getAIConfig(config: ETLConfig): AIConfig | null {
  const openaiKey = config.openaiApiKey || process.env.OPENAI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (anthropicKey) {
    return {
      provider: 'anthropic',
      apiKey: anthropicKey,
      model: 'claude-3-haiku-20240307', // Cost-effective for summaries
    };
  }

  if (openaiKey) {
    return {
      provider: 'openai',
      apiKey: openaiKey,
      model: 'gpt-4o-mini', // Cost-effective for summaries
    };
  }

  return null;
}

// =============================================================================
// SUMMARY GENERATION
// =============================================================================

const SUMMARY_SYSTEM_PROMPT = `You are a nonpartisan assistant that summarizes U.S. congressional bills.

Your task is to create clear, accessible summaries that help citizens understand what a bill does.

Guidelines:
- Be objective and nonpartisan
- Use plain language accessible to general audiences
- Focus on what the bill DOES, not opinions about it
- Keep summaries concise (2-3 sentences)
- Mention key provisions without getting into excessive detail
- Do NOT include any voting information or predictions
- Do NOT state opinions about whether the bill is good or bad

If the bill title is not descriptive enough to summarize, say:
"This bill's specific provisions are not clear from its title alone."`;

const SUMMARY_USER_PROMPT = (title: string, billId: string): string =>
  `Please provide a brief, nonpartisan summary of this U.S. congressional bill:

Bill ID: ${billId}
Title: ${title}

Summarize in 2-3 sentences what this bill would do if passed.`;

/**
 * Generates a summary for a single bill using AI.
 */
async function generateBillSummary(
  bill: Bill,
  aiConfig: AIConfig
): Promise<string | null> {
  const prompt = SUMMARY_USER_PROMPT(bill.title, bill.id);

  if (aiConfig.provider === 'openai') {
    return await callOpenAI(aiConfig, SUMMARY_SYSTEM_PROMPT, prompt);
  }

  return await callAnthropic(aiConfig, SUMMARY_SYSTEM_PROMPT, prompt);
}

/**
 * Calls OpenAI API to generate a summary.
 */
async function callOpenAI(
  config: AIConfig,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const response = await retry(async () => {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 300,
        temperature: 0.3, // Low temperature for consistency
      }),
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`OpenAI API error: ${res.status} ${error}`);
    }

    return res.json();
  });

  return response.choices[0]?.message?.content?.trim() || '';
}

/**
 * Calls Anthropic Claude API to generate a summary.
 */
async function callAnthropic(
  config: AIConfig,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const response = await retry(async () => {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: 300,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Anthropic API error: ${res.status} ${error}`);
    }

    return res.json();
  });

  const content = response.content?.[0];
  return content?.type === 'text' ? content.text.trim() : '';
}

// =============================================================================
// MAIN ENRICHMENT FUNCTION
// =============================================================================

export interface EnrichmentResult {
  billsProcessed: number;
  summariesGenerated: number;
  errors: string[];
}

/**
 * Enriches bills with AI-generated summaries.
 *
 * Only processes bills that don't already have summaries.
 */
export async function enrichBillsWithSummaries(
  config: ETLConfig,
  maxBills: number = 50
): Promise<EnrichmentResult> {
  const result: EnrichmentResult = {
    billsProcessed: 0,
    summariesGenerated: 0,
    errors: [],
  };

  // Check if AI is configured
  const aiConfig = getAIConfig(config);
  if (!aiConfig) {
    logger.warn('No AI API key configured, skipping bill enrichment');
    result.errors.push('No AI API key configured (OPENAI_API_KEY or ANTHROPIC_API_KEY)');
    return result;
  }

  logger.info(`Using ${aiConfig.provider} (${aiConfig.model}) for bill summaries`);

  // Fetch bills needing summaries
  const bills = await getBillsNeedingSummaries(config, maxBills);

  if (bills.length === 0) {
    logger.info('No bills need summaries');
    return result;
  }

  logger.info(`Found ${bills.length} bills needing summaries`);

  // Process each bill
  for (const bill of bills) {
    result.billsProcessed++;

    try {
      const summary = await generateBillSummary(bill, aiConfig);

      if (summary) {
        const updated = await updateBillSummary(config, bill.id, summary);

        if (updated) {
          result.summariesGenerated++;
          logger.debug(`Generated summary for ${bill.id}: ${summary.substring(0, 100)}...`);
        } else {
          result.errors.push(`Failed to save summary for bill ${bill.id}`);
        }
      } else {
        result.errors.push(`Failed to generate summary for bill ${bill.id}`);
      }

      // Rate limiting between AI calls
      await sleep(500);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(`Bill ${bill.id}: ${message}`);
      if (isAIUnavailableError(message)) {
        logger.warn(`AI enrichment stopped early: ${message}`);
        break;
      }
      logger.error(`Error enriching bill ${bill.id}: ${message}`);
    }
  }

  logger.info(`Enrichment complete: ${result.summariesGenerated}/${result.billsProcessed} summaries generated`);

  return result;
}

// =============================================================================
// TOPIC TAGGING (OPTIONAL)
// =============================================================================

const TOPIC_CATEGORIES = [
  'Healthcare',
  'Defense & Military',
  'Economy & Finance',
  'Education',
  'Environment & Climate',
  'Immigration',
  'Infrastructure',
  'Justice & Law',
  'Social Security & Welfare',
  'Technology',
  'Foreign Policy',
  'Taxation',
  'Agriculture',
  'Civil Rights',
  'Other',
] as const;

export type TopicCategory = (typeof TOPIC_CATEGORIES)[number];

const TOPIC_SYSTEM_PROMPT = `You are a nonpartisan assistant that categorizes U.S. congressional bills by topic.

Available categories:
${TOPIC_CATEGORIES.map((t) => `- ${t}`).join('\n')}

Guidelines:
- Choose the single most relevant category
- Be objective and nonpartisan
- Base your choice only on the bill's title and summary
- Respond with ONLY the category name, nothing else`;

/**
 * Generates a topic tag for a bill using AI.
 *
 * This is optional functionality - not enabled by default.
 */
export async function generateBillTopic(
  bill: Bill,
  config: ETLConfig
): Promise<TopicCategory | null> {
  const aiConfig = getAIConfig(config);
  if (!aiConfig) {
    return null;
  }

  const userPrompt = `Categorize this bill:
Title: ${bill.title}
${bill.summary ? `Summary: ${bill.summary}` : ''}

Respond with only the category name.`;

  try {
    let response: string;

    if (aiConfig.provider === 'openai') {
      response = await callOpenAI(aiConfig, TOPIC_SYSTEM_PROMPT, userPrompt);
    } else {
      response = await callAnthropic(aiConfig, TOPIC_SYSTEM_PROMPT, userPrompt);
    }

    // Validate the response is a known category
    const category = TOPIC_CATEGORIES.find(
      (c) => c.toLowerCase() === response.toLowerCase().trim()
    );

    return category || 'Other';
  } catch (error) {
    logger.error(`Failed to generate topic for bill ${bill.id}`, error);
    return null;
  }
}
