import type { VenueCode, VerdictStatus } from '../core/rulekit/types';

/**
 * Golden verdict suite — 26 cases across GA/TX (+2 stub-state sanity cases),
 * each pinned to an explicit pack version. Ground truth is FIXTURE truth:
 * hand-derived from the fixture rulepacks the way production ground truth is
 * attorney-derived from real ones. The eval runner asserts ZERO verdict flips
 * (status + key citations + conditions).
 */

export interface GoldenCase {
  id: string;
  description: string;
  state: string;
  packVersion: string;
  product: string;
  venue: VenueCode;
  expect: {
    status: VerdictStatus;
    /** Citations that MUST be present (subset check). */
    citesAll: string[];
    conditionsCount: number;
    /** Reason kinds that must appear. */
    reasonKinds?: ('product' | 'venue' | 'license' | 'cap' | 'coverage')[];
  };
}

export const GOLDEN_CASES: GoldenCase[] = [
  // ---------------- GA (deep pack 2026-07) ----------------
  {
    id: 'ga-01',
    description: 'GA sourdough at farmers market — the Rosa win path',
    state: 'GA', packVersion: '2026-07', product: 'sourdough', venue: 'farmers_market',
    expect: { status: 'eligible', citesAll: ['GA-CF-3.1', 'GA-CF-4.1', 'GA-CF-2.1'], conditionsCount: 0, reasonKinds: ['product', 'venue', 'license'] },
  },
  {
    id: 'ga-02',
    description: 'GA sourdough WHOLESALE — eligible product, banned venue (venue trumps)',
    state: 'GA', packVersion: '2026-07', product: 'sourdough', venue: 'wholesale',
    expect: { status: 'prohibited', citesAll: ['GA-CF-3.1', 'GA-CF-4.2'], conditionsCount: 0 },
  },
  {
    id: 'ga-03',
    description: 'GA cookies shipped within state — eligible',
    state: 'GA', packVersion: '2026-07', product: 'chocolate chip cookies', venue: 'online_instate_shipping',
    expect: { status: 'eligible', citesAll: ['GA-CF-3.1', 'GA-CF-4.1'], conditionsCount: 0 },
  },
  {
    id: 'ga-04',
    description: 'GA cheesecake — the refusal (refrigeration / potentially hazardous)',
    state: 'GA', packVersion: '2026-07', product: 'cheesecake', venue: 'farmers_market',
    expect: { status: 'prohibited', citesAll: ['GA-CF-1.2', 'GA-CF-3.2'], conditionsCount: 0 },
  },
  {
    id: 'ga-05',
    description: 'GA custard pie home pickup — prohibited (PHF)',
    state: 'GA', packVersion: '2026-07', product: 'custard pie', venue: 'home_pickup',
    expect: { status: 'prohibited', citesAll: ['GA-CF-1.2', 'GA-CF-3.2'], conditionsCount: 0 },
  },
  {
    id: 'ga-06',
    description: 'GA strawberry jam (high-acid, standard recipe) — eligible',
    state: 'GA', packVersion: '2026-07', product: 'strawberry jam', venue: 'farmers_market',
    expect: { status: 'eligible', citesAll: ['GA-CF-3.1'], conditionsCount: 0 },
  },
  {
    id: 'ga-07',
    description: 'GA tomato jam — the jam_june acidified edge: license + lab test',
    state: 'GA', packVersion: '2026-07', product: 'tomato jam', venue: 'farmers_market',
    expect: { status: 'license_required', citesAll: ['GA-CF-1.3', 'GA-CF-2.2'], conditionsCount: 2 },
  },
  {
    id: 'ga-08',
    description: 'GA dill pickles — acidified, license path (contrast with TX after amendment)',
    state: 'GA', packVersion: '2026-07', product: 'dill pickles', venue: 'farmers_market',
    expect: { status: 'license_required', citesAll: ['GA-CF-2.2'], conditionsCount: 2 },
  },
  {
    id: 'ga-09',
    description: 'GA sauerkraut — fermented, license path',
    state: 'GA', packVersion: '2026-07', product: 'sauerkraut', venue: 'farmers_market',
    expect: { status: 'license_required', citesAll: ['GA-CF-2.2'], conditionsCount: 2 },
  },
  {
    id: 'ga-10',
    description: 'GA beef jerky — meat, flat refusal',
    state: 'GA', packVersion: '2026-07', product: 'beef jerky', venue: 'farmers_market',
    expect: { status: 'prohibited', citesAll: ['GA-CF-3.2'], conditionsCount: 0 },
  },
  {
    id: 'ga-11',
    description: 'GA sourdough MAIL-ORDER ACROSS STATE LINES — interstate ban trumps',
    state: 'GA', packVersion: '2026-07', product: 'sourdough', venue: 'mail_order_interstate',
    expect: { status: 'prohibited', citesAll: ['GA-CF-4.2'], conditionsCount: 0 },
  },
  {
    id: 'ga-12',
    description: 'GA granola at a festival — eligible',
    state: 'GA', packVersion: '2026-07', product: 'granola', venue: 'event_festival',
    expect: { status: 'eligible', citesAll: ['GA-CF-3.1', 'GA-CF-4.1'], conditionsCount: 0 },
  },
  {
    id: 'ga-13',
    description: 'GA pound cake home pickup — eligible',
    state: 'GA', packVersion: '2026-07', product: 'pound cake', venue: 'home_pickup',
    expect: { status: 'eligible', citesAll: ['GA-CF-3.1'], conditionsCount: 0 },
  },
  {
    id: 'ga-14',
    description: 'GA raw milk cheese — raw dairy, flat refusal',
    state: 'GA', packVersion: '2026-07', product: 'raw milk cheese', venue: 'farmers_market',
    expect: { status: 'prohibited', citesAll: ['GA-CF-3.2'], conditionsCount: 0 },
  },

  // ---------------- TX (deep packs 2026-06 and 2026-07) ----------------
  {
    id: 'tx-01',
    description: 'TX sourdough at farmers market — eligible, cap noted',
    state: 'TX', packVersion: '2026-07', product: 'sourdough', venue: 'farmers_market',
    expect: { status: 'eligible', citesAll: ['TX-3.1', 'TX-5.1', 'TX-4.1'], conditionsCount: 0, reasonKinds: ['product', 'venue', 'cap'] },
  },
  {
    id: 'tx-02',
    description: 'TX dill pickles AFTER amendment — eligible WITH pH condition (the GA/TX flip)',
    state: 'TX', packVersion: '2026-07', product: 'dill pickles', venue: 'farmers_market',
    expect: { status: 'eligible', citesAll: ['TX-3.2'], conditionsCount: 1 },
  },
  {
    id: 'tx-03',
    description: 'TX dill pickles BEFORE amendment (pinned 2026-06) — prohibited',
    state: 'TX', packVersion: '2026-06', product: 'dill pickles', venue: 'farmers_market',
    expect: { status: 'prohibited', citesAll: ['TX-3.2'], conditionsCount: 0 },
  },
  {
    id: 'tx-04',
    description: 'TX sauerkraut AFTER amendment — eligible with pH condition',
    state: 'TX', packVersion: '2026-07', product: 'sauerkraut', venue: 'home_pickup',
    expect: { status: 'eligible', citesAll: ['TX-3.2'], conditionsCount: 1 },
  },
  {
    id: 'tx-05',
    description: 'TX kombucha — fermented BEVERAGE stays prohibited even after amendment',
    state: 'TX', packVersion: '2026-07', product: 'kombucha', venue: 'farmers_market',
    expect: { status: 'prohibited', citesAll: ['TX-3.2'], conditionsCount: 0 },
  },
  {
    id: 'tx-06',
    description: 'TX cheesecake — prohibited (PHF definition)',
    state: 'TX', packVersion: '2026-07', product: 'cheesecake', venue: 'farmers_market',
    expect: { status: 'prohibited', citesAll: ['TX-1.2'], conditionsCount: 0 },
  },
  {
    id: 'tx-07',
    description: 'TX pralines shipped in-state — eligible (no license state)',
    state: 'TX', packVersion: '2026-07', product: 'pralines', venue: 'online_instate_shipping',
    expect: { status: 'eligible', citesAll: ['TX-3.1', 'TX-5.1'], conditionsCount: 0 },
  },
  {
    id: 'tx-08',
    description: 'TX cookies MAIL-ORDER INTERSTATE — prohibited venue',
    state: 'TX', packVersion: '2026-07', product: 'chocolate chip cookies', venue: 'mail_order_interstate',
    expect: { status: 'prohibited', citesAll: ['TX-5.2'], conditionsCount: 0 },
  },
  {
    id: 'tx-09',
    description: 'TX fudge WHOLESALE — prohibited venue',
    state: 'TX', packVersion: '2026-07', product: 'fudge', venue: 'wholesale',
    expect: { status: 'prohibited', citesAll: ['TX-5.2'], conditionsCount: 0 },
  },
  {
    id: 'tx-10',
    description: 'TX salsa AFTER amendment — acidified vegetable product, eligible with pH duty',
    state: 'TX', packVersion: '2026-07', product: 'salsa', venue: 'farmers_market',
    expect: { status: 'eligible', citesAll: ['TX-3.2'], conditionsCount: 1 },
  },
  {
    id: 'tx-11',
    description: 'TX beef jerky — meat, prohibited',
    state: 'TX', packVersion: '2026-07', product: 'beef jerky', venue: 'farmers_market',
    expect: { status: 'prohibited', citesAll: ['TX-3.3'], conditionsCount: 0 },
  },
  {
    id: 'tx-12',
    description: 'TX tomato jam BEFORE amendment — acidified, prohibited (contrast with GA license path)',
    state: 'TX', packVersion: '2026-06', product: 'tomato jam', venue: 'farmers_market',
    expect: { status: 'prohibited', citesAll: ['TX-3.2'], conditionsCount: 0 },
  },

  // ---------------- stub-state sanity ----------------
  {
    id: 'ca-01',
    description: 'CA cookies (STUB pack) — eligible with stub-coverage note',
    state: 'CA', packVersion: '2026-07', product: 'chocolate chip cookies', venue: 'farmers_market',
    expect: { status: 'eligible', citesAll: ['CA-1.1'], conditionsCount: 0, reasonKinds: ['product', 'venue', 'license', 'coverage'] },
  },
  {
    id: 'fl-01',
    description: 'FL cheesecake (STUB pack) — prohibited, stub-coverage note',
    state: 'FL', packVersion: '2026-07', product: 'cheesecake', venue: 'home_pickup',
    expect: { status: 'prohibited', citesAll: ['FL-1.2'], conditionsCount: 0, reasonKinds: ['product', 'venue', 'coverage'] },
  },
];
