import type { SnapshotRecord } from '../../core/snapshots/store';
import type { ProductRule, Rulepack } from '../../core/rulekit/types';
import { TX_STATEMENT_AFTER, TX_STATEMENT_BEFORE } from '../snapshots';

/**
 * Texas rulepacks — FIXTURE (deep), in TWO versions:
 *   2026-06 (before) — pickled/fermented/acidified prohibited; original label statement
 *   2026-07 (after)  — the replayed historical amendment (modeled on the shape
 *                      of the 2021 SB 572-era expansion): pickled/fermented
 *                      vegetable products eligible with a pH duty; amended
 *                      label statement
 * All values synthetic; quotes grounding-checked against the pinned snapshot.
 */

const PH_CONDITION =
  'Keep pH testing records showing equilibrium pH of 4.6 or below for each recipe (FIXTURE §3.2)';

export function buildTxPack(snapshot: SnapshotRecord, version: '2026-06' | '2026-07'): Rulepack {
  const amended = version === '2026-07';
  const SNAP = snapshot.id;
  const statement = amended ? TX_STATEMENT_AFTER : TX_STATEMENT_BEFORE;

  const acidifiedRules: ProductRule[] = amended
    ? [
        {
          id: 'tx-acidified',
          category: 'acidified',
          status: 'eligible',
          conditions: [PH_CONDITION],
          citationIds: ['TX-3.2'],
          note: 'eligible since the 2026-07 fixture amendment, with the pH record duty',
        },
        {
          id: 'tx-fermented',
          category: 'fermented',
          status: 'eligible',
          conditions: [PH_CONDITION],
          citationIds: ['TX-3.2'],
          note: 'eligible since the 2026-07 fixture amendment, with the pH record duty',
        },
      ]
    : [
        { id: 'tx-acidified', category: 'acidified', status: 'prohibited', citationIds: ['TX-3.2'] },
        { id: 'tx-fermented', category: 'fermented', status: 'prohibited', citationIds: ['TX-3.2'] },
      ];

  return {
    schemaVersion: 1,
    fixture: true,
    state: 'TX',
    stateName: 'Texas',
    packVersion: version,
    effectiveDate: amended ? '2026-07-01' : '2026-06-01',
    depth: 'deep',
    sourceSnapshots: [{ snapshotId: SNAP, contentSha256: snapshot.contentSha256 }],
    program: {
      programName: 'Texas Cottage Food Program (FIXTURE)',
      licenseRequiredForBaseline: false,
      trainingRequired: {
        name: 'Accredited basic food safety course (FIXTURE)',
        estFeeUsd: 7,
        citationId: 'TX-2.1',
      },
      annualRevenueCapUsd: 50_000,
      capCitationId: 'TX-4.1',
      venues: {
        farmers_market: { policy: 'allowed', citationId: 'TX-5.1' },
        home_pickup: { policy: 'allowed', citationId: 'TX-5.1' },
        online_instate_shipping: { policy: 'allowed', citationId: 'TX-5.1' },
        event_festival: { policy: 'allowed', citationId: 'TX-5.1' },
        mail_order_interstate: { policy: 'prohibited', citationId: 'TX-5.2' },
        wholesale: { policy: 'prohibited', citationId: 'TX-5.2' },
      },
    },
    productRules: [
      { id: 'tx-baked', category: 'baked_shelf_stable', status: 'eligible', citationIds: ['TX-3.1'] },
      { id: 'tx-confection', category: 'confection', status: 'eligible', citationIds: ['TX-3.1'] },
      { id: 'tx-jam', category: 'jam_high_acid', status: 'eligible', citationIds: ['TX-3.1'] },
      { id: 'tx-dry', category: 'dry_blend', status: 'eligible', citationIds: ['TX-3.1'] },
      {
        id: 'tx-refrigerated',
        category: 'baked_refrigerated',
        status: 'prohibited',
        citationIds: ['TX-1.2'],
        note: 'potentially hazardous — requires refrigeration',
      },
      ...acidifiedRules,
      {
        id: 'tx-bev-fermented',
        category: 'beverage_fermented',
        status: 'prohibited',
        citationIds: ['TX-3.2'],
        note: 'fermented beverages stay prohibited even after the fixture amendment',
      },
      { id: 'tx-meat', category: 'meat', status: 'prohibited', citationIds: ['TX-3.3'] },
      { id: 'tx-dairy', category: 'dairy_raw', status: 'prohibited', citationIds: ['TX-3.3'] },
    ],
    labelSpec: {
      mandatedSentences: [{ id: 'tx-statement', text: statement, citationId: 'TX-6.1' }],
      requiredFields: ['business_name', 'business_address_line', 'product_name', 'ingredients', 'allergens'],
      allergenRule: { mustDeclare: true, format: 'contains_line', citationId: 'TX-6.2' },
      fieldCitationId: 'TX-6.2',
    },
    fees: [
      {
        id: 'tx-course',
        label: 'Accredited basic food safety course (one-time, ESTIMATE)',
        amountUsd: 7,
        estimate: true,
        appliesTo: 'one-time operator training',
        citationId: 'TX-2.1',
      },
    ],
    checklists: {
      eligible: [
        { id: 'tx-e1', text: 'Confirm your product is on the Texas eligible list.', citationId: 'TX-3.1' },
        { id: 'tx-e2', text: 'Complete an accredited basic food safety course.', citationId: 'TX-2.1', feeId: 'tx-course' },
        { id: 'tx-e3', text: 'Prepare your label with the mandated statement and allergen declaration.', citationId: 'TX-6.1' },
        { id: 'tx-e4', text: 'Sell direct-to-consumer within Texas only.', citationId: 'TX-5.1' },
        { id: 'tx-e5', text: 'Stay under the $50,000 annual gross income cap.', citationId: 'TX-4.1' },
        { id: 'tx-e6', text: 'No wholesale and no shipping across state lines.', citationId: 'TX-5.2' },
      ],
      license_required: [
        {
          id: 'tx-l1',
          text: 'This category needs more than the Texas cottage program allows — routed to commercial licensing research (FIXTURE path).',
        },
      ],
      prohibited: [
        { id: 'tx-p1', text: 'This product may not be sold as Texas cottage food under the current fixture rule.' },
        { id: 'tx-p2', text: 'Alternative: produce in a licensed commercial facility (outside cottage scope).' },
      ],
    },
    citations: [
      {
        id: 'TX-1.2',
        source: 'Texas Cottage Food Rules (FIXTURE)',
        section: 'Section 1.2',
        quote:
          'A potentially hazardous food requires time or temperature control for safety, including cheesecakes and custard or cream fillings, and may not be sold as cottage food.',
        url: snapshot.url,
        snapshotId: SNAP,
      },
      {
        id: 'TX-2.1',
        source: 'Texas Cottage Food Rules (FIXTURE)',
        section: 'Section 2.1',
        quote:
          'No license or permit is required to operate a cottage food production operation. The operator must complete an accredited basic food safety education or training program.',
        url: snapshot.url,
        snapshotId: SNAP,
      },
      {
        id: 'TX-3.1',
        source: 'Texas Cottage Food Rules (FIXTURE)',
        section: 'Section 3.1',
        quote:
          'Eligible cottage foods include baked goods that do not require refrigeration, candy and confections, high-acid fruit jams and jellies, granola and dry blends, and dried herbs.',
        url: snapshot.url,
        snapshotId: SNAP,
      },
      {
        id: 'TX-3.2',
        source: 'Texas Cottage Food Rules (FIXTURE)',
        section: 'Section 3.2',
        quote: amended
          ? 'Pickled, fermented, or acidified vegetable products that are shelf stable with an equilibrium pH of 4.6 or below may be sold as cottage food if the operator keeps pH testing records for each recipe. Fermented beverages such as kombucha may not be sold as cottage food.'
          : 'Pickled, fermented, or acidified foods may not be sold as cottage food. Fermented beverages such as kombucha may not be sold as cottage food.',
        url: snapshot.url,
        snapshotId: SNAP,
      },
      {
        id: 'TX-3.3',
        source: 'Texas Cottage Food Rules (FIXTURE)',
        section: 'Section 3.3',
        quote: 'Meat, poultry, and raw dairy products are prohibited.',
        url: snapshot.url,
        snapshotId: SNAP,
      },
      {
        id: 'TX-4.1',
        source: 'Texas Cottage Food Rules (FIXTURE)',
        section: 'Section 4.1',
        quote:
          'A cottage food production operation may not have annual gross income of more than $50,000 from the sale of cottage food.',
        url: snapshot.url,
        snapshotId: SNAP,
      },
      {
        id: 'TX-5.1',
        source: 'Texas Cottage Food Rules (FIXTURE)',
        section: 'Section 5.1',
        quote:
          "Cottage food may be sold directly to consumers anywhere in this state, including at farmers markets and festivals, from the operator's home, and through internet orders delivered in this state.",
        url: snapshot.url,
        snapshotId: SNAP,
      },
      {
        id: 'TX-5.2',
        source: 'Texas Cottage Food Rules (FIXTURE)',
        section: 'Section 5.2',
        quote: 'Sales for resale, wholesale distribution, and shipment across state lines are prohibited.',
        url: snapshot.url,
        snapshotId: SNAP,
      },
      {
        id: 'TX-6.1',
        source: 'Texas Cottage Food Rules (FIXTURE)',
        section: 'Section 6.1',
        quote: `Each label must include the following exact statement: "${statement}"`,
        url: snapshot.url,
        snapshotId: SNAP,
      },
      {
        id: 'TX-6.2',
        source: 'Texas Cottage Food Rules (FIXTURE)',
        section: 'Section 6.2',
        quote:
          "the operator's business name and the city and state of the operation, the common name of the product, the ingredients in descending order of predominance, and a declaration of major food allergens",
        url: snapshot.url,
        snapshotId: SNAP,
      },
    ],
  };
}
