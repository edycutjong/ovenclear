import { sha256Hex } from '../util/canonical';
import type { LabelSpec } from '../rulekit/types';
import { allergenLine, composeLabel, type LabelArtifact, type LabelInput } from './compose';

/**
 * Label-QA gate — invariant I2: no label ships unless every state-mandated
 * sentence is BYTE-PRESENT VERBATIM in the artifact text. Fails closed.
 *
 * This gate is deliberately deterministic (exact string checks). The
 * production pipeline adds a Gemini Flash "judge pre-pass" in FRONT of this
 * gate for fuzzy issues (layout, contrast); the byte gate remains the final
 * authority and is what ships or blocks a label.
 */

export interface QaFailure {
  code:
    | 'mandated_sentence_missing'
    | 'required_field_missing'
    | 'allergen_line_missing'
    | 'allergen_line_wrong'
    | 'snapshot_hashes_empty'
    | 'snapshot_hashes_mismatch'
    | 'sha256_mismatch'
    | 'state_mismatch';
  detail: string;
}

export interface QaResult {
  pass: boolean;
  state: string;
  packVersion: string;
  labelId: string;
  labelSha256: string;
  checkedSentenceIds: string[];
  failures: QaFailure[];
}

export class LabelQaError extends Error {
  constructor(public readonly result: QaResult) {
    super(
      `label QA FAILED (I2, fails closed): ${result.failures.map((f) => `${f.code}: ${f.detail}`).join('; ')}`,
    );
    this.name = 'LabelQaError';
  }
}

export function qaLabel(artifact: LabelArtifact, spec: LabelSpec): QaResult {
  const failures: QaFailure[] = [];

  if (artifact.state !== spec.state) {
    failures.push({
      code: 'state_mismatch',
      detail: `artifact state ${artifact.state} vs spec state ${spec.state}`,
    });
  }

  // I2 core: byte-verbatim presence of every mandated sentence.
  for (const m of spec.mandatedSentences) {
    if (!artifact.text.includes(m.text)) {
      failures.push({
        code: 'mandated_sentence_missing',
        detail: `sentence "${m.id}" not byte-present verbatim: "${m.text.slice(0, 60)}…"`,
      });
    }
  }

  // Required fields
  for (const field of spec.requiredFields) {
    switch (field) {
      case 'business_name':
        if (!artifact.fields.businessName || !artifact.text.includes(artifact.fields.businessName)) {
          failures.push({ code: 'required_field_missing', detail: 'business_name absent from label text' });
        }
        break;
      case 'business_address_line':
        if (!artifact.fields.addressLine || !artifact.text.includes(artifact.fields.addressLine)) {
          failures.push({ code: 'required_field_missing', detail: 'business_address_line absent from label text' });
        }
        break;
      case 'product_name':
        if (!artifact.fields.productName || !artifact.text.includes(`Product: ${artifact.fields.productName}`)) {
          failures.push({ code: 'required_field_missing', detail: 'product_name absent from label text' });
        }
        break;
      case 'ingredients':
        if (artifact.fields.ingredients.length === 0 || !artifact.text.includes('Ingredients: ')) {
          failures.push({ code: 'required_field_missing', detail: 'ingredients line absent' });
        }
        break;
      case 'net_weight':
        if (!artifact.fields.netWeight || !artifact.text.includes(`Net Wt: ${artifact.fields.netWeight}`)) {
          failures.push({ code: 'required_field_missing', detail: 'net_weight absent' });
        }
        break;
      case 'allergens':
        break; // handled by allergenRule below
    }
  }

  // Allergen declaration: recomputed independently from ingredients.
  if (spec.allergenRule.mustDeclare) {
    const expected = allergenLine(artifact.fields.ingredients);
    if (expected !== null) {
      if (artifact.fields.allergenLine === null) {
        failures.push({ code: 'allergen_line_missing', detail: `expected "${expected}"` });
      } else if (artifact.fields.allergenLine !== expected || !artifact.text.includes(expected)) {
        failures.push({
          code: 'allergen_line_wrong',
          detail: `expected "${expected}", artifact has "${artifact.fields.allergenLine}"`,
        });
      }
    }
  }

  // Provenance integrity (I1 carry-through + artifact hash)
  if (artifact.snapshotHashes.length === 0) {
    failures.push({ code: 'snapshot_hashes_empty', detail: 'label carries no law snapshot hashes' });
  }
  const specHashes = [...spec.snapshotHashes].sort().join(',');
  const artHashes = [...artifact.snapshotHashes].sort().join(',');
  if (specHashes !== artHashes) {
    failures.push({
      code: 'snapshot_hashes_mismatch',
      detail: 'label snapshot hashes do not match the spec they were issued under',
    });
  }
  if (sha256Hex(artifact.text) !== artifact.sha256) {
    failures.push({ code: 'sha256_mismatch', detail: 'artifact text does not re-hash to its recorded sha256' });
  }

  return {
    pass: failures.length === 0,
    state: spec.state,
    packVersion: spec.packVersion,
    labelId: artifact.labelId,
    labelSha256: artifact.sha256,
    checkedSentenceIds: spec.mandatedSentences.map((m) => m.id),
    failures,
  };
}

/**
 * Compose + QA in one gated step. Throws LabelQaError when QA fails —
 * there is no code path that returns an un-QA'd label (I2, fails closed).
 */
export function issueLabel(input: LabelInput): { artifact: LabelArtifact; qa: QaResult } {
  const artifact = composeLabel(input);
  const qa = qaLabel(artifact, input.spec);
  if (!qa.pass) throw new LabelQaError(qa);
  return { artifact, qa };
}
