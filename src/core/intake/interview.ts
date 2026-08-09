import type { RuleEngine } from '../rulekit/engine';
import { normalizeProduct } from '../rulekit/catalog';
import {
  UnknownProductError,
  VENUE_CODES,
  type ProductCategory,
  type VenueCode,
} from '../rulekit/types';

/**
 * Guided-interview intake (PRD core feature #1, UI.md screen 2): six
 * structured questions, no free-text chat. This module is the deterministic
 * normalizer behind the wizard — production adds a Gemini Flash pre-pass for
 * messy input, but a catalog hit is always authoritative.
 *
 * Questions: state → product → venue → business name (+city) → ingredients →
 * contact.
 */

export type InterviewQuestion =
  | 'state'
  | 'product'
  | 'venue'
  | 'business_name'
  | 'ingredients'
  | 'contact';

export interface InterviewAnswers {
  state: string;
  productDescription: string;
  venue: string;
  businessName: string;
  city: string; // "Marietta, GA" address line (fixture posture)
  ingredients: string[];
  contactEmail: string;
}

export interface NormalizedCase {
  state: string;
  venue: VenueCode;
  productInput: string;
  canonicalProduct: string;
  category: ProductCategory;
  businessName: string;
  addressLine: string;
  ingredients: string[];
  contactEmail: string;
}

export class InterviewValidationError extends Error {
  constructor(
    public readonly question: InterviewQuestion,
    message: string,
    public readonly suggestions: string[] = [],
  ) {
    super(`interview [${question}]: ${message}`);
    this.name = 'InterviewValidationError';
  }
}

export function normalizeInterview(answers: InterviewAnswers, engine: RuleEngine): NormalizedCase {
  const state = answers.state.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(state)) {
    throw new InterviewValidationError('state', `"${answers.state}" is not a two-letter state code`);
  }
  if (!engine.states().includes(state)) {
    throw new InterviewValidationError(
      'state',
      `${state} is not covered yet (covered: ${engine.states().join(', ')}) — production offers the made-to-order research path`,
    );
  }

  const venue = answers.venue.trim().toLowerCase().replace(/[\s-]+/g, '_') as VenueCode;
  if (!(VENUE_CODES as readonly string[]).includes(venue)) {
    throw new InterviewValidationError(
      'venue',
      `"${answers.venue}" is not a known venue`,
      [...VENUE_CODES],
    );
  }

  let product;
  try {
    product = normalizeProduct(answers.productDescription);
  } catch (e) {
    if (e instanceof UnknownProductError) {
      throw new InterviewValidationError('product', e.message, e.suggestions);
    }
    throw e;
  }

  const businessName = answers.businessName.trim();
  if (!businessName) throw new InterviewValidationError('business_name', 'business name is required');
  const addressLine = answers.city.trim();
  if (!addressLine) throw new InterviewValidationError('business_name', 'city/state address line is required');

  const ingredients = answers.ingredients.map((i) => i.trim()).filter(Boolean);
  if (ingredients.length === 0) {
    throw new InterviewValidationError('ingredients', 'at least one ingredient is required (labels must list them)');
  }

  const contactEmail = answers.contactEmail.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    throw new InterviewValidationError('contact', `"${answers.contactEmail}" is not a valid email`);
  }

  return {
    state,
    venue,
    productInput: answers.productDescription,
    canonicalProduct: product.canonical,
    category: product.category,
    businessName,
    addressLine,
    ingredients,
    contactEmail,
  };
}
