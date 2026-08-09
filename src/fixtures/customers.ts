import type { VenueCode } from '../core/rulekit/types';

/**
 * FIXTURE customers (SEED_DATA.md): the three named demo paths plus a
 * 14-member synthetic TX cohort holding labels issued under TX@2026-06 —
 * the population the replayed amendment fans out over (9 Law-Watch
 * subscribers re-issued + 5 non-subscribers notified = the "14 affected
 * customers" demo beat).
 *
 * All names, businesses and emails are SYNTHETIC.
 */

export interface CustomerFixture {
  id: string;
  name: string;
  businessName: string;
  state: string;
  city: string;
  email: string;
  product: string; // interview-vocabulary product description
  venue: VenueCode;
  ingredients: string[];
  netWeight?: string;
  lawWatch: boolean;
  /** Whether seed should issue a label (only meaningful for non-prohibited verdicts). */
  wantsLabel: boolean;
}

export const CUSTOMER_FIXTURES: CustomerFixture[] = [
  // --- the three named demo paths (GA) ---
  {
    id: 'rosas_bakes',
    name: 'Rosa Delgado',
    businessName: "Rosa's Bakes",
    state: 'GA',
    city: 'Marietta, GA',
    email: 'rosa@fixture.ovenclear.example',
    product: 'sourdough',
    venue: 'farmers_market',
    ingredients: ['wheat flour', 'water', 'sea salt'],
    netWeight: '1 lb 8 oz (680 g)',
    lawWatch: true,
    wantsLabel: true,
  },
  {
    id: 'cheesecake_charlie',
    name: 'Charlie Brooks',
    businessName: "Charlie's Cheesecakes",
    state: 'GA',
    city: 'Atlanta, GA',
    email: 'charlie@fixture.ovenclear.example',
    product: 'cheesecake',
    venue: 'farmers_market',
    ingredients: ['cream cheese', 'eggs', 'sugar', 'wheat flour'],
    lawWatch: false,
    wantsLabel: true, // he wants one — the engine must refuse (prohibited path)
  },
  {
    id: 'jam_june',
    name: 'June Okafor',
    businessName: "June's Preserves",
    state: 'GA',
    city: 'Savannah, GA',
    email: 'june@fixture.ovenclear.example',
    product: 'tomato jam',
    venue: 'farmers_market',
    ingredients: ['tomatoes', 'sugar', 'lemon juice', 'pectin'],
    lawWatch: false,
    wantsLabel: false, // license path first — label comes after licensing
  },

  // --- TX cohort: 9 Law-Watch subscribers ---
  { id: 'tx_pecan_pete', name: 'Pete Alvarez', businessName: "Pete's Pralines", state: 'TX', city: 'San Antonio, TX', email: 'pete@fixture.ovenclear.example', product: 'pralines', venue: 'farmers_market', ingredients: ['pecans', 'sugar', 'butter'], lawWatch: true, wantsLabel: true },
  { id: 'tx_kolache_kate', name: 'Kate Novak', businessName: "Kate's Kolaches", state: 'TX', city: 'West, TX', email: 'kate@fixture.ovenclear.example', product: 'fruit kolaches', venue: 'farmers_market', ingredients: ['wheat flour', 'milk', 'eggs', 'peach filling'], lawWatch: true, wantsLabel: true },
  { id: 'tx_sourdough_sam', name: 'Sam Whitfield', businessName: 'Hill Country Hearth', state: 'TX', city: 'Fredericksburg, TX', email: 'sam@fixture.ovenclear.example', product: 'sourdough loaf', venue: 'home_pickup', ingredients: ['wheat flour', 'water', 'salt'], lawWatch: true, wantsLabel: true },
  { id: 'tx_cookie_carmen', name: 'Carmen Reyes', businessName: 'Carmen Bakes', state: 'TX', city: 'El Paso, TX', email: 'carmen@fixture.ovenclear.example', product: 'chocolate chip cookies', venue: 'online_instate_shipping', ingredients: ['wheat flour', 'butter', 'eggs', 'chocolate chips'], lawWatch: true, wantsLabel: true },
  { id: 'tx_jam_jorge', name: 'Jorge Trevino', businessName: 'Rio Jams', state: 'TX', city: 'McAllen, TX', email: 'jorge@fixture.ovenclear.example', product: 'strawberry jam', venue: 'farmers_market', ingredients: ['strawberries', 'sugar', 'pectin', 'lemon juice'], lawWatch: true, wantsLabel: true },
  { id: 'tx_granola_grace', name: 'Grace Kim', businessName: 'Lone Star Granola', state: 'TX', city: 'Austin, TX', email: 'grace@fixture.ovenclear.example', product: 'granola', venue: 'event_festival', ingredients: ['oats', 'honey', 'almonds'], lawWatch: true, wantsLabel: true },
  { id: 'tx_fudge_fiona', name: 'Fiona Walsh', businessName: "Fiona's Fudge", state: 'TX', city: 'Waco, TX', email: 'fiona@fixture.ovenclear.example', product: 'fudge', venue: 'farmers_market', ingredients: ['sugar', 'butter', 'cocoa'], lawWatch: true, wantsLabel: true },
  { id: 'tx_biscotti_bill', name: 'Bill Tran', businessName: 'Twice-Baked TX', state: 'TX', city: 'Houston, TX', email: 'bill@fixture.ovenclear.example', product: 'biscotti', venue: 'online_instate_shipping', ingredients: ['wheat flour', 'eggs', 'sugar', 'almonds'], lawWatch: true, wantsLabel: true },
  { id: 'tx_candy_cruz', name: 'Cruz Medina', businessName: 'Cruz Candy Co', state: 'TX', city: 'Corpus Christi, TX', email: 'cruz@fixture.ovenclear.example', product: 'hard candy', venue: 'event_festival', ingredients: ['sugar', 'corn syrup', 'natural flavor'], lawWatch: true, wantsLabel: true },

  // --- TX cohort: 5 non-subscribers (notified, not auto-re-issued) ---
  { id: 'tx_muffin_mia', name: 'Mia Duran', businessName: 'Mia Muffins', state: 'TX', city: 'Lubbock, TX', email: 'mia@fixture.ovenclear.example', product: 'muffins', venue: 'farmers_market', ingredients: ['wheat flour', 'milk', 'eggs', 'blueberries'], lawWatch: false, wantsLabel: true },
  { id: 'tx_brownie_beto', name: 'Beto Salinas', businessName: "Beto's Brownies", state: 'TX', city: 'Laredo, TX', email: 'beto@fixture.ovenclear.example', product: 'brownies', venue: 'home_pickup', ingredients: ['wheat flour', 'butter', 'eggs', 'cocoa'], lawWatch: false, wantsLabel: true },
  { id: 'tx_marmalade_mo', name: 'Mo Haddad', businessName: 'Marfa Marmalade', state: 'TX', city: 'Marfa, TX', email: 'mo@fixture.ovenclear.example', product: 'orange marmalade', venue: 'farmers_market', ingredients: ['oranges', 'sugar', 'lemon juice'], lawWatch: false, wantsLabel: true },
  { id: 'tx_bark_bella', name: 'Bella Nguyen', businessName: 'Bark & Bloom', state: 'TX', city: 'Plano, TX', email: 'bella@fixture.ovenclear.example', product: 'chocolate bark', venue: 'event_festival', ingredients: ['dark chocolate', 'almonds', 'sea salt'], lawWatch: false, wantsLabel: true },
  { id: 'tx_poundcake_paz', name: 'Paz Herrera', businessName: 'Paz Pound Cakes', state: 'TX', city: 'Amarillo, TX', email: 'paz@fixture.ovenclear.example', product: 'pound cake', venue: 'online_instate_shipping', ingredients: ['wheat flour', 'butter', 'eggs', 'sugar'], lawWatch: false, wantsLabel: true },
];
