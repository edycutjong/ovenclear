import type { SnapshotStore } from '../snapshots/store';
import {
  PRODUCT_CATEGORIES,
  RulepackValidationError,
  VENUE_CODES,
  type Rulepack,
} from './types';

/**
 * Rulepack schema validation (structural) + grounding validation (against the
 * snapshot store). "Schema-valid stub" states must clear BOTH bars.
 *
 * Grounding checks are the honesty core: every citation quote and every
 * mandated label sentence must literally appear in the pinned snapshot
 * content, and the pack's pinned hashes must match the store's hashes.
 */

const STATUSES = ['eligible', 'license_required', 'prohibited'] as const;

export function validateRulepack(pack: Rulepack): void {
  const problems: string[] = [];
  const ref = `${pack.state ?? '??'}@${pack.packVersion ?? '??'}`;

  if (pack.schemaVersion !== 1) problems.push(`schemaVersion must be 1, got ${String(pack.schemaVersion)}`);
  if (pack.fixture !== true) problems.push('fixture must be true in this build (no real-law packs)');
  if (!/^[A-Z]{2}$/.test(pack.state)) problems.push(`state must be 2-letter code, got "${pack.state}"`);
  if (!pack.stateName?.trim()) problems.push('stateName required');
  if (!/^\d{4}-\d{2}$/.test(pack.packVersion)) problems.push(`packVersion must be YYYY-MM, got "${pack.packVersion}"`);
  if (Number.isNaN(Date.parse(pack.effectiveDate))) problems.push(`effectiveDate must be ISO date, got "${pack.effectiveDate}"`);
  if (pack.depth !== 'deep' && pack.depth !== 'stub') problems.push(`depth must be deep|stub, got "${String(pack.depth)}"`);

  // I1 at the data layer: a pack with no pinned sources can never yield a verdict.
  if (!Array.isArray(pack.sourceSnapshots) || pack.sourceSnapshots.length === 0) {
    problems.push('sourceSnapshots must be non-empty (invariant I1: no verdict without pinned snapshots)');
  } else {
    for (const s of pack.sourceSnapshots) {
      if (!s.snapshotId?.trim()) problems.push('sourceSnapshots[].snapshotId required');
      if (!/^[0-9a-f]{64}$/.test(s.contentSha256 ?? '')) {
        problems.push(`sourceSnapshots[${s.snapshotId}].contentSha256 must be 64-hex sha256`);
      }
    }
  }

  const citationIds = new Set<string>();
  for (const c of pack.citations ?? []) {
    if (!c.id?.trim()) problems.push('citation with empty id');
    else if (citationIds.has(c.id)) problems.push(`duplicate citation id "${c.id}"`);
    else citationIds.add(c.id);
    if (!c.quote?.trim()) problems.push(`citation ${c.id}: quote required`);
    if (!c.section?.trim()) problems.push(`citation ${c.id}: section required`);
    if (!c.url?.trim()) problems.push(`citation ${c.id}: url required`);
    if (!c.snapshotId?.trim()) problems.push(`citation ${c.id}: snapshotId required`);
    else if (!(pack.sourceSnapshots ?? []).some((s) => s.snapshotId === c.snapshotId)) {
      problems.push(`citation ${c.id}: snapshotId "${c.snapshotId}" not in sourceSnapshots`);
    }
  }
  const requireCitation = (id: string | undefined, where: string) => {
    if (!id) return; // optional refs are checked by callers that require them
    if (!citationIds.has(id)) problems.push(`${where}: unknown citationId "${id}"`);
  };

  // Program
  const program = pack.program;
  if (!program) {
    problems.push('program required');
  } else {
    if (!program.programName?.trim()) problems.push('program.programName required');
    if (program.licenseRequiredForBaseline && !program.baselineLicense) {
      problems.push('program.baselineLicense required when licenseRequiredForBaseline');
    }
    if (program.baselineLicense) {
      if (program.baselineLicense.annualFeeUsd < 0) problems.push('baselineLicense.annualFeeUsd must be >= 0');
      requireCitation(program.baselineLicense.citationId, 'program.baselineLicense');
    }
    if (program.trainingRequired) requireCitation(program.trainingRequired.citationId, 'program.trainingRequired');
    if (program.annualRevenueCapUsd !== null) {
      if (!(program.annualRevenueCapUsd > 0)) problems.push('annualRevenueCapUsd must be > 0 or null');
      if (!program.capCitationId) problems.push('capCitationId required when annualRevenueCapUsd set');
      requireCitation(program.capCitationId, 'program.capCitationId');
    }
    // venue map must be COMPLETE — forces explicit policy for every venue code
    for (const v of VENUE_CODES) {
      const vp = program.venues?.[v];
      if (!vp) problems.push(`program.venues.${v} missing — venue policy must be explicit`);
      else {
        if (vp.policy !== 'allowed' && vp.policy !== 'prohibited') {
          problems.push(`program.venues.${v}.policy must be allowed|prohibited`);
        }
        requireCitation(vp.citationId, `program.venues.${v}`);
      }
    }
    const extraVenues = Object.keys(program.venues ?? {}).filter(
      (k) => !(VENUE_CODES as readonly string[]).includes(k),
    );
    for (const k of extraVenues) problems.push(`program.venues has unknown venue code "${k}"`);
  }

  // Product rules
  if (!Array.isArray(pack.productRules) || pack.productRules.length === 0) {
    problems.push('productRules must be non-empty');
  } else {
    const ruleIds = new Set<string>();
    const seenCategories = new Set<string>();
    for (const r of pack.productRules) {
      if (ruleIds.has(r.id)) problems.push(`duplicate productRule id "${r.id}"`);
      ruleIds.add(r.id);
      if (!(PRODUCT_CATEGORIES as readonly string[]).includes(r.category)) {
        problems.push(`productRule ${r.id}: unknown category "${r.category}"`);
      }
      if (seenCategories.has(r.category)) {
        problems.push(`productRule ${r.id}: category "${r.category}" ruled twice — rules must be unambiguous`);
      }
      seenCategories.add(r.category);
      if (!(STATUSES as readonly string[]).includes(r.status)) {
        problems.push(`productRule ${r.id}: unknown status "${r.status}"`);
      }
      if (!r.citationIds?.length) problems.push(`productRule ${r.id}: at least one citation required`);
      for (const cid of r.citationIds ?? []) requireCitation(cid, `productRule ${r.id}`);
    }
  }

  // Label spec
  const ls = pack.labelSpec;
  if (!ls) {
    problems.push('labelSpec required');
  } else {
    if (!ls.mandatedSentences?.length) problems.push('labelSpec.mandatedSentences must be non-empty');
    const sentenceIds = new Set<string>();
    for (const m of ls.mandatedSentences ?? []) {
      if (sentenceIds.has(m.id)) problems.push(`duplicate mandated sentence id "${m.id}"`);
      sentenceIds.add(m.id);
      if (!m.text?.trim()) problems.push(`mandated sentence ${m.id}: text required`);
      requireCitation(m.citationId, `mandated sentence ${m.id}`);
    }
    if (!ls.requiredFields?.includes('business_name')) {
      problems.push('labelSpec.requiredFields must include business_name');
    }
    if (!ls.allergenRule) problems.push('labelSpec.allergenRule required');
    else requireCitation(ls.allergenRule.citationId, 'labelSpec.allergenRule');
    requireCitation(ls.fieldCitationId, 'labelSpec.fieldCitationId');
  }

  // Fees
  const feeIds = new Set<string>();
  for (const f of pack.fees ?? []) {
    if (feeIds.has(f.id)) problems.push(`duplicate fee id "${f.id}"`);
    feeIds.add(f.id);
    if (!(f.amountUsd >= 0)) problems.push(`fee ${f.id}: amountUsd must be >= 0`);
    requireCitation(f.citationId, `fee ${f.id}`);
  }

  // Checklists
  for (const status of STATUSES) {
    const steps = pack.checklists?.[status];
    if (!steps?.length) problems.push(`checklists.${status} must be non-empty`);
    for (const s of steps ?? []) {
      if (!s.text?.trim()) problems.push(`checklist ${status}/${s.id}: text required`);
      if (s.citationId) requireCitation(s.citationId, `checklist ${status}/${s.id}`);
      if (s.feeId && !feeIds.has(s.feeId)) problems.push(`checklist ${status}/${s.id}: unknown feeId "${s.feeId}"`);
    }
  }

  if (problems.length) throw new RulepackValidationError(ref, problems);
}

/**
 * Grounding validation: the pack's pinned hashes must match the store, and
 * every quoted string must be byte-present in its pinned snapshot content.
 */
export function validatePackGrounding(pack: Rulepack, store: SnapshotStore): void {
  const problems: string[] = [];
  const ref = `${pack.state}@${pack.packVersion}`;
  const contentById = new Map<string, string>();

  for (const s of pack.sourceSnapshots) {
    const rec = store.get(s.snapshotId);
    if (!rec) {
      problems.push(`pinned snapshot "${s.snapshotId}" not in store`);
      continue;
    }
    if (rec.contentSha256 !== s.contentSha256) {
      problems.push(
        `pinned snapshot "${s.snapshotId}" hash mismatch: pack pins ${s.contentSha256.slice(0, 12)}…, store has ${rec.contentSha256.slice(0, 12)}… (source drifted?)`,
      );
      continue;
    }
    if (rec.state !== pack.state) {
      problems.push(`pinned snapshot "${s.snapshotId}" belongs to state ${rec.state}, pack is ${pack.state}`);
    }
    contentById.set(s.snapshotId, rec.content);
  }

  for (const c of pack.citations) {
    const content = contentById.get(c.snapshotId);
    if (content === undefined) continue; // already reported above
    if (!content.includes(c.quote)) {
      problems.push(`citation ${c.id}: quote not found verbatim in snapshot "${c.snapshotId}"`);
    }
  }

  // Mandated label sentences must be quoted from the pinned law text too.
  const citationById = new Map(pack.citations.map((c) => [c.id, c]));
  for (const m of pack.labelSpec.mandatedSentences) {
    const cite = citationById.get(m.citationId);
    if (!cite) continue; // structural validation reports this
    const content = contentById.get(cite.snapshotId);
    if (content !== undefined && !content.includes(m.text)) {
      problems.push(`mandated sentence ${m.id}: text not found verbatim in snapshot "${cite.snapshotId}"`);
    }
  }

  if (problems.length) throw new RulepackValidationError(ref, problems);
}
