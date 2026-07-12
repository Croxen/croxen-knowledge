---
title: "Building a Self-Approving Knowledge Base"
date: 2026-07-12
status: approved
visibility: approved
tags: [workflow, automation, knowledge-base]
summary: "How I set up a dev-to-prod publishing pipeline with an approve button directly on the preview site."
---

This is a test of the approve workflow. When you press the green button
above, this article's status gets flipped from `draft` `edit` to `approved` on
GitHub, which triggers a production rebuild on Vercel.

## How it works

1. Draft articles are written with `status: draft` in the front matter.
2. The dev site builds with `DEV_MODE=1`, which includes drafts.
3. Draft articles show a yellow DRAFT badge and a green "Approve for
   production" button.
4. Pressing the button calls a serverless API endpoint.
5. The endpoint updates the file on GitHub via the API, flipping the
   status to `approved`.
6. GitHub push triggers Vercel to rebuild the production site.
7. The article appears on the live site within about 30 seconds.

## Why this matters

Instead of asking someone to run a command or edit a file, they can
review the article as it will appear in production, then click one button.
The workflow is: write → preview → review → approve → live.
