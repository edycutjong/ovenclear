# Security Policy

## Supported Versions

| Version | Supported |
|---|---|
| latest (`main`) | ✅ |

## Reporting a Vulnerability

Please **do not** open a public issue for a security vulnerability. Instead:

- Email **edy.cu@live.com**, or
- Use GitHub's [private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
  (Security → Report a vulnerability).

You will get an acknowledgment within 48 hours and a resolution timeline after
triage. Please allow a reasonable window to patch before public disclosure.

## What We Consider In Scope

This project makes three security claims that are backed by executable checks,
not by prose. Breaking any of them is a valid report:

1. **Ledger integrity.** Decision rows are an Ed25519-signed hash chain. A mutated
   row must be *localized and rejected* — `npm run verify-ledger` demonstrates
   this by deliberately tampering with a row and showing the exact sequence number
   at which verification fails. A tamper that verifies clean is a vulnerability.
2. **Citation provenance.** Every citation quote in a verdict must be a verbatim
   substring of its pinned snapshot, enforced at rulepack registration. A path
   that emits a citation not present in its snapshot is a vulnerability.
3. **Offline determinism.** The decision core takes no network calls and no
   credentials. A code path in the core that reaches the network is a
   vulnerability, not a feature.

## Secrets Handling

- `.env` and `.env.*` are gitignored; only `.env.example` (placeholders) is committed.
- `LEDGER_KEY_NAMESPACE` derives the agent signing keys — anyone holding it can
  forge ledger rows. Treat it as the highest-value secret in the system. Rotating
  it invalidates every signature already published.
- `evidence-pack/` output contains customer PII and is gitignored; it is never
  committed and is shared only through a private channel.
- CI runs **gitleaks over the full git history** (`fetch-depth: 0`) plus TruffleHog
  on every push, and the repo has GitHub secret scanning with push protection
  enabled. CodeQL (`javascript-typescript`) runs on every push, every PR, and
  weekly.

## Out of Scope

- The synthetic/fixture rule data is not real law and is not legal advice.
  Inaccuracy in fixture content is a data issue, not a security issue.
- Denial of service against a locally-run CLI.
