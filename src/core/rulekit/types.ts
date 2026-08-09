/**
 * Rulekit type layer — the typed-JSON rulepack schema plus the verdict/label/
 * fee surfaces from COMPLEXITY.md §4 (`@ovenclear/rulekit`).
 *
 * ALL rulepack content in this build is FIXTURE data: statute-shaped synthetic
 * text modeled on real cottage-food program structures, never verbatim law.
 */

export type VerdictStatus = 'eligible' | 'license_required' | 'prohibited';

export const VENUE_CODES = [
  'farmers_market',
  'home_pickup',
  'online_instate_shipping',
  'mail_order_interstate',
  'wholesale',
  'event_festival',
] as const;
export type VenueCode = (typeof VENUE_CODES)[number];

export const PRODUCT_CATEGORIES = [
  'baked_shelf_stable',
  'baked_refrigerated',
  'confection',
  'jam_high_acid',
  'acidified',
  'fermented',
  'dry_blend',
  'meat',
  'dairy_raw',
  'beverage_fermented',
] as const;
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export interface Citation {
  id: string; // e.g. "GA-CF-3.1"
  source: string; // human-readable source name (FIXTURE-tagged)
  section: string; // e.g. "Section 3.1"
  quote: string; // must appear verbatim in the pinned snapshot content
  url: string;
  snapshotId: string; // must be one of pack.sourceSnapshots
}

export interface ResolvedCitation extends Citation {
  snapshotHash: string; // resolved + verified against the snapshot store
}

export interface ProductRule {
  id: string;
  category: ProductCategory;
  status: VerdictStatus;
  conditions?: string[]; // e.g. pH lab-verification duty
  citationIds: string[];
  note?: string;
}

export interface VenuePolicy {
  policy: 'allowed' | 'prohibited';
  citationId: string;
}

export interface MandatedSentence {
  id: string;
  /** Must ship on the label byte-for-byte (invariant I2). */
  text: string;
  citationId: string;
}

export type LabelField =
  | 'business_name'
  | 'business_address_line'
  | 'product_name'
  | 'ingredients'
  | 'net_weight'
  | 'allergens';

export interface LabelSpecData {
  mandatedSentences: MandatedSentence[];
  requiredFields: LabelField[];
  allergenRule: {
    mustDeclare: boolean;
    format: 'contains_line';
    citationId: string;
  };
  fieldCitationId: string;
}

/** LabelSpec as returned by the engine: resolved with provenance. */
export interface LabelSpec extends LabelSpecData {
  state: string;
  packVersion: string;
  snapshotHashes: string[];
  fixture: true;
}

export interface FeeItem {
  id: string;
  label: string;
  amountUsd: number;
  estimate?: boolean; // marked when the amount is an estimated third-party cost
  appliesTo?: string;
  citationId: string;
}

export interface FeeTable {
  state: string;
  packVersion: string;
  items: FeeItem[];
  annualRevenueCapUsd: number | null;
  snapshotHashes: string[];
  fixture: true;
}

export interface ChecklistTemplateStep {
  id: string;
  text: string;
  citationId?: string;
  feeId?: string;
}

export interface RulepackProgram {
  programName: string;
  /** Baseline cottage license needed even for "eligible" products. */
  licenseRequiredForBaseline: boolean;
  baselineLicense?: { name: string; annualFeeUsd: number; citationId: string };
  trainingRequired?: { name: string; estFeeUsd?: number; citationId: string };
  annualRevenueCapUsd: number | null;
  capCitationId?: string;
  venues: Record<VenueCode, VenuePolicy>;
}

export interface Rulepack {
  schemaVersion: 1;
  fixture: true; // this build refuses non-fixture packs
  state: string; // "GA"
  stateName: string;
  packVersion: string; // e.g. "2026-07"
  effectiveDate: string; // ISO date
  depth: 'deep' | 'stub';
  /** Content-hash pins of the legal sources this pack was authored from (I1). */
  sourceSnapshots: { snapshotId: string; contentSha256: string }[];
  program: RulepackProgram;
  productRules: ProductRule[];
  labelSpec: LabelSpecData;
  fees: FeeItem[];
  checklists: Record<VerdictStatus, ChecklistTemplateStep[]>;
  citations: Citation[];
}

export interface ReasonedFinding {
  kind: 'product' | 'venue' | 'license' | 'cap' | 'coverage';
  message: string;
  citationIds: string[];
}

export interface ChecklistStep {
  step: number;
  text: string;
  citationId?: string;
  feeUsd?: number;
}

export interface CheckInput {
  state: string;
  product: string; // free-vocabulary product name ("sourdough loaf")
  venue: VenueCode;
  packVersion?: string; // pin a pack version; default = latest registered
  issuedAt?: string; // caller-supplied clock for deterministic fixtures
}

export interface Verdict {
  status: VerdictStatus;
  state: string;
  packVersion: string;
  packDepth: 'deep' | 'stub';
  product: { input: string; canonical: string; category: ProductCategory };
  venue: VenueCode;
  reasons: ReasonedFinding[];
  conditions: string[];
  citations: ResolvedCitation[];
  /** Union of snapshot hashes the verdict relies on. NEVER empty (I1). */
  snapshotHashes: string[];
  checklist: ChecklistStep[];
  fees: FeeTable;
  annualRevenueCapUsd: number | null;
  issuedAt: string;
  /** SHA-256 of canonical verdict content (excludes issuedAt + this field). */
  verdictHash: string;
  fixture: true;
}

export interface RuleDelta {
  id: string;
  state: string;
  fromSnapshotHash: string;
  toSnapshotHash: string;
  kind: 'added' | 'removed' | 'changed';
  section: string; // nearest preceding "Section N." heading, or "(preamble)"
  before: string | null;
  after: string | null;
  excerpt: string; // unified "-/+" excerpt, truncated
}

export class UnsupportedStateError extends Error {
  constructor(public readonly state: string) {
    super(
      `state "${state}" has no registered rulepack — production routes this to the made-to-order research path`,
    );
    this.name = 'UnsupportedStateError';
  }
}

export class UnknownProductError extends Error {
  constructor(
    public readonly input: string,
    public readonly suggestions: string[],
  ) {
    super(
      `product "${input}" is not in the catalog; closest: ${suggestions.join(', ') || '(none)'}`,
    );
    this.name = 'UnknownProductError';
  }
}

export class CoverageGapError extends Error {
  constructor(state: string, category: ProductCategory) {
    super(
      `rulepack for ${state} does not cover category "${category}" — refusing to guess (fails closed)`,
    );
    this.name = 'CoverageGapError';
  }
}

export class RulepackValidationError extends Error {
  constructor(
    public readonly packRef: string,
    public readonly problems: string[],
  ) {
    super(`rulepack ${packRef} failed validation:\n- ${problems.join('\n- ')}`);
    this.name = 'RulepackValidationError';
  }
}
