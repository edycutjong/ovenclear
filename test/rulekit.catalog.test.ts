import { describe, expect, it } from 'vitest';
import { normalizeProduct } from '../src/core/rulekit/catalog';
import { UnknownProductError } from '../src/core/rulekit/types';

describe('product catalog normalization (the vocabulary gap)', () => {
  it('maps "sourdough" to the canonical shelf-stable bread', () => {
    const p = normalizeProduct('sourdough');
    expect(p.canonical).toBe('sourdough bread');
    expect(p.category).toBe('baked_shelf_stable');
    expect(p.requiresRefrigeration).toBe(false);
  });

  it('matches synonyms case/whitespace-insensitively', () => {
    const p = normalizeProduct('  Sourdough   LOAF ');
    expect(p.canonical).toBe('sourdough bread');
    expect(p.matchedVia).toBe('synonym');
  });

  it('bridges filler words via token matching ("my homemade sourdough")', () => {
    const p = normalizeProduct('my homemade sourdough');
    expect(p.canonical).toBe('sourdough bread');
    expect(p.matchedVia).toBe('token');
  });

  it('maps cheesecake to the refrigerated (potentially hazardous) category', () => {
    const p = normalizeProduct('cheesecake');
    expect(p.category).toBe('baked_refrigerated');
    expect(p.requiresRefrigeration).toBe(true);
  });

  it('maps "tomato jam" to acidified — NOT to high-acid jam (the jam_june edge)', () => {
    expect(normalizeProduct('tomato jam').category).toBe('acidified');
    expect(normalizeProduct('strawberry jam').category).toBe('jam_high_acid');
  });

  it('maps "pickles" to dill pickles (acidified) and "salsa roja" to salsa', () => {
    expect(normalizeProduct('pickles').canonical).toBe('dill pickles');
    expect(normalizeProduct('salsa roja').canonical).toBe('salsa');
  });

  it('distinguishes plain cinnamon rolls from cream-cheese-frosted ones', () => {
    expect(normalizeProduct('cinnamon rolls').category).toBe('baked_shelf_stable');
    expect(normalizeProduct('cinnamon rolls with cream cheese frosting').category).toBe('baked_refrigerated');
  });

  it('throws UnknownProductError with ranked suggestions for near-misses', () => {
    try {
      normalizeProduct('wedding cake pops');
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(UnknownProductError);
      const err = e as UnknownProductError;
      expect(err.suggestions.length).toBeGreaterThan(0);
      expect(err.suggestions.some((s) => s.includes('cake'))).toBe(true);
    }
  });

  it('throws with empty suggestions when nothing shares a token', () => {
    try {
      normalizeProduct('quixotic zephyr snacks');
      expect.unreachable('should have thrown');
    } catch (e) {
      expect((e as UnknownProductError).suggestions).toEqual([]);
    }
  });

  it('is deterministic (same input → same canonical, repeatedly)', () => {
    const runs = Array.from({ length: 5 }, () => normalizeProduct('kraut').canonical);
    expect(new Set(runs).size).toBe(1);
    expect(runs[0]).toBe('sauerkraut');
  });
});
