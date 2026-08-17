/**
 * Bundle the serverless entrypoint for Vercel.
 *
 * The storefront's modules import each other without file extensions, which `tsx`
 * resolves happily but Node's ESM loader on the deployed runtime does not. Rather
 * than rewrite every import across `server/` and `src/` the night before a deadline,
 * bundle the whole thing into one file where the resolution has already happened.
 *
 * Source lives at `api/_app.ts` — the leading underscore keeps Vercel from treating
 * it as a second function. Output is `api/index.js`, gitignored: it is a build
 * artifact, not source, and the judge-facing repo stays clean.
 */
import { build } from 'esbuild';

await build({
  entryPoints: ['api/_app.ts'],
  outfile: 'api/index.js',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  // Loaded lazily and only when a Gemini key is present; keeping it external means a
  // keyless deploy never pays for it and never fails on it.
  external: ['@google/genai'],
  banner: {
    js: "import{createRequire as __cr}from'node:module';const require=__cr(import.meta.url);",
  },
  logLevel: 'info',
});
