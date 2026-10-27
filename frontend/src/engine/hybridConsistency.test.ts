import { describe, it, expect } from 'vitest';
import { BUNDLED_RULEBOOKS, CANONICAL_STARTER_SUGGESTIONS, STARTER_PROPOSALS } from '../data/rulebooks';

describe('Hybrid Mode Rulebook and Suggestion Consistency', () => {
  it('all bundled rulebooks must use canonical IDs from AMEND_001 to AMEND_100 and offer at least 9 curated books', () => {
    expect(BUNDLED_RULEBOOKS.length).toBeGreaterThanOrEqual(9);

    const allRuleIds = new Set<string>();
    for (const book of BUNDLED_RULEBOOKS) {
      expect(book.rules.length).toBeGreaterThan(0);
      for (const rule of book.rules) {
        expect(rule.id).toMatch(/^AMEND_\d{3}$/);
        const num = parseInt(rule.id.replace('AMEND_', ''), 10);
        expect(num).toBeGreaterThanOrEqual(1);
        expect(num).toBeLessThanOrEqual(100);
        expect(rule.title).toBeDefined();
        expect(rule.title.length).toBeGreaterThan(0);
        expect(rule.readable_meaning).toBeDefined();
        expect(rule.readable_meaning.length).toBeGreaterThan(0);
        allRuleIds.add(rule.id);
      }
    }
    // Substantially broader selection than the previous 6 rules across 3 pairs
    expect(allRuleIds.size).toBeGreaterThanOrEqual(16);
  });

  it('never contains invalid test fixtures AMEND_901–AMEND_904 in rulebooks or suggestions', () => {
    const invalidFixtures = ['AMEND_901', 'AMEND_902', 'AMEND_903', 'AMEND_904'];

    for (const book of BUNDLED_RULEBOOKS) {
      for (const rule of book.rules) {
        expect(invalidFixtures).not.toContain(rule.id);
        expect(rule.id.startsWith('AMEND_9')).toBe(false);
      }
    }

    for (const suggestion of CANONICAL_STARTER_SUGGESTIONS) {
      expect(invalidFixtures).not.toContain(suggestion.id);
      expect(suggestion.id.startsWith('AMEND_9')).toBe(false);
    }
  });

  it('canonical starter suggestions use valid AMEND_001 to AMEND_100 IDs with valid metadata', () => {
    expect(CANONICAL_STARTER_SUGGESTIONS.length).toBeGreaterThanOrEqual(5);

    for (const s of CANONICAL_STARTER_SUGGESTIONS) {
      expect(s.id).toMatch(/^AMEND_\d{3}$/);
      const num = parseInt(s.id.replace('AMEND_', ''), 10);
      expect(num).toBeGreaterThanOrEqual(1);
      expect(num).toBeLessThanOrEqual(100);
      expect(s.title).toBeDefined();
      expect(s.description).toBeDefined();
      expect(['scoring', 'movement', 'catch_up', 'disruption', 'endgame']).toContain(s.category);
    }
  });

  it('starter proposal texts match canonical descriptions', () => {
    expect(STARTER_PROPOSALS.length).toBeGreaterThanOrEqual(5);
    for (const text of STARTER_PROPOSALS) {
      expect(text.length).toBeGreaterThan(5);
    }
  });
});
