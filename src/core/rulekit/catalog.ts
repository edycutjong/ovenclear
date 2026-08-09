import { UnknownProductError, type ProductCategory } from './types';

/**
 * Product catalog — deterministic bridge over the vocabulary gap
 * (SEED_DATA.md: interview says "sourdough", the rule says
 * "non-potentially-hazardous baked goods"; "my jam" vs "acidified foods").
 *
 * Production augments this with gemini-embedding retrieval; the catalog is
 * the deterministic core the tests regress, and the LLM path may only WIDEN
 * recall, never change a catalog hit.
 */

export interface CatalogEntry {
  canonical: string;
  category: ProductCategory;
  synonyms: string[];
  requiresRefrigeration?: boolean;
  note?: string;
}

export const PRODUCT_CATALOG: CatalogEntry[] = [
  // --- shelf-stable baked goods ---
  { canonical: 'sourdough bread', category: 'baked_shelf_stable', synonyms: ['sourdough', 'sourdough loaf', 'sourdough boule'] },
  { canonical: 'sandwich bread', category: 'baked_shelf_stable', synonyms: ['bread', 'white bread', 'loaf bread', 'yeast bread'] },
  { canonical: 'chocolate chip cookies', category: 'baked_shelf_stable', synonyms: ['cookies', 'cookie', 'drop cookies'] },
  { canonical: 'biscotti', category: 'baked_shelf_stable', synonyms: [] },
  { canonical: 'pound cake', category: 'baked_shelf_stable', synonyms: ['loaf cake', 'bundt cake'] },
  { canonical: 'brownies', category: 'baked_shelf_stable', synonyms: ['brownie'] },
  { canonical: 'muffins', category: 'baked_shelf_stable', synonyms: ['muffin'] },
  { canonical: 'cinnamon rolls', category: 'baked_shelf_stable', synonyms: ['cinnamon buns'], note: 'plain glaze only — cream-cheese frosting is its own (refrigerated) entry' },
  { canonical: 'fruit kolaches', category: 'baked_shelf_stable', synonyms: ['kolaches', 'kolache'] },

  // --- refrigerated / potentially hazardous baked goods ---
  { canonical: 'cheesecake', category: 'baked_refrigerated', synonyms: ['basque cheesecake', 'ny cheesecake', 'new york cheesecake'], requiresRefrigeration: true },
  { canonical: 'custard pie', category: 'baked_refrigerated', synonyms: ['flan', 'creme brulee pie'], requiresRefrigeration: true },
  { canonical: 'cream pie', category: 'baked_refrigerated', synonyms: ['banana cream pie', 'coconut cream pie'], requiresRefrigeration: true },
  { canonical: 'pumpkin pie', category: 'baked_refrigerated', synonyms: [], requiresRefrigeration: true },
  { canonical: 'tres leches cake', category: 'baked_refrigerated', synonyms: ['tres leches'], requiresRefrigeration: true },
  { canonical: 'cinnamon rolls with cream cheese frosting', category: 'baked_refrigerated', synonyms: ['cream cheese cinnamon rolls'], requiresRefrigeration: true },

  // --- confections ---
  { canonical: 'fudge', category: 'confection', synonyms: [] },
  { canonical: 'pralines', category: 'confection', synonyms: ['praline', 'pecan pralines'] },
  { canonical: 'candied pecans', category: 'confection', synonyms: ['spiced pecans', 'candied nuts'] },
  { canonical: 'chocolate bark', category: 'confection', synonyms: ['bark'] },
  { canonical: 'hard candy', category: 'confection', synonyms: ['lollipops', 'candy'] },

  // --- high-acid jams/jellies (standard recipes) ---
  { canonical: 'strawberry jam', category: 'jam_high_acid', synonyms: ['jam'] },
  { canonical: 'peach jelly', category: 'jam_high_acid', synonyms: ['jelly'] },
  { canonical: 'grape jelly', category: 'jam_high_acid', synonyms: [] },
  { canonical: 'orange marmalade', category: 'jam_high_acid', synonyms: ['marmalade'] },

  // --- acidified foods (the jam_june edge) ---
  { canonical: 'tomato jam', category: 'acidified', synonyms: [], note: 'low-acid fruit — acidified-foods rules apply' },
  { canonical: 'salsa', category: 'acidified', synonyms: ['canned salsa', 'salsa roja'] },
  { canonical: 'dill pickles', category: 'acidified', synonyms: ['pickles', 'pickle spears', 'cucumber pickles'] },
  { canonical: 'pickled okra', category: 'acidified', synonyms: [] },
  { canonical: 'bread and butter pickles', category: 'acidified', synonyms: [] },

  // --- fermented ---
  { canonical: 'sauerkraut', category: 'fermented', synonyms: ['kraut'] },
  { canonical: 'kimchi', category: 'fermented', synonyms: [] },

  // --- dry blends ---
  { canonical: 'granola', category: 'dry_blend', synonyms: ['granola mix'] },
  { canonical: 'dried herbs', category: 'dry_blend', synonyms: ['herb mix', 'dried herb blend'] },
  { canonical: 'spice mix', category: 'dry_blend', synonyms: ['spice blend', 'seasoning mix'] },
  { canonical: 'dry soup mix', category: 'dry_blend', synonyms: ['soup mix'] },

  // --- categories that exist to be refused ---
  { canonical: 'beef jerky', category: 'meat', synonyms: ['jerky', 'venison jerky'] },
  { canonical: 'raw milk cheese', category: 'dairy_raw', synonyms: ['raw cheese', 'farmstead raw cheese'] },
  { canonical: 'kombucha', category: 'beverage_fermented', synonyms: ['booch'] },
];

export interface NormalizedProduct {
  input: string;
  canonical: string;
  category: ProductCategory;
  requiresRefrigeration: boolean;
  matchedVia: 'canonical' | 'synonym' | 'token';
}

function clean(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const FILLER_TOKENS = new Set(['my', 'homemade', 'home', 'made', 'fresh', 'the', 'a', 'an', 'of', 'artisan']);

function tokens(s: string): string[] {
  return clean(s)
    .split(' ')
    .filter((t) => t && !FILLER_TOKENS.has(t));
}

/**
 * Deterministic product normalization:
 *   pass 1 — exact canonical match (cleaned)
 *   pass 2 — exact synonym match (cleaned)
 *   pass 3 — token containment: every token of a canonical/synonym phrase
 *            appears in the input (longest phrase wins; ties break
 *            alphabetically by canonical name)
 * Unknown input throws UnknownProductError with top-3 suggestions.
 */
export function normalizeProduct(input: string): NormalizedProduct {
  const cleaned = clean(input);
  if (!cleaned) throw new UnknownProductError(input, []);

  for (const e of PRODUCT_CATALOG) {
    if (clean(e.canonical) === cleaned) return hit(input, e, 'canonical');
  }
  for (const e of PRODUCT_CATALOG) {
    if (e.synonyms.some((s) => clean(s) === cleaned)) return hit(input, e, 'synonym');
  }

  const inputTokens = new Set(tokens(input));
  let best: { entry: CatalogEntry; phraseLen: number } | null = null;
  for (const e of PRODUCT_CATALOG) {
    const phrases = [e.canonical, ...e.synonyms];
    for (const phrase of phrases) {
      const pt = tokens(phrase);
      if (pt.length === 0) continue;
      if (pt.every((t) => inputTokens.has(t))) {
        const phraseLen = pt.length;
        if (
          best === null ||
          phraseLen > best.phraseLen ||
          (phraseLen === best.phraseLen && e.canonical.localeCompare(best.entry.canonical) < 0)
        ) {
          best = { entry: e, phraseLen };
        }
      }
    }
  }
  if (best) return hit(input, best.entry, 'token');

  // Suggestions: rank by shared-token count, then alphabetically.
  const scored = PRODUCT_CATALOG.map((e) => {
    const all = new Set([e.canonical, ...e.synonyms].flatMap((p) => tokens(p)));
    let score = 0;
    for (const t of inputTokens) if (all.has(t)) score++;
    return { canonical: e.canonical, score };
  })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.canonical.localeCompare(b.canonical))
    .slice(0, 3)
    .map((s) => s.canonical);
  throw new UnknownProductError(input, scored);
}

function hit(input: string, e: CatalogEntry, via: NormalizedProduct['matchedVia']): NormalizedProduct {
  return {
    input,
    canonical: e.canonical,
    category: e.category,
    requiresRefrigeration: e.requiresRefrigeration ?? false,
    matchedVia: via,
  };
}
