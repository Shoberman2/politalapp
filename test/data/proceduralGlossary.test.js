import { describe, it, expect } from 'vitest';
import { PROCEDURAL_GLOSSARY, GLOSSARY_FLAT } from '../../src/data/proceduralGlossary.js';

describe('PROCEDURAL_GLOSSARY structure', () => {
  it('has at least 40 terms (extended from VotingHistory.jsx 21-term baseline)', () => {
    const count = Object.keys(PROCEDURAL_GLOSSARY).length;
    expect(count).toBeGreaterThanOrEqual(40);
  });

  it('every entry has a non-empty definition', () => {
    for (const [term, entry] of Object.entries(PROCEDURAL_GLOSSARY)) {
      expect(entry.definition, `${term} should have a definition`).toBeTruthy();
      expect(typeof entry.definition).toBe('string');
      expect(entry.definition.length).toBeGreaterThan(20);
    }
  });

  it('every entry has a valid category', () => {
    const valid = ['procedural', 'substantive', 'role', 'process'];
    for (const [term, entry] of Object.entries(PROCEDURAL_GLOSSARY)) {
      expect(valid, `${term} category "${entry.category}" should be valid`).toContain(entry.category);
    }
  });

  it('all keys are lowercase', () => {
    for (const term of Object.keys(PROCEDURAL_GLOSSARY)) {
      expect(term).toBe(term.toLowerCase());
    }
  });

  it('has no duplicate keys (Object cannot have duplicates, sanity check)', () => {
    const keys = Object.keys(PROCEDURAL_GLOSSARY);
    const unique = new Set(keys);
    expect(unique.size).toBe(keys.length);
  });

  it('includes the canonical procedural action terms', () => {
    const required = [
      'cloture',
      'tabled',
      'motion to recommit',
      'motion to suspend',
      'motion to proceed',
      'previous question',
      'amendment',
      'sponsor',
      'cosponsor',
    ];
    for (const term of required) {
      expect(PROCEDURAL_GLOSSARY).toHaveProperty(term);
    }
  });

  it('includes new procedural-vote-specific terms added in PR 1', () => {
    const newTerms = [
      'motion to table',
      'motion to commit',
      'motion to discharge',
      'point of order',
      'approve the journal',
      'filibuster',
    ];
    for (const term of newTerms) {
      expect(PROCEDURAL_GLOSSARY, `expected new term "${term}"`).toHaveProperty(term);
    }
  });
});

describe('GLOSSARY_FLAT', () => {
  it('flattens the structured glossary to {term: definition} form', () => {
    for (const [term, entry] of Object.entries(PROCEDURAL_GLOSSARY)) {
      expect(GLOSSARY_FLAT[term]).toBe(entry.definition);
    }
  });

  it('has the same keys as PROCEDURAL_GLOSSARY', () => {
    expect(Object.keys(GLOSSARY_FLAT).sort()).toEqual(
      Object.keys(PROCEDURAL_GLOSSARY).sort()
    );
  });
});
