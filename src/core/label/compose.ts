import { canonicalHash, sha256Hex } from '../util/canonical';
import type { LabelSpec, Verdict } from '../rulekit/types';

/**
 * Label engine — deterministic composition of the canonical label artifact.
 *
 * The label here is a canonical TEXT + JSON artifact (the moat is the content
 * and its provenance). Production renders this artifact to PDF via a
 * deterministic HTML template (ARCHITECTURE.md); rendering is deliberately
 * NOT generative — mandated text must be verbatim (SPONSOR_DEFENSE.md #3).
 */

/** FDA major-allergen derivation table (deterministic; FIXTURE-scoped). */
const ALLERGEN_MAP: Record<string, string> = {
  'wheat flour': 'wheat',
  'bread flour': 'wheat',
  'all-purpose flour': 'wheat',
  flour: 'wheat',
  wheat: 'wheat',
  butter: 'milk',
  milk: 'milk',
  cream: 'milk',
  'cream cheese': 'milk',
  buttermilk: 'milk',
  'condensed milk': 'milk',
  egg: 'egg',
  eggs: 'egg',
  pecans: 'tree nuts',
  walnuts: 'tree nuts',
  almonds: 'tree nuts',
  'almond flour': 'tree nuts',
  peanut: 'peanuts',
  peanuts: 'peanuts',
  'peanut butter': 'peanuts',
  'soy flour': 'soy',
  soy: 'soy',
  'sesame seeds': 'sesame',
  sesame: 'sesame',
};

export function deriveAllergens(ingredients: string[]): string[] {
  const found = new Set<string>();
  for (const raw of ingredients) {
    const ing = raw.toLowerCase().trim();
    for (const [needle, allergen] of Object.entries(ALLERGEN_MAP)) {
      // word-boundary containment so "flour" hits "wheat flour" but not "sunflower oil"
      const re = new RegExp(`(^|[^a-z])${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z])`);
      if (re.test(ing)) found.add(allergen);
    }
  }
  return [...found].sort();
}

export function allergenLine(ingredients: string[]): string | null {
  const allergens = deriveAllergens(ingredients);
  if (allergens.length === 0) return null;
  return `CONTAINS: ${allergens.map((a) => a.toUpperCase()).join(', ')}`;
}

export interface LabelInput {
  qrId: string; // stable per order-label (from LabelRegistry)
  businessName: string;
  addressLine: string; // "Marietta, GA" — fixture posture; production stores full address encrypted
  productName: string;
  ingredients: string[]; // descending order of predominance (seller's duty)
  netWeight?: string;
  spec: LabelSpec;
  verdict: Verdict;
  issuedAt: string;
  qrBaseUrl?: string; // default fixture URL
  reissueOf?: string; // previous labelId when re-issuing
  reissueReason?: string;
}

export interface LabelProvenance {
  labelId: string;
  qrId: string;
  qrUrl: string;
  sha256: string;
  state: string;
  packVersion: string;
  snapshotHashes: string[];
  verdictHash: string;
  issuedAt: string;
  reissueOf: string | null;
  reissueReason: string | null;
  fixture: true;
}

export interface LabelArtifact {
  labelId: string; // per-issue id, derived from content
  qrId: string; // stable across re-issues
  qrUrl: string;
  state: string;
  packVersion: string;
  lines: string[];
  text: string; // canonical rendering — the byte surface QA checks
  fields: {
    businessName: string;
    addressLine: string;
    productName: string;
    ingredients: string[];
    netWeight: string | null;
    allergenLine: string | null;
  };
  mandatedSentenceIds: string[];
  snapshotHashes: string[];
  verdictHash: string;
  issuedAt: string;
  sha256: string; // sha256 of `text`
  provenance: LabelProvenance;
  fixture: true;
}

export class LabelComposeError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'LabelComposeError';
  }
}

const DEFAULT_QR_BASE = 'https://ovenclear.example/label'; // FIXTURE base URL

/**
 * Deterministic label composition. Same input → byte-identical artifact
 * (labelId, text, sha256 all stable) — required by `seed --check`.
 */
export function composeLabel(input: LabelInput): LabelArtifact {
  const spec = input.spec;
  if (!input.businessName.trim()) throw new LabelComposeError('businessName required');
  if (!input.productName.trim()) throw new LabelComposeError('productName required');
  if (spec.requiredFields.includes('ingredients') && input.ingredients.length === 0) {
    throw new LabelComposeError(`ingredients required by ${spec.state} label spec`);
  }
  if (spec.requiredFields.includes('net_weight') && !input.netWeight?.trim()) {
    throw new LabelComposeError(`net weight required by ${spec.state} label spec`);
  }
  if (input.verdict.state !== spec.state) {
    throw new LabelComposeError(`verdict state ${input.verdict.state} does not match spec state ${spec.state}`);
  }
  if (input.verdict.status === 'prohibited') {
    throw new LabelComposeError('refusing to compose a label for a prohibited verdict (fails closed)');
  }

  const ingredients = input.ingredients.map((i) => i.trim()).filter(Boolean);
  const contains = spec.allergenRule.mustDeclare ? allergenLine(ingredients) : null;
  const qrBase = input.qrBaseUrl ?? DEFAULT_QR_BASE;
  const qrUrl = `${qrBase}/${input.qrId}`;

  const lines: string[] = [];
  lines.push(input.businessName.trim());
  if (spec.requiredFields.includes('business_address_line')) lines.push(input.addressLine.trim());
  lines.push(`Product: ${input.productName.trim()}`);
  if (spec.requiredFields.includes('ingredients')) {
    lines.push(`Ingredients: ${ingredients.join(', ')}`);
  }
  if (input.netWeight?.trim()) lines.push(`Net Wt: ${input.netWeight.trim()}`);
  if (contains) lines.push(contains);
  for (const m of spec.mandatedSentences) lines.push(m.text); // VERBATIM — never templated
  lines.push(`Issued ${input.issuedAt.slice(0, 10)} · Verify: ${qrUrl}`);
  lines.push('[FIXTURE LABEL — synthetic demo data, not legal advice]');

  const text = lines.join('\n');
  const sha256 = sha256Hex(text);

  const idCore = {
    qrId: input.qrId,
    text,
    state: spec.state,
    packVersion: spec.packVersion,
    verdictHash: input.verdict.verdictHash,
    issuedAt: input.issuedAt,
    reissueOf: input.reissueOf ?? null,
  };
  const labelId = `lbl_${canonicalHash(idCore).slice(0, 16)}`;

  const provenance: LabelProvenance = {
    labelId,
    qrId: input.qrId,
    qrUrl,
    sha256,
    state: spec.state,
    packVersion: spec.packVersion,
    snapshotHashes: [...spec.snapshotHashes],
    verdictHash: input.verdict.verdictHash,
    issuedAt: input.issuedAt,
    reissueOf: input.reissueOf ?? null,
    reissueReason: input.reissueReason ?? null,
    fixture: true,
  };

  return {
    labelId,
    qrId: input.qrId,
    qrUrl,
    state: spec.state,
    packVersion: spec.packVersion,
    lines,
    text,
    fields: {
      businessName: input.businessName.trim(),
      addressLine: input.addressLine.trim(),
      productName: input.productName.trim(),
      ingredients,
      netWeight: input.netWeight?.trim() ?? null,
      allergenLine: contains,
    },
    mandatedSentenceIds: spec.mandatedSentences.map((m) => m.id),
    snapshotHashes: [...spec.snapshotHashes],
    verdictHash: input.verdict.verdictHash,
    issuedAt: input.issuedAt,
    sha256,
    provenance,
    fixture: true,
  };
}
