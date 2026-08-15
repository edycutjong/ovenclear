import { normalizeProduct, PRODUCT_CATALOG, type NormalizedProduct } from '../src/core/rulekit/catalog';
import { UnknownProductError } from '../src/core/rulekit/types';
import { logEvent } from './store';

/**
 * Gemini-assisted product resolution — the "LLM may only WIDEN recall, never
 * change a catalog hit" rule from catalog.ts, actually implemented.
 *
 * Order of operations, and it matters:
 *   1. The deterministic catalog runs FIRST. If it hits, Gemini is never
 *      called and the result is byte-identical to the offline core's.
 *   2. Only when the catalog throws UnknownProductError does Gemini get a
 *      turn, and all it may do is name a term that is ALREADY in the catalog.
 *   3. That suggestion is then re-run through the same deterministic
 *      normalizer. If Gemini names something not in the catalog, the original
 *      refusal stands.
 *
 * So the model can rescue "my tangy no-knead boule" into "sourdough bread",
 * but it cannot invent a product, cannot move a product between categories,
 * and cannot turn a refusal into a sale. The compliance decision stays with
 * the deterministic engine.
 */

export interface ResolvedProduct extends NormalizedProduct {
  /** True when the catalog missed and Gemini's suggestion rescued the input. */
  viaGemini: boolean;
  geminiSuggestion?: string;
  geminiModel?: string;
}

const MODEL = 'gemini-2.5-flash';

export class ProductResolver {
  constructor(
    private readonly apiKey: string | null,
    private readonly model = MODEL,
  ) {}

  get live(): boolean {
    return Boolean(this.apiKey);
  }

  async resolve(input: string): Promise<ResolvedProduct> {
    try {
      return { ...normalizeProduct(input), viaGemini: false };
    } catch (e) {
      if (!(e instanceof UnknownProductError) || !this.apiKey) throw e;

      const suggestion = await this.askGemini(input).catch((err: Error) => {
        logEvent('gemini_resolve_failed', { input, error: err.message });
        return null;
      });
      if (!suggestion) throw e;

      let rescued: NormalizedProduct;
      try {
        // The catalog is still the authority — a hallucinated term dies here.
        rescued = normalizeProduct(suggestion);
      } catch {
        logEvent('gemini_resolve_rejected', {
          input,
          suggestion,
          reason: 'suggestion is not a catalog term — original refusal stands',
        });
        throw e;
      }
      logEvent('gemini_resolve_hit', {
        input,
        suggestion,
        canonical: rescued.canonical,
        model: this.model,
      });
      return {
        ...rescued,
        input, // keep what the customer actually typed
        viaGemini: true,
        geminiSuggestion: suggestion,
        geminiModel: this.model,
      };
    }
  }

  /**
   * Ask Gemini to pick the closest CATALOG term, constrained to an enum of the
   * catalog itself — the model cannot return a term that does not exist.
   */
  private async askGemini(input: string): Promise<string | null> {
    const { GoogleGenAI, Type } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: this.apiKey! });
    const canonicals = PRODUCT_CATALOG.map((e) => e.canonical);

    const res = await ai.models.generateContent({
      model: this.model,
      contents: [
        'A home baker described what they want to sell. Map it to the single closest term',
        'from the catalog enum. If nothing in the catalog is a genuine match, set matched=false',
        '— a wrong match is far worse than no match, because it produces a compliance verdict',
        'for the wrong food category.',
        '',
        `Baker's description: "${input}"`,
      ].join('\n'),
      config: {
        temperature: 0,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            matched: { type: Type.BOOLEAN },
            canonical: { type: Type.STRING, enum: canonicals },
            confidence: { type: Type.NUMBER },
          },
          required: ['matched'],
        },
      },
    });

    let parsed: { matched?: boolean; canonical?: string; confidence?: number };
    try {
      parsed = JSON.parse(res.text ?? '{}');
    } catch {
      return null;
    }
    if (!parsed.matched || !parsed.canonical) return null;
    // Low-confidence rescues are refused: a compliance product should say
    // "I don't know" rather than guess the category.
    if (typeof parsed.confidence === 'number' && parsed.confidence < 0.6) return null;
    return canonicals.includes(parsed.canonical) ? parsed.canonical : null;
  }
}
