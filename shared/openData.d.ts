// Types for shared/openData.js (used by the TypeScript exporter).
export interface OpenDataField { name: string; type: 'string' | 'integer' | 'number' | 'boolean' | 'date'; description: string; constraints?: Record<string, unknown> }
export interface OpenDataForeignKey { fields: string; reference: { resource: string; fields: string } }
export interface OpenDataTable {
  table: string
  title: string
  description: string
  scopes: Array<'all' | 'congress'>
  primaryKey: string[]
  foreignKeys: OpenDataForeignKey[]
  optional?: boolean
  fields: OpenDataField[]
}
export interface OpenDataFormat { format: string; ext: string; mediatype: string; label: string }
export interface OpenDataFile { path: string; table: string; scope: 'all' | 'congress'; congress: number | null; format: string; mediatype: string; encoding: 'gzip'; url: string }

export const SITE_ORIGIN: string
export const OPEN_DATA_PATH: string
export const OPEN_DATA_BASE_URL: string
export const OPEN_DATA_ARCHIVE_PATH: string
export const MANIFEST_URL: string
export const DATAPACKAGE_URL: string
export const DATASETS_API_URL: string
export const OPEN_DATA_BUCKET: string
export const OPEN_DATA_STORAGE_BASE: string
export const LATEST_PREFIX: string
export const KEEP_DATED_SNAPSHOTS: number
export const DATA_LICENSE: { id: string; name: string; title: string; path: string; legalcode: string }
export const DATA_SOURCES: Array<{ title: string; path: string; notes: string }>
export const ATTRIBUTION: string
export const CITATION: string
export const UPDATE_CADENCE: string
export const OPEN_DATA_TABLES: OpenDataTable[]
export const OPEN_DATA_FORMATS: OpenDataFormat[]
export function fileStem(table: string, scope: string, congress: number): string
export function fileName(table: string, scope: string, congress: number, format: string): string
export function resourceName(table: string, scope: string, congress: number): string
export function openDataFiles(congress: number): OpenDataFile[]
export function currentCongress(date?: Date): number
