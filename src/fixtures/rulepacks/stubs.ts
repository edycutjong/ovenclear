import type { SnapshotRecord } from '../../core/snapshots/store';
import type { Rulepack } from '../../core/rulekit/types';
import { CA_STUB_MANDATED, FL_STUB_MANDATED } from '../snapshots';

/**
 * Schema-valid STUB rulepacks for CA and FL (COMPLEXITY.md launch-state list).
 * Stubs clear the full validation + grounding bar but cover only three
 * product categories; verdicts from them carry a stub-coverage note.
 */

function buildStub(opts: {
  snapshot: SnapshotRecord;
  state: 'CA' | 'FL';
  stateName: string;
  mandated: string;
  license: { required: true; feeUsd: number } | { required: false; feeUsd: 0 };
}): Rulepack {
  const { snapshot, state, stateName, mandated } = opts;
  const P = state; // citation prefix
  const SNAP = snapshot.id;
  return {
    schemaVersion: 1,
    fixture: true,
    state,
    stateName,
    packVersion: '2026-07',
    effectiveDate: '2026-07-01',
    depth: 'stub',
    sourceSnapshots: [{ snapshotId: SNAP, contentSha256: snapshot.contentSha256 }],
    program: {
      programName: `${stateName} Cottage Food Program (FIXTURE STUB)`,
      licenseRequiredForBaseline: opts.license.required,
      ...(opts.license.required
        ? {
            baselineLicense: {
              name: `${stateName} stub permit (FIXTURE)`,
              annualFeeUsd: opts.license.feeUsd,
              citationId: `${P}-2.1`,
            },
          }
        : {}),
      annualRevenueCapUsd: null,
      venues: {
        farmers_market: { policy: 'allowed', citationId: `${P}-3.1` },
        home_pickup: { policy: 'allowed', citationId: `${P}-3.1` },
        online_instate_shipping: { policy: 'allowed', citationId: `${P}-3.1` },
        event_festival: { policy: 'allowed', citationId: `${P}-3.1` },
        mail_order_interstate: { policy: 'prohibited', citationId: `${P}-3.2` },
        wholesale: { policy: 'prohibited', citationId: `${P}-3.2` },
      },
    },
    productRules: [
      { id: `${state.toLowerCase()}-baked`, category: 'baked_shelf_stable', status: 'eligible', citationIds: [`${P}-1.1`] },
      { id: `${state.toLowerCase()}-confection`, category: 'confection', status: 'eligible', citationIds: [`${P}-1.1`] },
      { id: `${state.toLowerCase()}-refrigerated`, category: 'baked_refrigerated', status: 'prohibited', citationIds: [`${P}-1.2`] },
    ],
    labelSpec: {
      mandatedSentences: [{ id: `${state.toLowerCase()}-disclosure`, text: mandated, citationId: `${P}-4.1` }],
      requiredFields: ['business_name', 'business_address_line', 'product_name', 'ingredients', 'allergens'],
      allergenRule: { mustDeclare: true, format: 'contains_line', citationId: `${P}-4.2` },
      fieldCitationId: `${P}-4.2`,
    },
    fees: [
      {
        id: `${state.toLowerCase()}-permit`,
        label: opts.license.required ? 'Stub permit application (FIXTURE)' : 'Registration (free, FIXTURE)',
        amountUsd: opts.license.feeUsd,
        citationId: `${P}-2.1`,
      },
    ],
    checklists: {
      eligible: [
        { id: `${state.toLowerCase()}-e1`, text: 'Confirm your product is inside stub coverage.', citationId: `${P}-1.1` },
        ...(opts.license.required
          ? [{ id: `${state.toLowerCase()}-e2`, text: 'Apply for the stub permit.', citationId: `${P}-2.1`, feeId: `${state.toLowerCase()}-permit` }]
          : [{ id: `${state.toLowerCase()}-e2`, text: 'Complete the free registration (recommended).', citationId: `${P}-2.1` }]),
        { id: `${state.toLowerCase()}-e3`, text: 'Prepare your label with the stub disclosure and allergen declaration.', citationId: `${P}-4.1` },
      ],
      license_required: [
        {
          id: `${state.toLowerCase()}-l1`,
          text: 'Outside stub coverage — production routes this to made-to-order research with human spot-check.',
        },
      ],
      prohibited: [
        { id: `${state.toLowerCase()}-p1`, text: 'Not allowed under this stub rule.', citationId: `${P}-1.2` },
      ],
    },
    citations: [
      {
        id: `${P}-1.1`,
        source: `${stateName} Cottage Food Rules (FIXTURE STUB)`,
        section: 'Section 1.1',
        quote:
          'Eligible stub categories: baked goods that do not require refrigeration, and candies and confections.',
        url: snapshot.url,
        snapshotId: SNAP,
      },
      {
        id: `${P}-1.2`,
        source: `${stateName} Cottage Food Rules (FIXTURE STUB)`,
        section: 'Section 1.2',
        quote: 'Foods requiring refrigeration may not be sold as cottage food.',
        url: snapshot.url,
        snapshotId: SNAP,
      },
      {
        id: `${P}-2.1`,
        source: `${stateName} Cottage Food Rules (FIXTURE STUB)`,
        section: 'Section 2.1',
        quote:
          state === 'CA'
            ? 'A stub permit application is required. Application fee: $25.'
            : 'No license is required under this stub. A free registration is recommended. Registration fee: $0.',
        url: snapshot.url,
        snapshotId: SNAP,
      },
      {
        id: `${P}-3.1`,
        source: `${stateName} Cottage Food Rules (FIXTURE STUB)`,
        section: 'Section 3.1',
        quote: `Direct-to-consumer sales are allowed at farmers markets, community events, from the operator's home, and through internet orders delivered within ${stateName}.`,
        url: snapshot.url,
        snapshotId: SNAP,
      },
      {
        id: `${P}-3.2`,
        source: `${stateName} Cottage Food Rules (FIXTURE STUB)`,
        section: 'Section 3.2',
        quote: 'Wholesale sales and interstate shipment are prohibited under this stub.',
        url: snapshot.url,
        snapshotId: SNAP,
      },
      {
        id: `${P}-4.1`,
        source: `${stateName} Cottage Food Rules (FIXTURE STUB)`,
        section: 'Section 4.1',
        quote: `Every label must bear the following exact statement: "${mandated}"`,
        url: snapshot.url,
        snapshotId: SNAP,
      },
      {
        id: `${P}-4.2`,
        source: `${stateName} Cottage Food Rules (FIXTURE STUB)`,
        section: 'Section 4.2',
        quote:
          'the business name and city and state, the product name, the ingredients in descending order of predominance, and a declaration of major food allergens',
        url: snapshot.url,
        snapshotId: SNAP,
      },
    ],
  };
}

export function buildCaStubPack(snapshot: SnapshotRecord): Rulepack {
  return buildStub({
    snapshot,
    state: 'CA',
    stateName: 'California',
    mandated: CA_STUB_MANDATED,
    license: { required: true, feeUsd: 25 },
  });
}

export function buildFlStubPack(snapshot: SnapshotRecord): Rulepack {
  return buildStub({
    snapshot,
    state: 'FL',
    stateName: 'Florida',
    mandated: FL_STUB_MANDATED,
    license: { required: false, feeUsd: 0 },
  });
}
