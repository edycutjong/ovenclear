---
name: Wrong verdict
about: The engine allowed something it should refuse, or refused something it should allow
title: "[Verdict] "
labels: verdict, bug
---

**The case**
| Field | Value |
|---|---|
| State | |
| Product | |
| Venue | |

**Command**
```bash
npx tsx src/cli.ts check --state XX --product yyy --venue zzz
```

**Verdict returned**
<!-- paste the full verdict, including its citations -->

**Verdict expected**
- [ ] Allowed
- [ ] Refused

**Why**
Which fixture rule (and which pinned snapshot) supports the expected answer?

> Reminder: all rule data in this repo is **FIXTURE / synthetic** — statute-*shaped*
> data modeled on real cottage-food programs, never verbatim law, and never legal
> advice. A mismatch with the real law of your state is expected and is not a bug
> unless the fixture itself is inconsistent.
