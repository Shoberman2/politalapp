// Types for shared/billExplainer.js, for the TypeScript ETL.

export const EXPLAINER_MODEL: string
export const EXPLAINER_PROMPT_VERSION: number
export const GUESS_RE: RegExp

export interface BillKey { congress: number; type: string; number: number }

export interface ExplanationSource { kind?: string | null; label?: string | null; date?: string | null; url?: string | null }

export interface ExplanationRow {
  bill_key: string
  model: string
  prompt_version: number
  bill_title: string | null
  explanation: string
  paragraphs: string[]
  key_points: string[]
  source_kind: string
  source_label: string
  source_date: string | null
  source_url: string | null
}

export interface ModelUsage { prompt_tokens?: number; completion_tokens?: number }

export type ExplainResult =
  | { status: 'ok'; row: ExplanationRow; usage: ModelUsage[] }
  | { status: 'no_source'; usage?: undefined; row?: undefined; reason?: undefined }
  | { status: 'rejected'; reason: string; usage: ModelUsage[]; row?: undefined }

export function parseBillKey(key: string): BillKey | null
export function isResolution(type: string): boolean
export function explanationSourceLine(src: ExplanationSource | null | undefined): string
export function billHtmlToText(html: string): string
export function summaryHtmlToText(html: string): string
export function billOutline(text: string): string
export function fetchBillSources(key: BillKey, opts?: { apiKey?: string; crsSummary?: string | null }): Promise<{ text: string | null; version: { label: string; date: string | null; url: string } | null; summary: string | null }>
export function buildPrompt(args: { key: BillKey; title: string | null; sources: { text: string | null; version: { label: string } | null; summary: string | null } }): string
export function parseModelOutput(raw: string): { error: string } | { error?: undefined; summary: string; paragraphs: string[]; keyPoints: string[] }
export function explainBill(
  bill: { key: BillKey | null; title: string | null; crsSummary?: string | null },
  keys: { congressApiKey?: string; openaiApiKey?: string }
): Promise<ExplainResult>
