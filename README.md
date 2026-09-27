<div align="center">

# 📋 job-apply-agent

**Which job you applied to, with which CV, and what came back.**

A local record of a job search. Zero runtime dependencies, no account, no telemetry: the list of who you applied to stays on your machine.

[![npm version](https://img.shields.io/npm/v/job-apply-agent.svg?logo=npm&color=0b7285)](https://www.npmjs.com/package/job-apply-agent)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node >=22.5](https://img.shields.io/badge/Node-%3E%3D22.5-339933.svg?logo=node.js&logoColor=white)](https://nodejs.org)
[![runtime deps](https://img.shields.io/badge/runtime%20deps-0-2EA043.svg)](#-how-it-works)
[![telemetry](https://img.shields.io/badge/telemetry-none-2EA043.svg)](#-privacy)

</div>

```
npx job-apply-agent add https://example.com/job/123 --company talabat --cv Resume.pdf
```

## ✨ Why this exists

Ten applications in, you cannot remember which version of your CV went to which company, or which of the written answers you spent an hour on was the one that got a reply. The postings expire and the tab closes.

This keeps the record. It is deliberately small and it runs locally.

## ✅ Requirements

Node 22.5 or newer. Node 22.x needs `--experimental-sqlite`; from 23.4 the built-in SQLite needs no flag.

## 📦 Install

```bash
npm i -g job-apply-agent
```

Or run it without installing:

```bash
npx job-apply-agent --help
```

## 🚀 Usage

```bash
job-apply-agent add <url> --company talabat --role "Sr. Engineering Manager" \
                         --cv Alok-Rajasukumaran-Resume.pdf --answers talabat-fit-1440

job-apply-agent list --open        # what is still in flight
job-apply-agent show 1             # one application and its full history
job-apply-agent stage 1 screening --note "recruiter call booked"
job-apply-agent followup --after 7 # what has gone quiet
```

```
  #3   applied    AllUp                  Head of Technology        2026-09-27
  #2   applied    Al-Futtaim Automotive  Head of AI Platforms      2026-09-27
  #1   screening  talabat                Sr. Engineering Manager   2026-09-27

  3 application(s), 3 still open
```

Stages: `applied`, `screening`, `interview`, `offer`, `rejected`, `withdrawn`.

## 🧠 How it works

One SQLite file, written by Node's own `node:sqlite`. That is the whole reason this package has no dependencies: the obvious alternative is a 1.5MB WebAssembly build of SQLite that exists to run in a browser, which this never does.

Two decisions worth knowing:

**A posting URL is unique.** Applying to the same job twice is a mistake worth catching, not a row worth having, and it happens: postings get reposted, or reach you again through a second board.

**`followup` counts from the last stage change, not from the application date.** Something that reached interview yesterday is not stale because you applied a month ago. Both halves are asserted in the tests.

## 🔒 Privacy

There is no telemetry in this package. Not opt-out telemetry, none. No account, no sync, no analytics, no network calls at all. The database lives at `~/.job-apply-agent/applications.db` and `JOB_APPLY_AGENT_DB` moves it.

That is a deliberate contrast with the alternatives, several of which ship your name and email to the maintainer's analytics by default. A tool that knows where you are applying while you still have a job should not phone home.

## 🗺️ Not built yet

Tracking is what exists today. Discovery, an answer library that tells you which of your written answers covers a new posting's requirements, and submission adapters are planned in that order.

**On submission, plainly.** Automated applying breaches the terms of the platforms it would target. LinkedIn's User Agreement §8.2 prohibits "bots or other unauthorized automated methods to access the Services", and GulfTalent and Naukri carry equivalent clauses. Measured restriction rates for LinkedIn automation run around 23% within 90 days.

So when it arrives it will be opt-in, off by default, and it will ship **no CAPTCHA solving, no proxy rotation and no fingerprint spoofing**. Those are a non-goal rather than an omission: they are what turns automation into evasion, and they are also what gets an account banned. The default will fill the form and hand it back to you to submit.

## 🙏 Prior art

[`job-application-agent`](https://www.npmjs.com/package/job-application-agent) by [vaibhavarora14](https://github.com/vaibhavarora14) covers similar ground and is worth a look. No code from it is used here.

## 🧰 Also by the author

| | | |
|---|---|---|
| 🛡️ [`eslint-plugin-typeorm-enterprise`](https://alokraj68.in/eslint-plugin-typeorm-enterprise) | [npm](https://www.npmjs.com/package/eslint-plugin-typeorm-enterprise) | blocks raw SQL in TypeORM before it reaches production |
| 📄 [`@alokraj68/ats-resume`](https://alokraj68.in/ats-resume) | [npm](https://www.npmjs.com/package/@alokraj68/ats-resume) | whether an applicant tracking system can read your CV, and how it matches a posting |
| ✍️ [`@alokraj68/plainspoken`](https://alokraj68.in/plainspoken) | [npm](https://www.npmjs.com/package/@alokraj68/plainspoken) | fails the build when writing reads as machine-written |
| 📱 [`@alokraj68/pagecheck`](https://alokraj68.in/pagecheck) | [npm](https://www.npmjs.com/package/@alokraj68/pagecheck) | overflow, tiny text, tap targets and WCAG AA on a built site |
| 🧰 [`@alokraj68/craftkit`](https://alokraj68.in/craftkit) | [npm](https://www.npmjs.com/package/@alokraj68/craftkit) | sets up Claude Code for the work you actually do |

More at [alokraj68.in/open-source](https://alokraj68.in/open-source).

## 📄 License

MIT © [Alok Rajasukumaran](https://alokraj68.in)
