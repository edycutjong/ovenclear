/**
 * Terms, Privacy and Refunds.
 *
 * These exist for three reasons, in descending order of urgency:
 *   1. Stripe will not activate a live account for a site that has no terms
 *      and no privacy policy. This is an activation blocker, not polish.
 *   2. We collect an email address and take card payments, so a privacy
 *      notice is a legal requirement rather than a nicety.
 *   3. We publish a decision ledger. Anything published needs to be disclosed
 *      to the person whose order produced the row.
 *
 * Every factual claim below is checked against the code that implements it:
 * the refund conditions match `fulfill.ts`, and the ledger field list matches
 * the payloads actually passed to `world.record`. If those change, change
 * these. A privacy policy that describes a system you no longer run is worse
 * than none, because it is a false statement rather than a missing one.
 *
 * `[LIVE-FILL: …]` marks the operator-identity facts that cannot be derived
 * from code — legal entity, address, governing law. Fill them before taking
 * real money. Do not invent them.
 */

import type { Config } from './config';
import { esc, layout } from './html';

const UPDATED = '16 August 2026';

function legalShell(o: { title: string; heading: string; description: string; body: string }): string {
  return layout({
    title: `${o.title} — OvenClear`,
    description: o.description,
    body: `
<section class="hero" style="padding-bottom:8px">
  <h1>${esc(o.heading)}</h1>
  <p class="lede" style="margin-bottom:0">Last updated ${UPDATED}.</p>
</section>
<div class="card prose">
${o.body}
</div>
<p style="margin-top:24px"><a class="navlink" href="/terms">Terms</a> &nbsp;·&nbsp;
<a class="navlink" href="/privacy">Privacy</a> &nbsp;·&nbsp;
<a class="navlink" href="/refunds">Refunds</a></p>`,
  });
}

// ── terms ───────────────────────────────────────────────────────────────────

export function termsPage(cfg: Config): string {
  return legalShell({
    title: 'Terms of Service',
    heading: 'Terms of Service',
    description: 'The terms you agree to when you buy an OvenClear verdict and label.',
    body: `
<p><strong>Read the first section even if you read nothing else.</strong> It is the one most
likely to matter to you, and it is not boilerplate.</p>

<h2>1. This is not legal advice, and the rule text is synthetic</h2>
<p>OvenClear is not a law firm, not an attorney, and does not give legal advice. Buying a verdict
does not create an attorney–client relationship.</p>
<p>More importantly, and unusually: <strong>the rule text in this service is FIXTURE data.</strong>
It is synthetic, statute-<em>shaped</em> text modeled on real cottage-food programs. It is not
verbatim law and is not a substitute for your state's actual published rules or for advice from a
qualified professional in your jurisdiction. What is genuine is the machinery — the verdict engine,
the byte-verbatim label gate, the signed ledger and the law-watch re-issue loop all operate exactly
as described. <strong>Do not rely on a verdict from this service as your sole basis for selling
food to the public.</strong> Verify against your state's own published rules.</p>

<h2>2. What you are buying</h2>
<p>A single verdict for one product, in one state, for one venue type, together with a print-ready
label file and a public provenance page reachable from the QR code on that label. Where a Law-Watch
subscription is active, you are additionally buying automatic re-issue of that label when a covered
rule changes materially.</p>
<p>You are not buying a licence, a permit, a registration, an inspection, an approval, or any
representation that a regulator will agree with the verdict.</p>

<h2>3. What you are responsible for</h2>
<ul class="clean">
  <li><strong>The accuracy of what you tell us.</strong> Verdicts are computed from your stated
    product, ingredients, state and venue. A wrong input produces a wrong verdict, and that is not
    a defect in the service.</li>
  <li><strong>Ingredients and allergens.</strong> Allergen text is derived from the ingredient list
    you supply. If you omit an ingredient, the label will omit its allergen.</li>
  <li><strong>Complying with the law as it actually is</strong> in your jurisdiction, including
    rules this service does not cover.</li>
</ul>

<h2>4. Coverage is deliberately narrow</h2>
<p>Georgia and Texas are modeled in depth. California and Florida are stubs. No other state is
covered. If we cannot answer for your state, we say so and do not charge you.</p>

<h2>5. Automated decisions</h2>
<p>Verdicts, label composition, quality checks and law-change re-issues are produced by automated
agents operating under a bounded policy. Every such decision is recorded on a public, signed
ledger. Where an AI model is used, it is constrained to a fixed catalog and its output is
re-checked by deterministic code that can and does reject it. If you want a human to look at a
decision, email <a href="mailto:${esc(cfg.supportEmail)}">${esc(cfg.supportEmail)}</a> and one
will.</p>

<h2>6. Refusals are a feature</h2>
<p>The service will decline to issue a label where the rules do not permit the product at the
venue you chose. A refusal is a correct outcome, not a failed order, and you are not charged for
one. See <a href="/refunds">Refunds</a>.</p>

<h2>7. No warranty</h2>
<p>The service is provided "as is", without warranties of any kind, express or implied, including
merchantability, fitness for a particular purpose and non-infringement. We do not warrant that the
service will be uninterrupted or error-free, nor that any verdict reflects the current state of any
law.</p>

<h2>8. Limitation of liability</h2>
<p>To the maximum extent permitted by law, our total aggregate liability arising out of or relating
to the service is limited to the amount you actually paid us for the order giving rise to the
claim. We are not liable for indirect, incidental, special, consequential or punitive damages, nor
for lost profits, lost sales, fines, penalties, or enforcement action, whether or not foreseeable.</p>

<h2>9. Acceptable use</h2>
<p>Do not attempt to resell verdicts as your own compliance product, scrape the service in bulk,
interfere with its operation, or use it to produce labels for products you do not actually make.</p>

<h2>10. Changes</h2>
<p>We may update these terms. The version in force for your order is the one published when you
paid. Material changes will be reflected in the "last updated" date above.</p>

<h2>11. Contact and governing law</h2>
<p>Operator: <strong>[LIVE-FILL: legal entity name and registered address]</strong>.
Governing law: <strong>[LIVE-FILL: governing law and venue for disputes]</strong>.
Questions: <a href="mailto:${esc(cfg.supportEmail)}">${esc(cfg.supportEmail)}</a>.</p>`,
  });
}

// ── privacy ─────────────────────────────────────────────────────────────────

export function privacyPage(cfg: Config): string {
  return legalShell({
    title: 'Privacy Policy',
    heading: 'Privacy Policy',
    description: 'What OvenClear collects, what it publishes, and what it never sees.',
    body: `
<p>Short version: we collect the minimum needed to produce your label and email it to you, we never
see your card details, and <strong>we publish a decision ledger that you should understand before
you order</strong> — section 3.</p>

<h2>1. What we collect</h2>
<ul class="clean">
  <li><strong>Your email address</strong> — to deliver the label and contact you about the order.</li>
  <li><strong>Order details</strong> — business name, city, state, product description, ingredient
    list, venue type and net weight. These are the inputs to the verdict and the label.</li>
  <li><strong>Payment records</strong> — a Stripe session identifier and payment identifier, the
    amount, and whether it succeeded.</li>
  <li><strong>Operational logs</strong> — ordinary server logs recording that requests happened.</li>
</ul>

<h2>2. What we never see</h2>
<p><strong>Card numbers, CVCs and expiry dates never reach our servers.</strong> Payment is handled
entirely by Stripe on Stripe's own checkout pages. We receive only an identifier and a
success-or-failure result. Stripe's handling of your payment data is governed by Stripe's privacy
policy.</p>

<h2>3. What we publish — read this before you order</h2>
<p>OvenClear publishes a signed, tamper-evident decision ledger at
<a href="/ledger.jsonl"><code>/ledger.jsonl</code></a> and a provenance page for each issued label.
This is deliberate: it is what lets anyone verify that a label came from the law snapshot it claims,
and that we have not quietly rewritten a decision.</p>
<p><strong>The ledger does not contain your email address, business name or city.</strong> Published
rows contain an order identifier, the state, the venue type, the canonical product, the verdict
status, content hashes, and rulepack and snapshot versions.</p>
<p><strong>One exception you should know about.</strong> Ledger rows include
<code>productInput</code> — the product description <em>exactly as you typed it</em>. If you type
"sourdough" that is all that is published. If you type your business name or your own name into the
product field, that text becomes public. <strong>Put only the product in the product field.</strong>
If something identifying has already been published, email us and we will tell you precisely what a
correction can and cannot do — see section 6.</p>

<h2>4. Why we are allowed to hold it</h2>
<p>We process order details to perform the contract you entered when you paid. We process your email
on the same basis. We publish the ledger on the basis of our legitimate interest in a verifiable,
auditable compliance record, which is a core function of the product and is disclosed here before
purchase.</p>

<h2>5. Who it is shared with</h2>
<p>Stripe, for payment processing. Google, when a model call is made to resolve an unrecognized
product description or classify a law change — the text sent is the product description and rule
text, never your email address or payment data. Our hosting provider, Google Cloud, as a processor.
We do not sell your data, and we do not use it for advertising.</p>

<h2>6. Retention and deletion</h2>
<p>Order records are retained while your label may still need re-issuing, and thereafter as required
for tax and accounting purposes. You may ask us to delete your email address and order details at
any time by writing to
<a href="mailto:${esc(cfg.supportEmail)}">${esc(cfg.supportEmail)}</a>.</p>
<p><strong>An honest limit:</strong> the ledger is a hash-chained append-only structure. Deleting a
row would break the chain and destroy the verifiability that every other customer's label depends
on. We therefore cannot delete ledger rows. We can delete your email address and order record, which
are stored separately and are not published. This is why section 3 asks you to keep identifying text
out of the product field.</p>

<h2>7. Your rights</h2>
<p>Depending on where you live you may have rights to access, correct, export, restrict or object to
our processing of your personal data, and to complain to a data protection authority. Exercise any
of them by emailing <a href="mailto:${esc(cfg.supportEmail)}">${esc(cfg.supportEmail)}</a>. We will
respond within 30 days.</p>

<h2>8. Cookies</h2>
<p>OvenClear sets no advertising or analytics cookies and embeds no third-party trackers. Stripe may
set cookies necessary for fraud prevention on its own checkout pages.</p>

<h2>9. Children</h2>
<p>The service is not directed to anyone under 18 and we do not knowingly collect their data.</p>

<h2>10. Contact</h2>
<p>Controller: <strong>[LIVE-FILL: legal entity name and registered address]</strong>.
Email <a href="mailto:${esc(cfg.supportEmail)}">${esc(cfg.supportEmail)}</a>.</p>`,
  });
}

// ── refunds ─────────────────────────────────────────────────────────────────

export function refundsPage(cfg: Config): string {
  return legalShell({
    title: 'Refund Policy',
    heading: 'Refunds and cancellations',
    description: 'When OvenClear refunds you, including the cases it refunds automatically.',
    body: `
<h2>Automatic refunds — you do not have to ask</h2>
<p>Two cases are handled by the system itself, without you contacting anyone:</p>
<ul class="clean">
  <li><strong>The rules do not permit your product at your venue.</strong> We do not issue a label
    we believe would be wrong. You are refunded in full, and you keep the cited explanation of why —
    which is usually the thing you actually needed to know.</li>
  <li><strong>The label fails our own quality gate.</strong> Every label is checked to confirm each
    state-mandated sentence appears byte-for-byte before release. If that check fails, nothing ships
    and you are refunded in full.</li>
</ul>
<p>Refunds are issued to the original payment method through Stripe and typically appear within
5–10 business days, depending on your bank.</p>

<h2>If something else went wrong</h2>
<p>Email <a href="mailto:${esc(cfg.supportEmail)}">${esc(cfg.supportEmail)}</a> within 30 days of
purchase, with your order link. If the service gave you a verdict for the wrong state, the wrong
venue, or a label missing required text, you get a full refund. If you simply changed your mind
before we generated anything, you get a full refund.</p>

<h2>Where we may decline</h2>
<p>We may decline a refund where a correct, cited verdict and a QA-passing label were delivered and
you have used them, or where the verdict was computed from inputs you supplied incorrectly — though
in the latter case we would rather re-run it for you at no charge. Ask; we would prefer you had a
correct label than a refund.</p>

<h2>Law-Watch subscriptions</h2>
<p>Cancel at any time and you will not be billed again. The current period is not pro-rated, and
labels already issued to you remain valid and keep their provenance pages.</p>

<h2>Contact</h2>
<p><a href="mailto:${esc(cfg.supportEmail)}">${esc(cfg.supportEmail)}</a> ·
Operator: <strong>[LIVE-FILL: legal entity name]</strong>.</p>`,
  });
}
