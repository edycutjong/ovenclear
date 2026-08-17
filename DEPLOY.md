# Deploying OvenClear to Cloud Run

Everything here is one person, copy-paste, about 30 minutes — most of it waiting
on Stripe identity verification, which you should start first because it is the
only step with a lead time you cannot compress.

The service runs fine with no Stripe key and no Gemini key: it serves verdicts
and refusals from the deterministic core. Those two keys switch on *taking money*
and *live model calls*, in that order of importance.

---

## 0 · Start the things that make you wait

1. **Stripe** — activate the account for live payments (identity verification).
   Until it clears, use `sk_test_…` and everything below still works end to end.
2. **Google Cloud** — create/select a project and make sure billing is attached.

```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
gcloud services enable run.googleapis.com artifactregistry.googleapis.com \
  cloudbuild.googleapis.com secretmanager.googleapis.com storage.googleapis.com
```

---

## 1 · A bucket for the ledger

The container filesystem does not survive a restart, and the signed ledger is the
one thing that must. Mount a bucket instead of reaching for a database.

```bash
export PROJECT_ID="$(gcloud config get-value project)"
export REGION=us-central1
export BUCKET="${PROJECT_ID}-ovenclear-data"

gcloud storage buckets create "gs://${BUCKET}" --location="${REGION}"
```

---

## 2 · Secrets

Generate the ledger key namespace **once**. Agent signing keys derive from it, so
anyone holding it can forge ledger rows — and rotating it invalidates every
signature you have already published.

```bash
openssl rand -hex 32 | gcloud secrets create ovenclear-ledger-ns --data-file=-

printf '%s' 'sk_test_REPLACE_ME' | gcloud secrets create ovenclear-stripe-key --data-file=-

# Placeholder — you cannot know the real value until step 4.
printf '%s' 'whsec_PLACEHOLDER' | gcloud secrets create ovenclear-stripe-whsec --data-file=-

# Optional, switches on the live model paths.
printf '%s' 'AIza_REPLACE_ME' | gcloud secrets create ovenclear-gemini-key --data-file=-
```

Grant the runtime service account read access:

```bash
export SA="$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')-compute@developer.gserviceaccount.com"

for s in ovenclear-ledger-ns ovenclear-stripe-key ovenclear-stripe-whsec ovenclear-gemini-key; do
  gcloud secrets add-iam-policy-binding "$s" \
    --member="serviceAccount:${SA}" --role=roles/secretmanager.secretAccessor
done

gcloud storage buckets add-iam-policy-binding "gs://${BUCKET}" \
  --member="serviceAccount:${SA}" --role=roles/storage.objectAdmin
```

---

## 3 · Deploy

`BASE_URL` has to be the real service URL, which does not exist until the first
deploy. So: deploy once with a placeholder, read the URL, deploy again. The first
deploy will serve broken Stripe redirect links — that is expected and harmless
because nothing can pay yet.

```bash
cd build/

# First pass — just to mint the URL.
gcloud run deploy ovenclear \
  --source . \
  --region "${REGION}" \
  --allow-unauthenticated \
  --port 8080 \
  --cpu 1 --memory 512Mi \
  --min-instances 0 --max-instances 4 \
  --add-volume "name=data,type=cloud-storage,bucket=${BUCKET}" \
  --add-volume-mount "volume=data,mount-path=/data" \
  --set-env-vars "NODE_ENV=production,DATA_DIR=/data,PRICE_USD=19,BASE_URL=https://placeholder.invalid" \
  --set-secrets "LEDGER_KEY_NAMESPACE=ovenclear-ledger-ns:latest,STRIPE_SECRET_KEY=ovenclear-stripe-key:latest,STRIPE_WEBHOOK_SECRET=ovenclear-stripe-whsec:latest,GEMINI_API_KEY=ovenclear-gemini-key:latest"

export URL="$(gcloud run services describe ovenclear --region "${REGION}" --format='value(status.url)')"
echo "$URL"

# Second pass — with the real origin.
gcloud run services update ovenclear --region "${REGION}" \
  --update-env-vars "BASE_URL=${URL}"

curl -fsS "${URL}/healthz" && echo " — up"
```

> **Note on `min-instances 0`.** Cold starts are a few seconds and the judging
> window is a month long, so scale-to-zero is the right trade. If you are about
> to demo live, set `--min-instances 1` for the duration.

---

## 4 · Point Stripe at it

In the Stripe dashboard → **Developers → Webhooks → Add endpoint**:

- URL: `$URL/webhooks/stripe`
- Events: `checkout.session.completed` and `checkout.session.async_payment_succeeded`

Copy the signing secret it gives you (`whsec_…`) and replace the placeholder:

```bash
printf '%s' 'whsec_THE_REAL_ONE' | gcloud secrets versions add ovenclear-stripe-whsec --data-file=-
gcloud run services update ovenclear --region "${REGION}" \
  --update-secrets "STRIPE_WEBHOOK_SECRET=ovenclear-stripe-whsec:latest"
```

The webhook is the source of truth for fulfillment. The success page also
confirms payment directly with Stripe and fulfils if the webhook has not landed
yet — the browser usually wins that race — and both paths are idempotent, so a
retry cannot issue a second label.

---

## 5 · Going live with real money

```bash
printf '%s' 'sk_live_THE_REAL_ONE' | gcloud secrets versions add ovenclear-stripe-key --data-file=-
gcloud run services update ovenclear --region "${REGION}" \
  --update-secrets "STRIPE_SECRET_KEY=ovenclear-stripe-key:latest"
```

Recreate the webhook endpoint in **live mode** as well — test-mode and live-mode
endpoints are separate objects with different signing secrets, and this is the
single most common way a first live sale silently fails to fulfil.

---

## 6 · Check it end to end before you tell anyone

```bash
curl -fsS "${URL}/healthz"                     # ok
curl -fsS "${URL}/" | head -5                  # landing page
curl -fsS "${URL}/ledger.jsonl" | wc -l        # signed rows, ≥5 at genesis
open "${URL}/verify/"                          # the judge-facing dashboard
```

Then do it as a customer would:

1. `/start` → sourdough, GA, farmers market → **Eligible**, free.
2. Buy it with Stripe test card `4242 4242 4242 4242`, any future expiry, any CVC.
3. You should land on `/order/<token>` with a QA-passed label and a working QR link.
4. `/start` → **cheesecake**, GA → the refusal, with the refrigeration rule quoted,
   and **no checkout button**. If you can pay for a cheesecake label, stop and fix
   that before selling anything.

Verify the chain yourself:

```bash
curl -fsS "${URL}/ledger.jsonl" > /tmp/prod-ledger.jsonl
npm run verify-ledger -- /tmp/prod-ledger.jsonl
```

---

## The automated path: CI/CD to Vercel

Cloud Run above is the durable target. The **live judged instance**
(<https://ovenclear.edycu.dev>) runs on Vercel and is deployed by
`.github/workflows/ci.yml` → *Stage 4 · Deploy*, on every push to `main` that
clears typecheck, the 156 tests, and the offline proof stage.

Because that URL has to stay up, the job is a staged rollout rather than a plain
`vercel deploy --prod`:

1. `npm run build:vercel` bundles `api/_app.ts` → `api/index.js` with esbuild.
   That file is gitignored (an artifact, not source) and `.vercelignore`
   deliberately does **not** exclude it — skip this step and the deployed
   function simply does not exist.
2. `vercel deploy --prod --skip-domain` publishes a real production deployment
   but leaves `ovenclear.edycu.dev` on the last known-good one.
3. `node scripts/smoke.mjs <new-deployment-url>` runs the gate: `/healthz` must
   return `ok`, `/` must serve the storefront, and `POST /quote` for the GA
   cheesecake case must come back as a refusal with **zero** occurrences of
   `checkout` or `<button`. A deploy that fails here never sees traffic.
4. Only then is the custom domain moved. A production deployment does not
   reliably drag an aliased custom domain with it, so the job checks and, if
   needed, runs `vercel alias set` explicitly — then smokes the live domain as a
   hard gate.

Runtime configuration (`NODE_ENV`, `DATA_DIR`, `PRICE_USD`,
`LEDGER_KEY_NAMESPACE`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
`BASE_URL`) lives in the Vercel project's **Production** environment, not in the
workflow. `server/config.ts` refuses to boot in production without it, which
means a missing variable fails step 3 instead of the live site.

CI needs only `VERCEL_TOKEN` (secret) plus `VERCEL_ORG_ID` and
`VERCEL_PROJECT_ID` (repository variables).

You can run the same gate by hand against anything: `npm run smoke -- https://ovenclear.edycu.dev`.

## Releases

Versioning is automated by [release-please](https://github.com/googleapis/release-please-action)
(`.github/workflows/release.yml`) and driven by Conventional Commits. Pushing to
`main` opens or updates a single `chore(main): release X.Y.Z` pull request
carrying the computed bump, the regenerated `CHANGELOG.md`, and the
`package.json` / `package-lock.json` version. Merging that PR cuts the git tag
and the GitHub Release — and, because it is a push to `main`, re-runs CI and the
deploy above. Nothing is tagged without a human merging.

## Operating notes

- **Logs are evidence.** Every ledger row and order transition is also written to
  stdout as structured JSON, so Cloud Logging keeps an independent copy:
  `gcloud run services logs read ovenclear --region "${REGION}" --limit 200`
- **Export the evidence pack** with `npm run evidence:pack` (point `DATA_DIR` at a
  local copy of the bucket) for the revenue/customer/agent-activity files.
- **Rollback** is `gcloud run services update-traffic ovenclear --to-revisions=PREVIOUS=100`.
- **The service must stay up until judging ends (2026-09-15).** Scale-to-zero costs
  nothing while idle; do not delete the service or the bucket after submitting.
