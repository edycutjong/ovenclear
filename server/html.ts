/** HTML plumbing: escaping, the shared shell, and the one stylesheet. */

export function esc(s: unknown): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const CSS = `
:root{
  --bg:#FDFAF6; --ink:#231A15; --muted:#6B5D53; --line:#E7DDD1;
  --crust:#C2552B; --crust-dark:#9E4321; --wheat:#F5B841;
  --ok:#1F7A4D; --ok-bg:#E8F5EE; --warn:#8A6100; --warn-bg:#FDF3DC;
  --bad:#A32C22; --bad-bg:#FBEDEB; --card:#FFFFFF;
  --radius:14px; --shadow:0 1px 2px rgba(35,26,21,.05),0 8px 24px rgba(35,26,21,.06);
}
@media (prefers-color-scheme:dark){
  :root{
    --bg:#17120F; --ink:#F2EAE2; --muted:#A8988A; --line:#332721;
    --crust:#E8794A; --crust-dark:#F0946C; --card:#1F1814;
    --ok:#6ED49B; --ok-bg:#132A1F; --warn:#E5B45A; --warn-bg:#2B2213;
    --bad:#F08A7E; --bad-bg:#2C1815;
    --shadow:0 1px 2px rgba(0,0,0,.3),0 8px 24px rgba(0,0,0,.25);
  }
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
  font:16px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  -webkit-font-smoothing:antialiased}
.wrap{max-width:820px;margin:0 auto;padding:0 20px}
a{color:var(--crust)}
header.site{border-bottom:1px solid var(--line);background:var(--card)}
header.site .wrap{display:flex;align-items:center;gap:12px;height:62px}
.brand{font-weight:700;font-size:19px;letter-spacing:-.02em;text-decoration:none;color:var(--ink)}
.brand span{color:var(--crust)}
.spacer{flex:1}
.navlink{font-size:14px;color:var(--muted);text-decoration:none}
.navlink:hover{color:var(--crust)}

.hero{padding:52px 0 28px}
h1{font-size:clamp(28px,5vw,42px);line-height:1.12;letter-spacing:-.03em;margin:0 0 14px}
h2{font-size:22px;letter-spacing:-.02em;margin:34px 0 12px}
h3{font-size:16px;margin:22px 0 8px}
.lede{font-size:19px;color:var(--muted);margin:0 0 26px;max-width:62ch}
.price{font-variant-numeric:tabular-nums;font-weight:700;color:var(--crust)}

.btn{display:inline-block;background:var(--crust);color:#fff;border:0;text-decoration:none;
  padding:13px 22px;border-radius:10px;font-size:16px;font-weight:600;cursor:pointer;
  transition:background .15s ease,transform .1s ease}
.btn:hover{background:var(--crust-dark)}
.btn:active{transform:translateY(1px)}
.btn:disabled{opacity:.5;cursor:not-allowed}
.btn.secondary{background:transparent;color:var(--crust);border:1px solid var(--line)}
/* Declared after .btn.secondary on purpose: .btn.secondary and .btn:hover have equal
   specificity, so the later rule wins and a plain .btn:hover would never repaint a
   secondary button. This restores hover feedback on the label-delivery buttons. */
.btn.secondary:hover{background:var(--warn-bg);border-color:var(--crust);color:var(--crust-dark)}
.brand:hover{color:var(--crust)}
/* Body links are underlined by default, so underline-on-hover is a no-op —
   the feedback has to be a colour shift. */
a{transition:color .15s ease}
a:hover{color:var(--crust-dark);text-decoration:underline}
a:focus-visible,.btn:focus-visible,.navlink:focus-visible,.brand:focus-visible{
  outline:2px solid var(--crust);outline-offset:2px;border-radius:4px}
@media (prefers-reduced-motion:reduce){
  *{transition-duration:.01ms !important;animation-duration:.01ms !important}
  .btn:active{transform:none}
}

.card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);
  padding:22px;box-shadow:var(--shadow);margin:18px 0}
.grid{display:grid;gap:14px}
@media(min-width:640px){.grid.two{grid-template-columns:1fr 1fr}}

label{display:block;font-size:14px;font-weight:600;margin:0 0 5px}
.hint{font-size:13px;color:var(--muted);font-weight:400;margin:4px 0 0}
input,select,textarea{width:100%;padding:11px 12px;border:1px solid var(--line);border-radius:9px;
  background:var(--bg);color:var(--ink);font:inherit;font-size:15px}
input:focus,select:focus,textarea:focus{outline:2px solid var(--crust);outline-offset:1px;border-color:transparent}
.field{margin:0 0 16px}

.badge{display:inline-block;font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;
  padding:4px 10px;border-radius:999px}
.badge.ok{background:var(--ok-bg);color:var(--ok)}
.badge.warn{background:var(--warn-bg);color:var(--warn)}
.badge.bad{background:var(--bad-bg);color:var(--bad)}

.notice{border-left:3px solid var(--wheat);background:var(--warn-bg);color:var(--warn);
  padding:12px 16px;border-radius:0 9px 9px 0;font-size:14px;margin:16px 0}
.notice.bad{border-color:var(--bad);background:var(--bad-bg);color:var(--bad)}
.notice strong{font-weight:700}

pre.label{background:var(--bg);border:1px dashed var(--line);border-radius:9px;padding:18px;
  font:14px/1.65 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap;overflow-x:auto;margin:0}
code,.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px}
.hash{color:var(--muted);word-break:break-all}

.prose h2{font-size:17px;margin:26px 0 8px}
.prose h2:first-child{margin-top:0}
.prose p{margin:0 0 12px;line-height:1.62}
.prose ul.clean{margin-bottom:14px}
.prose code{background:var(--line);padding:1px 5px;border-radius:4px;font-size:13px}

ul.clean{list-style:none;padding:0;margin:0}
ul.clean li{padding:9px 0;border-bottom:1px solid var(--line)}
ul.clean li:last-child{border-bottom:0}
.cite{border-left:2px solid var(--line);padding:2px 0 2px 14px;margin:12px 0;color:var(--muted);font-size:14.5px}
.cite q{color:var(--ink);font-style:italic}

table{width:100%;border-collapse:collapse;font-size:14.5px}
th,td{text-align:left;padding:9px 10px;border-bottom:1px solid var(--line)}
th{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}
td.num{text-align:right;font-variant-numeric:tabular-nums}
.scroll{overflow-x:auto}

footer.site{margin-top:56px;border-top:1px solid var(--line);background:var(--card);
  padding:26px 0;font-size:13.5px;color:var(--muted)}
footer.site a{color:var(--muted)}
.fixture{font-size:12.5px;color:var(--muted);background:var(--warn-bg);border:1px solid var(--line);
  border-radius:9px;padding:12px 14px;margin:20px 0}

/* ══════════════════════════════════════════════════════════════════════════
   FAMILY SYSTEM — the motifs shared with docs/index.html so the standalone
   landing page and the live product read as one design family.
   Everything below is ADDITIVE: no existing selector is redefined, so the
   form, quote, order, provenance and legal pages render exactly as before.
   ══════════════════════════════════════════════════════════════════════════ */
:root{
  --accent:#F5B841;
  --grad-hero:linear-gradient(135deg,var(--crust) 0%,var(--accent) 100%);
  --mesh:
    radial-gradient(ellipse 70% 60% at 8% -10%,rgba(194,85,43,.13),transparent 62%),
    radial-gradient(ellipse 50% 45% at 96% -6%,rgba(245,184,65,.14),transparent 60%);
}
@media (prefers-color-scheme:dark){
  :root{
    --mesh:
      radial-gradient(ellipse 70% 60% at 8% -10%,rgba(194,85,43,.30),transparent 62%),
      radial-gradient(ellipse 50% 45% at 96% -6%,rgba(245,184,65,.13),transparent 60%);
  }
}

/* Sticky masthead — the page scrolls under a frosted bar. */
header.site{position:sticky;top:0;z-index:20;
  background:color-mix(in srgb,var(--card) 82%,transparent);
  backdrop-filter:saturate(1.6) blur(10px);-webkit-backdrop-filter:saturate(1.6) blur(10px)}
@supports not (backdrop-filter:blur(4px)){header.site{background:var(--card)}}

/* Hero: mesh wash that bleeds past .wrap without creating a scrollbar. */
/* inset-inline of calc(50% - 50vw) reaches the viewport edges exactly; body's
   overflow-x:clip absorbs the scrollbar-width rounding so no page ever scrolls
   sideways because of the wash. */
body{overflow-x:clip}
.hero.lp{position:relative;padding:56px 0 34px}
.hero.lp::before{content:"";position:absolute;top:-62px;bottom:0;
  left:calc(50% - 50vw);right:calc(50% - 50vw);background:var(--mesh);
  pointer-events:none;z-index:-1}
.hero.lp>*{position:relative}

.eyebrow{display:block;font:600 12px/1 ui-monospace,SFMono-Regular,Menlo,monospace;
  letter-spacing:.14em;text-transform:uppercase;color:var(--crust);margin:0 0 16px}
h1 .grad{background:var(--grad-hero);-webkit-background-clip:text;background-clip:text;
  -webkit-text-fill-color:transparent;color:var(--crust)}
h1 .quiet{color:var(--muted);display:block;font-size:.72em;letter-spacing:-.02em;margin-top:6px}

.cta-row{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin:26px 0 0}
.btn .arr{display:inline-block;transition:transform .18s ease}
.btn:hover .arr{transform:translateX(3px)}
.btn.lg{padding:15px 26px;font-size:17px;box-shadow:0 8px 22px rgba(194,85,43,.24)}

/* Chip rail — small factual tags. Scrolls itself rather than the page. */
.chip-rail{display:flex;flex-wrap:wrap;gap:8px;margin:18px 0 0;padding:0;list-style:none}
.chip{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:var(--muted);
  background:var(--card);border:1px solid var(--line);border-radius:999px;padding:5px 12px;
  white-space:nowrap}
.chip b{color:var(--ink);font-variant-numeric:tabular-nums}
.chip .dot{width:6px;height:6px;border-radius:50%;background:var(--ok);flex:none}

/* Proof strip — only numbers a command reproduces. */
.proofstrip{display:flex;flex-wrap:wrap;align-items:baseline;gap:10px 18px;margin:28px 0 0;
  padding:16px 18px;border:1px solid var(--line);border-radius:var(--radius);background:var(--card);
  font-size:14px;color:var(--muted);box-shadow:var(--shadow)}
.proofstrip b{color:var(--ink);font-size:17px;font-variant-numeric:tabular-nums;letter-spacing:-.02em}
.proofstrip .sep{color:var(--line)}
.proofstrip .go{margin-left:auto;font-size:13px;font-weight:600;color:var(--crust);text-decoration:none}
.proofstrip .go:hover{text-decoration:underline}

/* Verdict split — the yes and the no, side by side. */
.split{display:grid;gap:14px;margin:18px 0}
@media(min-width:720px){.split{grid-template-columns:1fr 1fr}}
.split .card{margin:0;height:100%;display:flex;flex-direction:column}
.split .card p:last-child{margin-bottom:0}
.card.yes{border-top:3px solid var(--ok)}
.card.no{border-top:3px solid var(--bad)}
.card .toprow{display:flex;align-items:center;gap:10px;margin:0 0 12px}
.card .toprow h2{margin:0;font-size:19px}

/* Step rail — the four-agent machinery, numbered. */
.steprail{display:grid;gap:0;margin:18px 0;counter-reset:step}
.steprail .step{position:relative;padding:0 0 22px 46px;border-left:2px solid var(--line);
  margin-left:15px;counter-increment:step}
.steprail .step:last-child{border-left-color:transparent;padding-bottom:0}
.steprail .step::before{content:counter(step);position:absolute;left:-16px;top:-2px;
  width:30px;height:30px;border-radius:50%;background:var(--crust);color:#fff;
  display:grid;place-items:center;font:700 13px/1 ui-sans-serif,system-ui,sans-serif}
.steprail .step h3{margin:4px 0 6px;font-size:16px}
.steprail .step p{margin:0;color:var(--muted);font-size:14.5px;line-height:1.62}

/* Honesty ribbon — the disclosure, deliberately impossible to miss. */
.ribbon{display:grid;gap:10px;margin:28px 0;padding:18px 20px;border-radius:var(--radius);
  border:1px solid var(--line);border-left:3px solid var(--wheat);background:var(--warn-bg)}
@media(min-width:720px){.ribbon{grid-template-columns:auto 1fr;gap:20px;align-items:start}}
.ribbon .k{font:700 11px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.14em;
  text-transform:uppercase;color:var(--warn);white-space:nowrap;padding-top:3px}
.ribbon p{margin:0;font-size:14px;line-height:1.62;color:var(--ink)}

/* Entrance motion — opt-out honoured by the global reduced-motion guard. */
@media (prefers-reduced-motion:no-preference){
  .reveal{opacity:0;transform:translateY(10px);animation:rise .6s cubic-bezier(.22,.9,.3,1) forwards}
  .reveal.d1{animation-delay:.07s}.reveal.d2{animation-delay:.14s}.reveal.d3{animation-delay:.21s}
  @keyframes rise{to{opacity:1;transform:none}}
}
`;

export interface LayoutOpts {
  title: string;
  description?: string;
  body: string;
  /** Rendered before </body> — used for the one inline script the form needs. */
  script?: string;
}

export function layout(o: LayoutOpts): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(o.title)}</title>
${o.description ? `<meta name="description" content="${esc(o.description)}">` : ''}
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🥖</text></svg>">
<style>${CSS}</style>
</head>
<body>
<header class="site"><div class="wrap">
  <a class="brand" href="/">Oven<span>Clear</span></a>
  <div class="spacer"></div>
  <a class="navlink" href="/how-it-works">How it works</a>
  &nbsp;&nbsp;
  <a class="navlink" href="/verify/">Verify the ledger</a>
</div></header>
<main class="wrap">
${o.body}
</main>
<footer class="site"><div class="wrap">
  <p style="margin:0 0 8px">
    <strong>OvenClear</strong> — cottage-food compliance verdicts and print-ready labels,
    kept true as the law changes.
  </p>
  <p style="margin:0">
    All rule text in this service is <strong>FIXTURE / synthetic</strong> — statute-shaped data
    modeled on real cottage-food programs, never verbatim law. OvenClear is not a law firm and
    this is not legal advice. ·
    <a href="/verify/">Public decision ledger</a> ·
    <a href="/how-it-works">How it works</a>
  </p>
  <p style="margin:8px 0 0">
    <a href="/terms">Terms</a> ·
    <a href="/privacy">Privacy</a> ·
    <a href="/refunds">Refunds</a>
  </p>
</div></footer>
${o.script ? `<script>${o.script}</script>` : ''}
</body>
</html>`;
}
