import type { SnapshotRecord } from '../../core/snapshots/store';
import type { Rulepack } from '../../core/rulekit/types';
import { GA_MANDATED_SENTENCE } from '../snapshots';

/**
 * Georgia rulepack — FIXTURE (deep). Modeled on the SHAPE of Georgia's
 * licensed cottage-food program; every value is synthetic and every quote is
 * a verbatim substring of the pinned fixture snapshot (grounding-checked at
 * registration).
 */
export function buildGaPack(snapshot: SnapshotRecord): Rulepack {
  const SNAP = snapshot.id;
  return {
    schemaVersion: 1,
    fixture: true,
    state: 'GA',
    stateName: 'Georgia',
    packVersion: '2026-07',
    effectiveDate: '2026-07-01',
    depth: 'deep',
    sourceSnapshots: [{ snapshotId: SNAP, contentSha256: snapshot.contentSha256 }],
    program: {
      programName: 'Georgia Cottage Food Program (FIXTURE)',
      licenseRequiredForBaseline: true,
      baselineLicense: {
        name: 'Georgia Cottage Food License (FIXTURE)',
        annualFeeUsd: 100,
        citationId: 'GA-CF-2.1',
      },
      annualRevenueCapUsd: null,
      venues: {
        farmers_market: { policy: 'allowed', citationId: 'GA-CF-4.1' },
        home_pickup: { policy: 'allowed', citationId: 'GA-CF-4.1' },
        online_instate_shipping: { policy: 'allowed', citationId: 'GA-CF-4.1' },
        event_festival: { policy: 'allowed', citationId: 'GA-CF-4.1' },
        mail_order_interstate: { policy: 'prohibited', citationId: 'GA-CF-4.2' },
        wholesale: { policy: 'prohibited', citationId: 'GA-CF-4.2' },
      },
    },
    productRules: [
      { id: 'ga-baked', category: 'baked_shelf_stable', status: 'eligible', citationIds: ['GA-CF-3.1'] },
      { id: 'ga-confection', category: 'confection', status: 'eligible', citationIds: ['GA-CF-3.1'] },
      { id: 'ga-jam', category: 'jam_high_acid', status: 'eligible', citationIds: ['GA-CF-3.1'] },
      { id: 'ga-dry', category: 'dry_blend', status: 'eligible', citationIds: ['GA-CF-3.1'] },
      {
        id: 'ga-refrigerated',
        category: 'baked_refrigerated',
        status: 'prohibited',
        citationIds: ['GA-CF-1.2', 'GA-CF-3.2'],
        note: 'potentially hazardous — requires refrigeration',
      },
      {
        id: 'ga-acidified',
        category: 'acidified',
        status: 'license_required',
        conditions: [
          'Obtain a documented process authority letter for your recipe (FIXTURE §2.2)',
          'Laboratory verification that equilibrium pH is 4.6 or below (FIXTURE §2.2)',
        ],
        citationIds: ['GA-CF-1.3', 'GA-CF-2.2'],
        note: 'acidified foods sit outside the cottage license',
      },
      {
        id: 'ga-fermented',
        category: 'fermented',
        status: 'license_required',
        conditions: [
          'Obtain a documented process authority letter for your recipe (FIXTURE §2.2)',
          'Laboratory verification that equilibrium pH is 4.6 or below (FIXTURE §2.2)',
        ],
        citationIds: ['GA-CF-2.2'],
      },
      {
        id: 'ga-bev-fermented',
        category: 'beverage_fermented',
        status: 'license_required',
        conditions: [
          'Obtain a documented process authority letter for your recipe (FIXTURE §2.2)',
          'Laboratory verification that equilibrium pH is 4.6 or below (FIXTURE §2.2)',
        ],
        citationIds: ['GA-CF-2.2'],
      },
      { id: 'ga-meat', category: 'meat', status: 'prohibited', citationIds: ['GA-CF-3.2'] },
      { id: 'ga-dairy', category: 'dairy_raw', status: 'prohibited', citationIds: ['GA-CF-3.2'] },
    ],
    labelSpec: {
      mandatedSentences: [
        { id: 'ga-disclosure', text: GA_MANDATED_SENTENCE, citationId: 'GA-CF-5.1' },
      ],
      requiredFields: [
        'business_name',
        'business_address_line',
        'product_name',
        'ingredients',
        'net_weight',
        'allergens',
      ],
      allergenRule: { mustDeclare: true, format: 'contains_line', citationId: 'GA-CF-5.2' },
      fieldCitationId: 'GA-CF-5.2',
    },
    fees: [
      { id: 'ga-cfl', label: 'Cottage Food License (annual, FIXTURE)', amountUsd: 100, citationId: 'GA-CF-2.1' },
      {
        id: 'ga-mfl',
        label: 'Manufactured food establishment license (annual, FIXTURE)',
        amountUsd: 175,
        appliesTo: 'acidified/fermented license path',
        citationId: 'GA-CF-2.2',
      },
      {
        id: 'ga-lab',
        label: 'Process authority pH lab verification (third-party, ESTIMATE)',
        amountUsd: 85,
        estimate: true,
        appliesTo: 'acidified/fermented license path',
        citationId: 'GA-CF-2.2',
      },
    ],
    checklists: {
      eligible: [
        { id: 'ga-e1', text: 'Confirm your product is on the Georgia eligible list.', citationId: 'GA-CF-3.1' },
        { id: 'ga-e2', text: 'Apply for the Georgia Cottage Food License.', citationId: 'GA-CF-2.1', feeId: 'ga-cfl' },
        { id: 'ga-e3', text: 'Prepare your label with the mandated disclosure and allergen declaration.', citationId: 'GA-CF-5.1' },
        { id: 'ga-e4', text: 'Sell only direct-to-consumer at permitted venues.', citationId: 'GA-CF-4.1' },
        { id: 'ga-e5', text: 'Keep all sales within Georgia — no wholesale, no interstate shipping.', citationId: 'GA-CF-4.2' },
        { id: 'ga-e6', text: 'Renew the license annually.', citationId: 'GA-CF-2.1', feeId: 'ga-cfl' },
      ],
      license_required: [
        { id: 'ga-l1', text: 'Your product is outside the cottage license (acidified/fermented path).', citationId: 'GA-CF-2.2' },
        { id: 'ga-l2', text: 'Apply for a manufactured food establishment license.', citationId: 'GA-CF-2.2', feeId: 'ga-mfl' },
        { id: 'ga-l3', text: 'Obtain a documented process authority letter for your recipe.', citationId: 'GA-CF-2.2' },
        { id: 'ga-l4', text: 'Complete laboratory pH verification (equilibrium pH 4.6 or below).', citationId: 'GA-CF-2.2', feeId: 'ga-lab' },
        { id: 'ga-l5', text: 'Prepare your label with the mandated disclosure and allergen declaration.', citationId: 'GA-CF-5.1' },
        { id: 'ga-l6', text: 'Sell only direct-to-consumer at permitted venues.', citationId: 'GA-CF-4.1' },
      ],
      prohibited: [
        { id: 'ga-p1', text: 'This product may not be sold under the Georgia cottage food rule.', citationId: 'GA-CF-3.2' },
        { id: 'ga-p2', text: 'Alternative: produce in a licensed commercial kitchen or with a licensed co-packer (outside cottage scope).' },
      ],
    },
    citations: [
      {
        id: 'GA-CF-1.1',
        source: 'Georgia Cottage Food Rules (FIXTURE)',
        section: 'Section 1.1',
        quote: 'a non-potentially-hazardous food produced in a residential kitchen',
        url: snapshot.url,
        snapshotId: SNAP,
      },
      {
        id: 'GA-CF-1.2',
        source: 'Georgia Cottage Food Rules (FIXTURE)',
        section: 'Section 1.2',
        quote:
          'requires time or temperature control for safety, including cheesecakes, custard or cream pies, and any food requiring refrigeration',
        url: snapshot.url,
        snapshotId: SNAP,
      },
      {
        id: 'GA-CF-1.3',
        source: 'Georgia Cottage Food Rules (FIXTURE)',
        section: 'Section 1.3',
        quote:
          'Acidified foods such as pickles, pickled vegetables, salsas, and jams made from low-acid fruits are not cottage food products.',
        url: snapshot.url,
        snapshotId: SNAP,
      },
      {
        id: 'GA-CF-2.1',
        source: 'Georgia Cottage Food Rules (FIXTURE)',
        section: 'Section 2.1',
        quote:
          'A cottage food license issued by the Department is required before any sale. Annual license fee: $100.',
        url: snapshot.url,
        snapshotId: SNAP,
      },
      {
        id: 'GA-CF-2.2',
        source: 'Georgia Cottage Food Rules (FIXTURE)',
        section: 'Section 2.2',
        quote:
          'Acidified or fermented foods and beverages may not be sold under a cottage food license; they require a manufactured food establishment license, a documented process authority letter, and laboratory verification that equilibrium pH is 4.6 or below. Annual license fee: $175.',
        url: snapshot.url,
        snapshotId: SNAP,
      },
      {
        id: 'GA-CF-3.1',
        source: 'Georgia Cottage Food Rules (FIXTURE)',
        section: 'Section 3.1',
        quote:
          'Eligible cottage foods include breads (including sourdough and other naturally leavened breads), cookies, cakes that do not require refrigeration, high-acid fruit jams and jellies, candies and confections, granola, dried herbs, and dry blends.',
        url: snapshot.url,
        snapshotId: SNAP,
      },
      {
        id: 'GA-CF-3.2',
        source: 'Georgia Cottage Food Rules (FIXTURE)',
        section: 'Section 3.2',
        quote:
          'Potentially hazardous foods, meat or poultry products, raw dairy products, and any food requiring refrigeration may not be sold as cottage food.',
        url: snapshot.url,
        snapshotId: SNAP,
      },
      {
        id: 'GA-CF-4.1',
        source: 'Georgia Cottage Food Rules (FIXTURE)',
        section: 'Section 4.1',
        quote:
          "Cottage food may be sold only directly to the end consumer at farmers markets, festivals and similar events, from the operator's home, and through internet orders delivered within Georgia.",
        url: snapshot.url,
        snapshotId: SNAP,
      },
      {
        id: 'GA-CF-4.2',
        source: 'Georgia Cottage Food Rules (FIXTURE)',
        section: 'Section 4.2',
        quote:
          'Wholesale sales, sales to retail stores or restaurants for resale, and interstate shipment of cottage food products are prohibited.',
        url: snapshot.url,
        snapshotId: SNAP,
      },
      {
        id: 'GA-CF-5.1',
        source: 'Georgia Cottage Food Rules (FIXTURE)',
        section: 'Section 5.1',
        quote: `Every label must bear the following exact statement: "${GA_MANDATED_SENTENCE}"`,
        url: snapshot.url,
        snapshotId: SNAP,
      },
      {
        id: 'GA-CF-5.2',
        source: 'Georgia Cottage Food Rules (FIXTURE)',
        section: 'Section 5.2',
        quote:
          'the business name and the city and state of the cottage food operation, the common name of the product, the ingredients in descending order of predominance by weight, the net weight or net volume, and a declaration of major food allergens',
        url: snapshot.url,
        snapshotId: SNAP,
      },
    ],
  };
}
