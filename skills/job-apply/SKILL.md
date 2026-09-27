---
name: job-apply
description: Use when recording a job application, deciding what to send, chasing a silent employer, or reviewing a job search that is not producing interviews. Covers what to record, when to follow up, and when the problem is the channel rather than the CV.
---

# Running a job search you can actually review

The CLI keeps the record. This is the half it cannot keep: what to put in the record, and what to do when the record starts telling you something.

## Record it at the moment you apply, not later

Four fields decide whether the record is worth having:

- **The CV file you actually sent.** Not "my CV". The filename. Tailored variants diverge, and three weeks later the only way to prepare for the interview is knowing which one they read.
- **The written answers you used.** Application forms ask for 200 to 500 words on a specific question and those answers are expensive to write. Name them so they can be reused.
- **The posting URL**, because postings expire and the requirements are the interview prep.
- **The date**, which is what makes silence measurable.

Anything else is optional. A record that takes two minutes to write does not get written.

## Follow up on the stage, not the application

`followup` counts days from the last stage change. That is the honest clock: an application that reached interview yesterday is not stale because you applied a month ago.

Reasonable thresholds, adjust to the market:

- **After applying**: 7 to 10 days before a polite nudge. Under a week reads as anxious.
- **After a recruiter screen**: 5 days. They told you a timeline; hold them to it once.
- **After a final round**: 3 days. At this point you are a candidate, not an applicant.
- **Twice, then stop.** A third chase changes nothing and is remembered.

## What the record tells you after twenty applications

This is why it is worth keeping, and it is the part a spreadsheet does not give you.

**Applications going out, no screens coming back.** The CV is not reaching a human, or it is reaching one and losing. Check parseability first with `ats-resume lint` on the extracted text, then the match rate against the postings with `ats-resume tailor`. Under 60 per cent match is usually filtered before anyone reads it.

**Screens happening, interviews not.** The CV works and the pitch does not. The gap is between what the document claims and what you say in the first fifteen minutes.

**Interviews happening, offers not.** Neither the CV nor the pitch is the problem. Look at level: applying one rung above where the evidence sits produces exactly this pattern.

**Nothing at all, across many applications.** Before rewriting anything, count the channel. Cold applications fill few senior roles anywhere, and at director level and above most seats are filled through referral and search. Twenty cold applications and no reply is not a document problem, and rewriting the document again will not fix it.

## Where the honesty rules bite

Record what you sent, not what you wish you had sent. A record that quietly improves is a record that lies to you in a month when you are trying to work out what went wrong.

If an application went out with a figure you cannot source, note it. That is the interview it will surface in.
