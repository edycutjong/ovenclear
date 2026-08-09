import type { ProductCategory, RuleDelta } from '../rulekit/types';

/**
 * Materiality classification adapter boundary.
 *
 * The law-watch loop classifies each RuleDelta as material / immaterial /
 * cosmetic with a scope. Production uses Gemini 2.5 Pro with responseSchema
 * (see gemini.ts, key-gated); tests and offline runs use the
 * DeterministicMockAdapter below, which mirrors the exact same result schema.
 */

export type Materiality = 'material' | 'immaterial' | 'cosmetic';

export type DeltaScope =
  | 'label_text' // the mandated label wording itself changed → labels stale
  | 'eligibility' // what may be sold changed → verdicts may flip
  | 'fees' // fee amounts changed → checklists stale
  | 'venue' // where sales are allowed changed
  | 'license' // licensing/permits changed
  | 'admin' // contact info, office hours, portal churn
  | 'formatting'; // whitespace / punctuation / cosmetic re-wording

export interface MaterialityResult {
  deltaId: string;
  classification: Materiality;
  scope: DeltaScope;
  rationale: string;
  /** For eligibility-scoped deltas: which product categories the change touches. */
  affectedCategories: ProductCategory[];
}

export interface ClassifyRequest {
  state: string;
  deltas: RuleDelta[];
}

export interface GeminiAdapter {
  readonly name: string;
  classifyMateriality(req: ClassifyRequest): Promise<MaterialityResult[]>;
}

/** Collapse whitespace + strip punctuation/case for cosmetic-change detection. */
function normalizeForCosmetic(s: string | null): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}$]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const CATEGORY_KEYWORDS: [RegExp, ProductCategory][] = [
  [/pickle|pickled|acidified|salsa/i, 'acidified'],
  [/ferment/i, 'fermented'],
  [/refrigerat|potentially hazardous|cheesecake|custard/i, 'baked_refrigerated'],
  [/baked|bread|cookie|cake/i, 'baked_shelf_stable'],
  [/jam|jelly|marmalade/i, 'jam_high_acid'],
  [/candy|confection|fudge/i, 'confection'],
  [/meat|poultry|jerky/i, 'meat'],
  [/raw (milk|dairy)/i, 'dairy_raw'],
  [/kombucha|fermented beverage/i, 'beverage_fermented'],
];

function extractCategories(text: string): ProductCategory[] {
  const out: ProductCategory[] = [];
  for (const [re, cat] of CATEGORY_KEYWORDS) {
    if (re.test(text) && !out.includes(cat)) out.push(cat);
  }
  return out;
}

/**
 * DeterministicMockAdapter — the offline stand-in used by tests, seed, bench
 * and the self-test. Pure function of the delta text; rule order (first hit
 * wins):
 *   1. normalized(before) === normalized(after)        → cosmetic/formatting
 *   2. contact/phone/hours/email churn                 → immaterial/admin
 *   3. label statement wording                         → material/label_text
 *   4. dollar amounts / fees                           → material/fees
 *   5. venue / sales-channel rules                     → material/venue
 *   6. eligibility lists (eligible/prohibited/pickled…) → material/eligibility
 *   7. license/permit requirements                     → material/license
 *   8. DEFAULT (conservative)                          → material/eligibility
 * The default is deliberately material: a compliance watcher must fail
 * toward review, not toward silence.
 */
export class DeterministicMockAdapter implements GeminiAdapter {
  readonly name = 'mock:deterministic-v1';

  classifyMateriality(req: ClassifyRequest): Promise<MaterialityResult[]> {
    return Promise.resolve(req.deltas.map((d) => this.classifyOne(d)));
  }

  classifyOne(d: RuleDelta): MaterialityResult {
    const joined = `${d.section}\n${d.before ?? ''}\n${d.after ?? ''}`;
    const base = { deltaId: d.id, affectedCategories: [] as ProductCategory[] };

    if (
      d.kind === 'changed' &&
      normalizeForCosmetic(d.before) === normalizeForCosmetic(d.after)
    ) {
      return {
        ...base,
        classification: 'cosmetic',
        scope: 'formatting',
        rationale: 'before/after are identical once whitespace, case and punctuation are normalized',
      };
    }
    if (/phone|office hours|contact email|contact:|fax/i.test(joined)) {
      return {
        ...base,
        classification: 'immaterial',
        scope: 'admin',
        rationale: 'administrative contact-information churn; no compliance duty changes',
      };
    }
    if (/exact statement|must bear|label(?:ing)? statement|following statement|statement:/i.test(joined)) {
      return {
        ...base,
        classification: 'material',
        scope: 'label_text',
        rationale: 'the mandated label statement wording changed — issued labels no longer carry the required sentence',
      };
    }
    if (/fee|\$\s?\d/i.test(joined) && digitsOf(d.before) !== digitsOf(d.after)) {
      return {
        ...base,
        classification: 'material',
        scope: 'fees',
        rationale: 'a fee amount changed — checklists and fee tables must be refreshed',
      };
    }
    if (/venue|wholesale|farmers market|direct[- ]to[- ]consumer|internet sales|shipping/i.test(joined)) {
      return {
        ...base,
        classification: 'material',
        scope: 'venue',
        rationale: 'permitted sales channels changed',
      };
    }
    if (/eligible|prohibited|may be sold|may not be sold|pickle|ferment|acidified|potentially hazardous/i.test(joined)) {
      return {
        ...base,
        classification: 'material',
        scope: 'eligibility',
        rationale: 'the set of foods that may be sold changed — verdicts may flip',
        affectedCategories: extractCategories(joined),
      };
    }
    if (/license|permit|registration|certificate/i.test(joined)) {
      return {
        ...base,
        classification: 'material',
        scope: 'license',
        rationale: 'licensing or registration duties changed',
      };
    }
    return {
      ...base,
      classification: 'material',
      scope: 'eligibility',
      rationale: 'unrecognized substantive change — conservative default is material (fail toward review)',
      affectedCategories: extractCategories(joined),
    };
  }
}

function digitsOf(s: string | null): string {
  return (s ?? '').replace(/[^0-9.]/g, '');
}

export const MATERIALITIES: readonly Materiality[] = ['material', 'immaterial', 'cosmetic'];
export const DELTA_SCOPES: readonly DeltaScope[] = [
  'label_text',
  'eligibility',
  'fees',
  'venue',
  'license',
  'admin',
  'formatting',
];
