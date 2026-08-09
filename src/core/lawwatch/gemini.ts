import { PRODUCT_CATEGORIES, type ProductCategory } from '../rulekit/types';
import {
  DELTA_SCOPES,
  MATERIALITIES,
  type ClassifyRequest,
  type DeltaScope,
  type GeminiAdapter,
  type Materiality,
  type MaterialityResult,
} from './adapter';

/**
 * Real Gemini adapter for materiality classification.
 *
 * ONLY used when GEMINI_API_KEY is set — no test, script default, or CI path
 * touches the network. `@google/genai` is imported dynamically inside the
 * factory so the offline core never loads the SDK.
 *
 * Model responses are schema-constrained (responseMimeType + responseSchema)
 * and then sanitized: unknown delta ids are dropped, unknown enum values are
 * clamped to the conservative default (material/eligibility), and any delta
 * the model failed to classify gets the conservative default. The adapter can
 * therefore never widen the result surface beyond MaterialityResult.
 */

export function geminiAvailable(): boolean {
  return Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim());
}

export interface GeminiAdapterOptions {
  model?: string; // default gemini-2.5-pro (ARCHITECTURE.md: Pro for diff materiality)
}

export async function createGeminiAdapter(opts: GeminiAdapterOptions = {}): Promise<GeminiAdapter> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not set — use DeterministicMockAdapter for offline runs (this is the supported test path)',
    );
  }
  const { GoogleGenAI, Type } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey });
  const model = opts.model ?? 'gemini-2.5-pro';

  const responseSchema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        deltaId: { type: Type.STRING },
        classification: { type: Type.STRING, enum: [...MATERIALITIES] },
        scope: { type: Type.STRING, enum: [...DELTA_SCOPES] },
        rationale: { type: Type.STRING },
        affectedCategories: {
          type: Type.ARRAY,
          items: { type: Type.STRING, enum: [...PRODUCT_CATEGORIES] },
        },
      },
      required: ['deltaId', 'classification', 'scope', 'rationale'],
    },
  };

  return {
    name: `gemini:${model}`,
    async classifyMateriality(req: ClassifyRequest): Promise<MaterialityResult[]> {
      const prompt = buildPrompt(req);
      const res = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          temperature: 0,
          responseMimeType: 'application/json',
          responseSchema,
        },
      });
      let parsed: unknown;
      try {
        parsed = JSON.parse(res.text ?? '[]');
      } catch {
        parsed = [];
      }
      return sanitize(parsed, req);
    },
  };
}

function buildPrompt(req: ClassifyRequest): string {
  const deltas = req.deltas
    .map(
      (d) =>
        `--- delta ${d.id} (${d.kind}) in ${d.section} ---\nBEFORE: ${d.before ?? '(none)'}\nAFTER: ${d.after ?? '(none)'}`,
    )
    .join('\n');
  return [
    `You are the OvenClear law-watch materiality classifier for US cottage-food rules (state: ${req.state}).`,
    'For EACH delta below, decide whether the change is "material" (changes a compliance duty:',
    'label wording, eligible foods, venues, fees, licenses), "immaterial" (administrative churn),',
    'or "cosmetic" (pure formatting). Assign the scope and, for eligibility changes, the affected',
    'product categories. Answer for every delta id, as JSON matching the response schema.',
    '',
    deltas,
  ].join('\n');
}

/** Clamp model output to the typed surface; conservative default for gaps. */
export function sanitize(raw: unknown, req: ClassifyRequest): MaterialityResult[] {
  const byId = new Map<string, MaterialityResult>();
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item !== 'object' || item === null) continue;
      const r = item as Record<string, unknown>;
      const deltaId = typeof r.deltaId === 'string' ? r.deltaId : '';
      if (!req.deltas.some((d) => d.id === deltaId)) continue; // hallucinated id → drop
      const classification = (MATERIALITIES as readonly string[]).includes(String(r.classification))
        ? (r.classification as Materiality)
        : 'material';
      const scope = (DELTA_SCOPES as readonly string[]).includes(String(r.scope))
        ? (r.scope as DeltaScope)
        : 'eligibility';
      const affectedCategories = Array.isArray(r.affectedCategories)
        ? (r.affectedCategories.filter((c) =>
            (PRODUCT_CATEGORIES as readonly string[]).includes(String(c)),
          ) as ProductCategory[])
        : [];
      byId.set(deltaId, {
        deltaId,
        classification,
        scope,
        rationale: typeof r.rationale === 'string' && r.rationale ? r.rationale : '(no rationale returned)',
        affectedCategories,
      });
    }
  }
  // Every requested delta gets a result; gaps default conservatively to material.
  return req.deltas.map(
    (d) =>
      byId.get(d.id) ?? {
        deltaId: d.id,
        classification: 'material' as const,
        scope: 'eligibility' as const,
        rationale: 'model returned no classification for this delta — conservative default (material)',
        affectedCategories: [],
      },
  );
}
