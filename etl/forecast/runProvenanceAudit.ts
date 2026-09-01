import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildProvenanceAuditReport,
  type ProvenanceAuditDocument,
} from './provenanceReport.js';

const inputPath = process.argv[2];
if (!inputPath) throw new Error('usage: runProvenanceAudit <audit-document.json>');

const document = JSON.parse(
  readFileSync(resolve(process.cwd(), inputPath), 'utf8'),
) as ProvenanceAuditDocument;
const report = buildProvenanceAuditReport(document);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (report.decision !== 'GO') process.exitCode = 2;
