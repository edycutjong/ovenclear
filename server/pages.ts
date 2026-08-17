import { VENUE_CODES, type Verdict } from '../src/core/rulekit/types';
import type { LabelArtifact } from '../src/core/label/compose';
import type { LabelRegistryEntry } from '../src/core/label/registry';
import type { Config } from './config';
import type { Order, OrderIntake } from './store';
import type { Quote } from './fulfill';
import { esc, layout } from './html';

const VENUE_LABELS: Record<string, string> = {
  farmers_market: 'Farmers market',
  home_pickup: 'Pickup from my home',
  online_instate_shipping: 'Online, shipped inside my state',
  mail_order_interstate: 'Mail order, across state lines',
  wholesale: 'Wholesale to a shop',
  event_festival: 'Events and festivals',
};

const FIXTURE_NOTE = `<div class="fixture">
<strong>Read this before you rely on anything here.</strong> Every rule, quote and citation in this
service is <strong>FIXTURE data</strong>: synthetic, statute-<em>shaped</em> text modeled on real
cottage-food programs. It is not verbatim law and OvenClear is not a law firm. What is real is the
machinery — the verdict engine, the byte-verbatim label gate, the signed ledger and the law-watch
re-issue loop all run exactly as shown. Coverage is <strong>two states deep (GA, TX)</strong> plus
two stubs (CA, FL), not fifty shallow.
</div>`;

function statusBadge(v: Verdict): string {
  if (v.status === 'eligible') return '<span class="badge ok">Eligible</span>';
  if (v.status === 'license_required') return '<span class="badge warn">License required</span>';
  return '<span class="badge bad">Not allowed</span>';
}

// ── landing ─────────────────────────────────────────────────────────────────

export function landing(cfg: Config): string {
  return layout({
    title: 'OvenClear — can I legally sell this? A cited answer and a compliant label, $' + cfg.priceUsd,
    description:
      'A statute-cited "can I sell this?" verdict for home bakers, plus a print-ready compliant ' +
      'label — and it re-issues itself when the law changes.',
    body: `
<section class="hero lp">
  <span class="eyebrow reveal">Cottage-food compliance · Georgia &amp; Texas, two states deep</span>
  <h1 class="reveal d1">A $250 lawyer question,<br>answered for <span class="grad">$${cfg.priceUsd}</span>
    <span class="quiet">— and kept true after the law moves.</span></h1>
  <p class="lede reveal d2">
    Every state writes its own cottage-food law: which foods you may sell, where you may sell them,
    and the <em>exact sentence</em> that has to appear on your label. Guess wrong and you lose your
    booth. OvenClear gives you a statute-cited verdict and a print-ready label — then re-issues that
    label when the rule underneath it changes.
  </p>
  <div class="cta-row reveal d3">
    <a class="btn lg" href="/start">Check my product <span class="arr" aria-hidden="true">→</span></a>
    <a class="btn secondary" href="/how-it-works">See how it works</a>
  </div>
  <ul class="chip-rail reveal d3">
    <li class="chip"><span class="dot" aria-hidden="true"></span>Verdict in one form, no chat box</li>
    <li class="chip">Label QA gate — mandated sentence byte-verbatim</li>
    <li class="chip">Every decision on a signed public ledger</li>
  </ul>

  <div class="proofstrip reveal d3" aria-label="Figures reproducible from the repository">
    <span><b>156</b> tests green</span><span class="sep" aria-hidden="true">·</span>
    <span><b>0&nbsp;/&nbsp;28</b> golden verdict flips</span><span class="sep" aria-hidden="true">·</span>
    <span><b>4</b> signed genesis ledger rows</span>
    <a class="go" href="/verify/">verify the ledger yourself →</a>
  </div>
</section>

<h2>The yes and the no, priced the same</h2>
<div class="split">
  <div class="card yes">
    <div class="toprow"><span class="badge ok">Eligible</span><h2>Sourdough at a farmers market</h2></div>
    <p style="color:var(--muted);margin:0 0 12px">
      Allowed in Georgia, so you get the whole package: the status, the conditions, the pinned rule
      text each one came from, your licensing checklist with real fee amounts, and a print-ready
      label whose mandated sentence is copied byte-for-byte from the source — allergens derived from
      your ingredients, net weight, and a QR that resolves to a public provenance page.
    </p>
    <p style="margin:0"><a href="/start">Run this one →</a></p>
  </div>
  <div class="card no">
    <div class="toprow"><span class="badge bad">Not allowed</span><h2>Cheesecake, same market</h2></div>
    <p style="color:var(--muted);margin:0 0 12px">
      Cheesecake is not shelf-stable, and no amount of wanting changes that. OvenClear tells you
      <em>before</em> you pay, quotes the refrigeration rule that decides it, and never shows you a
      pay button. A compliance tool that only ever says yes is not a compliance tool — it is a
      sales funnel with a certificate stapled to it.
    </p>
    <p style="margin:0"><a href="/start">Try something that fails →</a></p>
  </div>
</div>

<h2>What the $${cfg.priceUsd} actually buys</h2>
<div class="steprail">
  <div class="step">
    <h3>A verdict with the rule quoted back at you</h3>
    <p>Not "probably fine" — the status, the conditions, and the pinned snapshot text behind each
    one. Every verdict pins at least one snapshot hash; that is an enforced invariant, not a habit.</p>
  </div>
  <div class="step">
    <h3>A label that passes its own QA gate</h3>
    <p>The label is composed, never generated. A gate re-reads the finished artifact and checks each
    mandated sentence is present verbatim. If it is not, the label does not ship — and if you already
    paid, you are refunded.</p>
  </div>
  <div class="step">
    <h3>Your licensing checklist, with real fee amounts</h3>
    <p>What to file, in what order, and what each step costs — so the verdict turns into a booth
    rather than another open tab.</p>
  </div>
  <div class="step">
    <h3>Law-Watch, $5/mo — the part nobody else does</h3>
    <p>Snapshots are re-fetched and diffed. When the rule your label depends on materially changes,
    your label is re-issued automatically and chained to the previous version. You do not have to be
    watching. Selling a compliance answer that silently rots is the actual harm.</p>
  </div>
</div>

<div class="ribbon">
  <span class="k">Read first</span>
  <p><strong>Every rule, quote and citation in this service is FIXTURE data</strong> — synthetic,
  statute-<em>shaped</em> text modeled on real cottage-food programs. It is not verbatim law and
  OvenClear is not a law firm. What is real is the machinery: the verdict engine, the byte-verbatim
  label gate, the signed ledger and the law-watch re-issue loop all run exactly as shown. Coverage is
  <strong>two states deep (GA, TX)</strong> plus two stubs (CA, FL) — not fifty shallow. A compliance
  product that overstates its coverage is worse than useless.</p>
</div>
`,
  });
}

export function howItWorks(cfg: Config, geminiLive: boolean): string {
  return layout({
    title: 'How OvenClear works',
    body: `
<section class="hero lp">
  <span class="eyebrow reveal">The machinery</span>
  <h1 class="reveal d1">Four agents, one signed ledger,<br><span class="quiet">and a gate that refuses to ship a wrong label.</span></h1>
  <p class="lede reveal d2">Nothing here is a language model deciding whether you may sell food. The
  model is allowed to widen recall on what you typed, and nothing else.</p>
</section>

<div class="steprail">
  <div class="step">
    <h3>Intake</h3>
    <p>Six structured questions — no chat box. Your free-text product ("my tangy no-knead boule") is
    matched against a deterministic catalog first. Only if the catalog misses does a Gemini
    ${esc(geminiLive ? 'Flash' : 'Flash (offline in this instance)')} pass get a turn, and all it may
    do is name a term that is <em>already in the catalog</em>. The model can widen recall. It cannot
    invent a product, move it between categories, or turn a refusal into a sale.</p>
  </div>
  <div class="step">
    <h3>Verdict</h3>
    <p>The rule engine resolves your product, venue and state against a hash-pinned snapshot of the
    rule text. Every verdict pins at least one snapshot hash — that is an enforced invariant, not a
    convention. Unknown category? It refuses rather than guesses.</p>
  </div>
  <div class="step">
    <h3>Label + QA gate</h3>
    <p>The label is <em>composed</em>, never generated: mandated sentences are copied byte-for-byte
    from the pinned source. Then a QA gate re-reads the finished artifact and checks each mandated
    sentence is present verbatim. If it is not, the label does not ship — even if you already paid,
    in which case you are refunded.</p>
  </div>
  <div class="step">
    <h3>Law-Watch</h3>
    <p>Snapshots are re-fetched and diffed. Gemini classifies each delta as material, immaterial or
    cosmetic with a scope; unclassifiable deltas default to <em>material</em>, the conservative
    direction. A material label-text change fans out to every affected label-holder and re-issues
    their labels automatically, chained to the previous version.</p>
  </div>
</div>

<div class="card">
  <h2 style="margin-top:0">Everything above lands on a signed ledger</h2>
  <p style="margin:0 0 14px;color:var(--muted)">Each decision is appended to a hash-chained,
  per-agent Ed25519-signed log. You can download it and verify every signature and the whole chain
  yourself — including catching a tampered row and the exact sequence number it happened at.</p>
  <a class="btn" href="/verify/">Open the ledger <span class="arr" aria-hidden="true">→</span></a>
</div>

${FIXTURE_NOTE}
`,
  });
}

// ── intake form ─────────────────────────────────────────────────────────────

export interface FormState extends Partial<OrderIntake> {}

export function startForm(
  cfg: Config,
  prefill: FormState = {},
  error?: { message: string; field: string; suggestions: string[] },
): string {
  const v = (k: keyof OrderIntake): string => {
    const raw = prefill[k];
    if (Array.isArray(raw)) return raw.join(', ');
    return raw ? String(raw) : '';
  };
  const venueOpts = VENUE_CODES.map(
    (c) =>
      `<option value="${c}"${prefill.venue === c ? ' selected' : ''}>${esc(VENUE_LABELS[c] ?? c)}</option>`,
  ).join('');

  const errBox = error
    ? `<div class="notice bad"><strong>${esc(error.field)}:</strong> ${esc(error.message)}
       ${error.suggestions.length ? `<br>Closest matches: ${error.suggestions.map((s) => `<code>${esc(s)}</code>`).join(', ')}` : ''}
       </div>`
    : '';

  return layout({
    title: 'Check my product — OvenClear',
    body: `
<section class="hero" style="padding-bottom:8px">
  <h1>Can you sell it?</h1>
  <p class="lede">Six questions. The verdict is free — you only pay if you want the cited version
  and the print-ready label.</p>
</section>
${errBox}
<form class="card" method="POST" action="/quote">
  <div class="grid two">
    <div class="field">
      <label for="state">Your state</label>
      <select id="state" name="state" required>
        <option value="GA"${v('state') === 'GA' ? ' selected' : ''}>Georgia (deep coverage)</option>
        <option value="TX"${v('state') === 'TX' ? ' selected' : ''}>Texas (deep coverage)</option>
        <option value="CA"${v('state') === 'CA' ? ' selected' : ''}>California (outline only)</option>
        <option value="FL"${v('state') === 'FL' ? ' selected' : ''}>Florida (outline only)</option>
      </select>
      <p class="hint">Two states are covered deeply. We would rather cover four honestly than fifty badly.</p>
    </div>
    <div class="field">
      <label for="venue">Where will you sell it?</label>
      <select id="venue" name="venue" required>${venueOpts}</select>
    </div>
  </div>

  <div class="field">
    <label for="productDescription">What are you making?</label>
    <input id="productDescription" name="productDescription" required
      value="${esc(v('productDescription'))}" placeholder="sourdough bread">
    <p class="hint">Plain words are fine — "my tangy no-knead boule" resolves to sourdough bread.</p>
  </div>

  <div class="grid two">
    <div class="field">
      <label for="businessName">Business name</label>
      <input id="businessName" name="businessName" required value="${esc(v('businessName'))}"
        placeholder="Rosa's Bakes">
      <p class="hint">This goes on the label exactly as you type it.</p>
    </div>
    <div class="field">
      <label for="city">City, State</label>
      <input id="city" name="city" required value="${esc(v('city'))}" placeholder="Marietta, GA">
    </div>
  </div>

  <div class="field">
    <label for="ingredients">Ingredients, most first</label>
    <input id="ingredients" name="ingredients" required value="${esc(v('ingredients'))}"
      placeholder="wheat flour, water, sea salt">
    <p class="hint">Comma separated. Allergens are derived from this — get the order right.</p>
  </div>

  <div class="grid two">
    <div class="field">
      <label for="netWeight">Net weight <span style="font-weight:400;color:var(--muted)">(optional)</span></label>
      <input id="netWeight" name="netWeight" value="${esc(v('netWeight'))}" placeholder="1 lb (454 g)">
    </div>
    <div class="field">
      <label for="contactEmail">Your email</label>
      <input id="contactEmail" name="contactEmail" type="email" required value="${esc(v('contactEmail'))}"
        placeholder="you@example.com">
      <p class="hint">Where the label goes, and where Law-Watch reaches you.</p>
    </div>
  </div>

  <button class="btn" type="submit">Get my free verdict →</button>
</form>
${FIXTURE_NOTE}
`,
  });
}

// ── quote (free preview) ────────────────────────────────────────────────────

function hiddenIntake(intake: OrderIntake): string {
  const f = (name: string, value: string): string =>
    `<input type="hidden" name="${name}" value="${esc(value)}">`;
  return [
    f('state', intake.state),
    f('productDescription', intake.productDescription),
    f('venue', intake.venue),
    f('businessName', intake.businessName),
    f('city', intake.city),
    f('ingredients', intake.ingredients.join(', ')),
    f('contactEmail', intake.contactEmail),
    f('netWeight', intake.netWeight ?? ''),
  ].join('');
}

export function quotePage(cfg: Config, q: Quote, intake: OrderIntake, stripeReady: boolean): string {
  const v = q.verdict;
  const reasons = v.reasons.map((r) => `<li><strong>${esc(r.kind)}</strong> — ${esc(r.message)}</li>`).join('');
  const geminiNote = q.resolved.viaGemini
    ? `<p class="hint">The catalog did not recognise "${esc(intake.productDescription)}", so
       ${esc(q.resolved.geminiModel ?? 'Gemini')} mapped it to <code>${esc(q.resolved.canonical)}</code>
       — then the deterministic catalog re-checked that term before any rule ran.</p>`
    : '';

  if (!q.sellable) {
    const cites = v.citations
      .map(
        (c) => `<div class="cite"><q>${esc(c.quote)}</q><br>
          <span class="mono">${esc(c.id)} · ${esc(c.section)}</span></div>`,
      )
      .join('');
    return layout({
      title: `Not allowed: ${v.product.canonical} in ${v.state} — OvenClear`,
      body: `
<section class="hero" style="padding-bottom:8px">
  <h1>${statusBadge(v)}<br>We are not going to sell you a label for this.</h1>
  <p class="lede">${esc(v.state)} does not allow <strong>${esc(v.product.canonical)}</strong> to be
  sold ${esc((VENUE_LABELS[v.venue] ?? v.venue).toLowerCase())} under its cottage-food program.
  Charging you $${cfg.priceUsd} for a label you cannot legally use would be the product failing.</p>
</section>
${geminiNote}
<div class="card">
  <h3 style="margin-top:0">Why — the rule that decides it</h3>
  ${cites}
  <ul class="clean">${reasons}</ul>
</div>
<div class="card">
  <h3 style="margin-top:0">What you can do instead</h3>
  <p style="margin:0 0 12px">Most refusals are about the food category, not about you. A
  shelf-stable version of the same idea usually is allowed — and you can check it free, right now.</p>
  <a class="btn" href="/start">Check a different product →</a>
</div>
${FIXTURE_NOTE}`,
    });
  }

  const checkoutBlock = stripeReady
    ? `<form method="POST" action="/checkout">${hiddenIntake(intake)}
       <button class="btn" type="submit">Get the cited verdict + label — $${cfg.priceUsd} →</button>
       <p class="hint" style="margin-top:10px">Secure checkout by Stripe. One payment, no subscription.
       If the QA gate refuses your label for any reason, you are refunded automatically.</p></form>`
    : `<div class="notice"><strong>Checkout is not configured on this instance.</strong>
       The verdict engine above is fully live; payments are switched on by setting
       <code>STRIPE_SECRET_KEY</code>.</div>`;

  return layout({
    title: `${v.status} — ${v.product.canonical} in ${v.state} — OvenClear`,
    body: `
<section class="hero" style="padding-bottom:8px">
  <h1>${statusBadge(v)}<br>${esc(v.product.canonical)} in ${esc(v.state)}</h1>
  <p class="lede">Selling ${esc((VENUE_LABELS[v.venue] ?? v.venue).toLowerCase())}${
    v.status === 'license_required' ? ' — allowed, but you need a license first.' : ' — allowed.'
  }</p>
</section>
${geminiNote}

<div class="card">
  <h3 style="margin-top:0">What the engine found</h3>
  <ul class="clean">${reasons}</ul>
  ${
    v.conditions.length
      ? `<h3>Conditions attached</h3><ul class="clean">${v.conditions
          .map((c) => `<li>${esc(c)}</li>`)
          .join('')}</ul>`
      : ''
  }
  <p class="hint" style="margin-top:16px">
    Verdict hash <span class="mono hash">${esc(v.verdictHash.slice(0, 24))}…</span> ·
    pinned to ${v.snapshotHashes.length} law snapshot${v.snapshotHashes.length === 1 ? '' : 's'} ·
    pack ${esc(v.state)}@${esc(v.packVersion)}
  </p>
</div>

<div class="card">
  <h3 style="margin-top:0">Unlocked when you buy</h3>
  <ul class="clean">
    <li>The <strong>${v.citations.length} statute citations</strong> behind this verdict, each quoted
      verbatim from its pinned snapshot</li>
    <li>Your <strong>print-ready label</strong>, byte-verbatim mandated sentence, allergens derived,
      QA-gated</li>
    <li>A <strong>${v.checklist.length}-step licensing checklist</strong> with real fee amounts</li>
    <li>A <strong>public provenance page</strong> your customers can scan</li>
    <li><strong>Law-Watch</strong> — automatic re-issue when the rule changes</li>
  </ul>
  <div style="margin-top:18px">${checkoutBlock}</div>
</div>
${FIXTURE_NOTE}`,
  });
}

// ── delivered order ─────────────────────────────────────────────────────────

export function orderPage(cfg: Config, order: Order): string {
  if (order.status === 'refused') {
    return layout({
      title: 'Refunded — OvenClear',
      body: `
<section class="hero"><h1>We refused this one, and you are being refunded.</h1>
<p class="lede">${esc(order.failureReason ?? 'The verdict came back prohibited.')}</p></section>
<div class="card"><p style="margin:0">Your payment of <strong>$${order.amountUsd}</strong> is being
returned. Nothing was issued, because issuing it would have been wrong. If the refund has not
appeared within five business days, email
<a href="mailto:${esc(cfg.supportEmail)}">${esc(cfg.supportEmail)}</a>.</p></div>`,
    });
  }

  if (order.status !== 'fulfilled' || !order.label || !order.verdict) {
    return layout({
      title: 'Working on it — OvenClear',
      body: `
<section class="hero"><h1>Payment received. Issuing your label…</h1>
<p class="lede">This page refreshes itself. It normally takes a second or two.</p></section>
${
  order.failureReason
    ? `<div class="notice bad"><strong>Something went wrong:</strong> ${esc(order.failureReason)}<br>
       You have not been left with nothing — email <a href="mailto:${esc(cfg.supportEmail)}">${esc(cfg.supportEmail)}</a>
       and we will refund you.</div>`
    : ''
}`,
      script: order.failureReason ? '' : 'setTimeout(function(){location.reload()},2500)',
    });
  }

  const v = order.verdict;
  const label = order.label;
  const cites = v.citations
    .map(
      (c) => `<div class="cite"><q>${esc(c.quote)}</q><br>
        <span class="mono">${esc(c.id)} · ${esc(c.section)} · snapshot ${esc(c.snapshotHash.slice(0, 12))}…</span></div>`,
    )
    .join('');
  const checklist = v.checklist
    .map(
      (s) =>
        `<tr><td class="num">${s.step}</td><td>${esc(s.text)}</td>
         <td class="num">${s.feeUsd !== undefined ? '$' + s.feeUsd : '—'}</td></tr>`,
    )
    .join('');
  const fees = v.fees.items
    .map(
      (f) =>
        `<tr><td>${esc(f.label)}${f.estimate ? ' <span class="hint" style="display:inline">(estimate)</span>' : ''}</td>
         <td class="num">$${f.amountUsd}</td></tr>`,
    )
    .join('');

  return layout({
    title: `Your label — ${esc(label.fields.productName)} — OvenClear`,
    body: `
<section class="hero" style="padding-bottom:8px">
  <h1>${statusBadge(v)}<br>Your label is ready.</h1>
  <p class="lede">Print it as-is. The mandated sentence is reproduced byte-for-byte and the QA gate
  has verified it.</p>
</section>

<div class="card">
  <h3 style="margin-top:0">Your label</h3>
  <pre class="label">${esc(label.text)}</pre>
  <p style="margin:16px 0 0">
    <a class="btn secondary" href="/order/${esc(order.token)}/label.txt">Download .txt</a>
    &nbsp;<a class="btn secondary" href="/l/${esc(label.qrId)}">Public provenance page</a>
  </p>
  <p class="hint" style="margin-top:14px">
    Label <span class="mono">${esc(label.labelId)}</span> ·
    sha256 <span class="mono hash">${esc(label.sha256.slice(0, 24))}…</span> ·
    QA passed on ${label.mandatedSentenceIds.length} mandated sentence${label.mandatedSentenceIds.length === 1 ? '' : 's'}
  </p>
</div>

<div class="card">
  <h3 style="margin-top:0">The rules this rests on</h3>
  ${cites}
</div>

${
  v.checklist.length
    ? `<div class="card"><h3 style="margin-top:0">Your licensing checklist</h3>
       <div class="scroll"><table><thead><tr><th>#</th><th>Step</th><th style="text-align:right">Fee</th></tr></thead>
       <tbody>${checklist}</tbody></table></div></div>`
    : ''
}

${
  v.fees.items.length
    ? `<div class="card"><h3 style="margin-top:0">What it will cost you</h3>
       <div class="scroll"><table><tbody>${fees}</tbody></table></div>
       ${
         v.annualRevenueCapUsd
           ? `<p class="hint" style="margin-top:12px">Annual revenue cap for this program:
              <strong>$${v.annualRevenueCapUsd.toLocaleString('en-US')}</strong>.</p>`
           : ''
       }</div>`
    : ''
}

<div class="card">
  <h3 style="margin-top:0">Law-Watch is on</h3>
  <p style="margin:0">We are watching the snapshots this label depends on. If a material change
  lands, the label is re-issued automatically, chained to this version, and sent to
  <strong>${esc(order.intake.contactEmail)}</strong>. Every re-issue appears on your
  <a href="/l/${esc(label.qrId)}">provenance page</a> and on the
  <a href="/verify/">public ledger</a>.</p>
</div>
${FIXTURE_NOTE}`,
  });
}

// ── public QR provenance ────────────────────────────────────────────────────

export function provenancePage(entry: LabelRegistryEntry, current: LabelArtifact | null): string {
  const history = entry.issueHistory
    .map(
      (h, i) => `<tr>
        <td class="num">${i + 1}</td>
        <td class="mono">${esc(h.labelId)}</td>
        <td>${esc(h.issuedAt.slice(0, 10))}</td>
        <td>${esc(h.packVersion)}</td>
        <td>${h.reissueReason ? esc(h.reissueReason) : '<span style="color:var(--muted)">first issue</span>'}</td>
      </tr>`,
    )
    .join('');

  return layout({
    title: `Label provenance ${entry.qrId} — OvenClear`,
    body: `
<section class="hero" style="padding-bottom:8px">
  <h1>Label provenance</h1>
  <p class="lede">This page is what the QR code on the label resolves to. It is public on purpose —
  anyone holding the product can check the label is current.</p>
</section>

<div class="card">
  <table>
    <tr><th>Label ID</th><td class="mono">${esc(entry.qrId)}</td></tr>
    <tr><th>State</th><td>${esc(entry.state)}</td></tr>
    <tr><th>Issues</th><td>${entry.issueHistory.length}</td></tr>
    ${
      current
        ? `<tr><th>Current pack</th><td>${esc(current.state)}@${esc(current.packVersion)}</td></tr>
           <tr><th>Current sha256</th><td class="mono hash">${esc(current.sha256)}</td></tr>`
        : ''
    }
  </table>
</div>

${
  current
    ? `<div class="card"><h3 style="margin-top:0">Current label text</h3>
       <pre class="label">${esc(current.text)}</pre></div>`
    : ''
}

<div class="card">
  <h3 style="margin-top:0">Issue history</h3>
  <div class="scroll"><table>
    <thead><tr><th>#</th><th>Label ID</th><th>Issued</th><th>Pack</th><th>Reason</th></tr></thead>
    <tbody>${history}</tbody>
  </table></div>
  <p class="hint" style="margin-top:12px">Every row here is also a signed entry on the
  <a href="/verify/">public decision ledger</a>.</p>
</div>
${FIXTURE_NOTE}`,
  });
}

// ── errors ──────────────────────────────────────────────────────────────────

export function errorPage(code: number, title: string, detail: string): string {
  return layout({
    title: `${code} — OvenClear`,
    body: `<section class="hero"><h1>${esc(title)}</h1>
      <p class="lede">${esc(detail)}</p>
      <a class="btn" href="/">Back to the start</a></section>`,
  });
}
