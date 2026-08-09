import type { SnapshotRecord, SnapshotStore } from '../core/snapshots/store';

/**
 * FIXTURE legal-source snapshots.
 *
 * ALL TEXT BELOW IS SYNTHETIC. It is statute-SHAPED (modeled on the structure
 * of real cottage-food programs: Georgia's licensed program, Texas's
 * unlicensed capped program, and a Texas amendment modeled on the shape of
 * the 2021 SB 572-era expansion) but it is NOT real legal text and must never
 * be presented as such. Every citation quote in the rulepacks is a verbatim
 * substring of these texts — enforced by validatePackGrounding at registration.
 */

export const GA_MANDATED_SENTENCE =
  'MADE IN A COTTAGE FOOD OPERATION THAT IS NOT SUBJECT TO STATE FOOD SAFETY INSPECTION.';

export const TX_STATEMENT_BEFORE =
  'This food is made in a home kitchen and is not inspected by the Department of State Health Services.';

export const TX_STATEMENT_AFTER =
  'This food is made in a home kitchen and is not inspected by the Department of State Health Services or a local health department.';

export const GA_SNAPSHOT_TEXT = `SYNTHETIC FIXTURE — Georgia Cottage Food Rules (fixture edition, rev. 2026-07). Not legal text.
Georgia Department of Agriculture — Cottage Food Program (FIXTURE)

Section 1. Definitions.
1.1 A cottage food product is a non-potentially-hazardous food produced in a residential kitchen for direct sale to consumers.
1.2 A potentially hazardous food requires time or temperature control for safety, including cheesecakes, custard or cream pies, and any food requiring refrigeration.
1.3 Acidified foods such as pickles, pickled vegetables, salsas, and jams made from low-acid fruits are not cottage food products.

Section 2. Licensing.
2.1 A cottage food license issued by the Department is required before any sale. Annual license fee: $100.
2.2 Acidified or fermented foods and beverages may not be sold under a cottage food license; they require a manufactured food establishment license, a documented process authority letter, and laboratory verification that equilibrium pH is 4.6 or below. Annual license fee: $175.

Section 3. Eligible and prohibited foods.
3.1 Eligible cottage foods include breads (including sourdough and other naturally leavened breads), cookies, cakes that do not require refrigeration, high-acid fruit jams and jellies, candies and confections, granola, dried herbs, and dry blends.
3.2 Potentially hazardous foods, meat or poultry products, raw dairy products, and any food requiring refrigeration may not be sold as cottage food.

Section 4. Sales venues.
4.1 Cottage food may be sold only directly to the end consumer at farmers markets, festivals and similar events, from the operator's home, and through internet orders delivered within Georgia.
4.2 Wholesale sales, sales to retail stores or restaurants for resale, and interstate shipment of cottage food products are prohibited.

Section 5. Labeling.
5.1 Every label must bear the following exact statement: "${GA_MANDATED_SENTENCE}"
5.2 The label must also include the business name and the city and state of the cottage food operation, the common name of the product, the ingredients in descending order of predominance by weight, the net weight or net volume, and a declaration of major food allergens.

Section 6. Revenue.
6.1 This fixture rule sets no annual gross revenue cap for cottage food operations.
`;

export const TX_SNAPSHOT_TEXT_BEFORE = `SYNTHETIC FIXTURE — Texas Cottage Food Rules (fixture edition). Not legal text.
Texas Cottage Food Program (FIXTURE)

Section 1. Definitions.
1.1 A cottage food production operation is an individual producing eligible foods in the individual's home kitchen for direct sale to consumers.
1.2 A potentially hazardous food requires time or temperature control for safety, including cheesecakes and custard or cream fillings, and may not be sold as cottage food.

Section 2. Registration and training.
2.1 No license or permit is required to operate a cottage food production operation. The operator must complete an accredited basic food safety education or training program.

Section 3. Eligible and prohibited foods.
3.1 Eligible cottage foods include baked goods that do not require refrigeration, candy and confections, high-acid fruit jams and jellies, granola and dry blends, and dried herbs.
3.2 Pickled, fermented, or acidified foods may not be sold as cottage food. Fermented beverages such as kombucha may not be sold as cottage food.
3.3 Meat, poultry, and raw dairy products are prohibited.

Section 4. Revenue cap.
4.1 A cottage food production operation may not have annual gross income of more than $50,000 from the sale of cottage food.

Section 5. Sales  venues.
5.1 Cottage food may be sold directly to consumers anywhere in this state, including at farmers markets and festivals, from the operator's home, and through internet orders delivered in this state.
5.2 Sales for resale, wholesale distribution, and shipment across state lines are prohibited.

Section 6. Labeling.
6.1 Each label must include the following exact statement: "${TX_STATEMENT_BEFORE}"
6.2 The label must also include the operator's business name and the city and state of the operation, the common name of the product, the ingredients in descending order of predominance, and a declaration of major food allergens.

Section 7. Program contact.
7.1 Contact: Cottage Food Program, phone (512) 555-0134.
7.2 Office hours: Monday to Friday, 8am to 5pm.
`;

/**
 * The replayed historical amendment (FIXTURE, modeled on the SHAPE of the
 * 2021 SB 572-era Texas expansion — synthetic wording, honestly labeled).
 * Changes vs BEFORE — EXACTLY these 5 rule-line deltas (all 'changed'):
 *   §3.2  pickled/fermented vegetable products become eligible with a pH duty  → material (eligibility)
 *   §6.1  the mandated label statement gains "or a local health department"    → material (label_text)
 *   §5    heading loses a double space                                          → cosmetic
 *   §7.1  phone number churn                                                    → immaterial
 *   §7.2  office hours churn                                                    → immaterial
 *
 * The masthead line is intentionally IDENTICAL to BEFORE. A revision date on a
 * mutable banner is snapshot provenance, not a rule — it already lives in the
 * snapshot `id`/`fetchedAt`/`contentSha256`. Keeping it out of the diffable
 * body is what makes the diff surface exactly the 5 rule deltas above (and
 * keeps the mock classifier from treating a date bump as a substantive change).
 */
export const TX_SNAPSHOT_TEXT_AFTER = `SYNTHETIC FIXTURE — Texas Cottage Food Rules (fixture edition). Not legal text.
Texas Cottage Food Program (FIXTURE)

Section 1. Definitions.
1.1 A cottage food production operation is an individual producing eligible foods in the individual's home kitchen for direct sale to consumers.
1.2 A potentially hazardous food requires time or temperature control for safety, including cheesecakes and custard or cream fillings, and may not be sold as cottage food.

Section 2. Registration and training.
2.1 No license or permit is required to operate a cottage food production operation. The operator must complete an accredited basic food safety education or training program.

Section 3. Eligible and prohibited foods.
3.1 Eligible cottage foods include baked goods that do not require refrigeration, candy and confections, high-acid fruit jams and jellies, granola and dry blends, and dried herbs.
3.2 Pickled, fermented, or acidified vegetable products that are shelf stable with an equilibrium pH of 4.6 or below may be sold as cottage food if the operator keeps pH testing records for each recipe. Fermented beverages such as kombucha may not be sold as cottage food.
3.3 Meat, poultry, and raw dairy products are prohibited.

Section 4. Revenue cap.
4.1 A cottage food production operation may not have annual gross income of more than $50,000 from the sale of cottage food.

Section 5. Sales venues.
5.1 Cottage food may be sold directly to consumers anywhere in this state, including at farmers markets and festivals, from the operator's home, and through internet orders delivered in this state.
5.2 Sales for resale, wholesale distribution, and shipment across state lines are prohibited.

Section 6. Labeling.
6.1 Each label must include the following exact statement: "${TX_STATEMENT_AFTER}"
6.2 The label must also include the operator's business name and the city and state of the operation, the common name of the product, the ingredients in descending order of predominance, and a declaration of major food allergens.

Section 7. Program contact.
7.1 Contact: Cottage Food Program, phone (512) 555-0176.
7.2 Office hours: Monday to Friday, 7:30am to 4:30pm.
`;

export const CA_STUB_MANDATED = 'MADE IN A HOME KITCHEN — FIXTURE STUB DISCLOSURE (CA).';

export const CA_SNAPSHOT_TEXT = `SYNTHETIC FIXTURE — California Cottage Food Rules (STUB fixture, rev. 2026-07). Not legal text.
Section 1. Stub coverage.
1.1 Eligible stub categories: baked goods that do not require refrigeration, and candies and confections.
1.2 Foods requiring refrigeration may not be sold as cottage food.
Section 2. Permit.
2.1 A stub permit application is required. Application fee: $25.
Section 3. Sales venues.
3.1 Direct-to-consumer sales are allowed at farmers markets, community events, from the operator's home, and through internet orders delivered within California.
3.2 Wholesale sales and interstate shipment are prohibited under this stub.
Section 4. Labeling.
4.1 Every label must bear the following exact statement: "${CA_STUB_MANDATED}"
4.2 The label must include the business name and city and state, the product name, the ingredients in descending order of predominance, and a declaration of major food allergens.
`;

export const FL_STUB_MANDATED = 'MADE IN A COTTAGE FOOD OPERATION — FIXTURE STUB DISCLOSURE (FL).';

export const FL_SNAPSHOT_TEXT = `SYNTHETIC FIXTURE — Florida Cottage Food Rules (STUB fixture, rev. 2026-07). Not legal text.
Section 1. Stub coverage.
1.1 Eligible stub categories: baked goods that do not require refrigeration, and candies and confections.
1.2 Foods requiring refrigeration may not be sold as cottage food.
Section 2. Permit.
2.1 No license is required under this stub. A free registration is recommended. Registration fee: $0.
Section 3. Sales venues.
3.1 Direct-to-consumer sales are allowed at farmers markets, community events, from the operator's home, and through internet orders delivered within Florida.
3.2 Wholesale sales and interstate shipment are prohibited under this stub.
Section 4. Labeling.
4.1 Every label must bear the following exact statement: "${FL_STUB_MANDATED}"
4.2 The label must include the business name and city and state, the product name, the ingredients in descending order of predominance, and a declaration of major food allergens.
`;

export interface FixtureSnapshots {
  ga: SnapshotRecord;
  txBefore: SnapshotRecord;
  txAfter: SnapshotRecord;
  ca: SnapshotRecord;
  fl: SnapshotRecord;
}

export function registerFixtureSnapshots(store: SnapshotStore): FixtureSnapshots {
  const ga = store.put({
    id: 'ga-cottage-2026-07-01',
    state: 'GA',
    url: 'https://fixture.ovenclear.example/ga/cottage-food-rules',
    fetchedAt: '2026-07-01T06:00:00.000Z',
    content: GA_SNAPSHOT_TEXT,
    fixture: true,
  });
  const txBefore = store.put({
    id: 'tx-cottage-2026-06-03',
    state: 'TX',
    url: 'https://fixture.ovenclear.example/tx/cottage-food-rules',
    fetchedAt: '2026-06-03T06:00:00.000Z',
    content: TX_SNAPSHOT_TEXT_BEFORE,
    fixture: true,
  });
  const txAfter = store.put({
    id: 'tx-cottage-2026-07-01',
    state: 'TX',
    url: 'https://fixture.ovenclear.example/tx/cottage-food-rules',
    fetchedAt: '2026-07-01T06:00:00.000Z',
    content: TX_SNAPSHOT_TEXT_AFTER,
    fixture: true,
  });
  const ca = store.put({
    id: 'ca-cottage-stub-2026-07-01',
    state: 'CA',
    url: 'https://fixture.ovenclear.example/ca/cottage-food-rules',
    fetchedAt: '2026-07-01T06:00:00.000Z',
    content: CA_SNAPSHOT_TEXT,
    fixture: true,
  });
  const fl = store.put({
    id: 'fl-cottage-stub-2026-07-01',
    state: 'FL',
    url: 'https://fixture.ovenclear.example/fl/cottage-food-rules',
    fetchedAt: '2026-07-01T06:00:00.000Z',
    content: FL_SNAPSHOT_TEXT,
    fixture: true,
  });
  return { ga, txBefore, txAfter, ca, fl };
}
