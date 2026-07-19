---
title: "The $50 Token Wake-Up Call: How My AI Agent Was Silently Burning Money"
date: 2026-07-19
status: draft
visibility: draft
tags: [ai, automation, hermes]
summary: "A routine audit revealed my AI agent was burning $50 per week on token costs — because the default model was a frontier-tier model never meant for routine work."
---

Every AI agent has a default model. It is the model that handles your chat messages, your scheduled jobs, your file searches, your background tasks. You set it once and forget about it.

Do not do that.

## The discovery

After about a week of running Hermes Agent in earnest, I ran a cost audit. The numbers were not what I expected.

My lifetime OpenRouter spend was **$108.59**. One session alone — a TUI audit using Claude Sonnet-5 — cost **$20.22** for 2.3 million tokens. Three sessions running GPT-5.6 Sol Pro cost a combined **$11.84** for routine investigative work.

The root cause was staring at me from the config file:

```yaml
model:
  default: openai/gpt-5.6-sol-pro
```

GPT-5.6 Sol Pro is OpenAI's flagship frontier model. It costs **$5 per million input tokens** and **$30 per million output tokens**. It is designed for the hardest reasoning tasks — not for checking cron job outputs or searching files.

I had been using it as the default for everything. Every chat message. Every scheduled poll. Every background task. For a week.

## How bad was it?

I pulled the session database and compared:

| Workload | Model | Cost |
|----------|-------|------|
| Routine investigative tasks | GPT-5.6 Sol Pro | $11.84 |
| Same work on a capable mid-tier model | GLM-4.6 | ~$0.69 |

That is a **17× difference** in output costs (11.6× on input). For the same quality of work. The routine tasks — file searches, config checks, web lookups — performed just as well on the cheaper model.

The weekly burn rate was headed for $50+. Not because I was doing anything unusual. Because the default was wrong.

## The fix

Three changes, applied in under ten minutes:

**1. Change the default model:**

```bash
hermes config set model.default z-ai/glm-4.6
```

GLM-4.6 costs $0.43/M input, $1.74/M output. It handles routine work perfectly well and reserves the frontier models for when they are actually needed.

**2. Pin cheap models to background jobs:**

Every scheduled cron job can override the model it uses. Background tasks like Discord monitoring and knowledge extraction got pinned to `google/gemini-2.5-flash-lite` — fractions of a cent per run.

**3. Set up a daily spend monitor:**

A small cron job now checks the OpenRouter credit balance every day. If daily spend exceeds $5 or weekly spend exceeds $25, it sends an alert. Nothing fancy — just enough to catch a runaway model before it burns another $50.

## What I learned

The lesson is not "frontier models are bad." They are incredible for the right tasks. The lesson is:

1. **Know what model your agent is using.** Check your config. Right now. Open terminal, find the config file, read the `model.default` line.

2. **Match the model to the task.** Your agent should use a cheap workhorse for 95% of its work and escalate to frontier models only when a task genuinely needs the extra reasoning. If your agent does not have model routing built in, implement it yourself — even a manual rule is better than burning frontier money on file searches.

3. **Audit your costs regularly.** If you are using OpenRouter, their dashboard shows lifetime spend. Your agent's session database (SQLite, in `~/.hermes/state.db`) has per-session cost estimates. Query both. You might be surprised.

4. **Model pricing changes.** A model that was expensive last month might have a cheaper successor today. When I ran my audit, Claude Sonnet 5 had just launched — cheaper than the Sonnet 4.5 fallback I had configured. Check the catalogue periodically.

A single wrong line in a config file cost me $50 in a week. The fix was changing one string. The hard part was knowing to look.

---

*Drafted by Hermes. Nothing goes live until reviewed and approved.*