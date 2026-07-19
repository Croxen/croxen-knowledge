---
title: "Building a Self-Healing Cron Auditor for an AI Agent"
date: 2026-07-19
status: draft
visibility: draft
tags: [ai, automation, hermes]
summary: "How a broken cron auditor was fixed and redesigned to find and fix real bugs across an AI agent's scheduled jobs."
---

I run about a dozen scheduled jobs on my AI agent — polling Google services, monitoring Discord, running health checks, extracting knowledge. For weeks, I assumed they were all fine. They were not.

The cron health auditor was the job meant to tell me when something broke. But the auditor itself had been silently failing since the day I set it up.

## The bug that hid itself

The auditor's cron job had its bash script stored **inline** — the entire `#!/bin/bash\nsource...\nexec python3...` string was pasted directly into the `script` field of the job definition.

The cron scheduler treats the `script` field as a **filename** to look up in `~/.hermes/scripts/`. So it was trying to find a file literally named `#!/bin/bash\nsource /home/hermes/Her...` — which obviously does not exist.

The error was logged once as `"Script not found"` and then nothing. For weeks. A health checker that could not even check itself.

The fix took two minutes: create a proper `check_cron_health.sh` file and update the job to reference it by name. But that was only half the problem.

## From mechanical check to actual intelligence

Once the auditor was running again, it revealed the deeper issue: it was only checking metadata. Timestamps. Exit statuses. It never read the actual output of any job. A job could return an empty result every single run and the auditor would call it healthy.

The redesign was simple in concept: split the auditor into two parts.

**Part one:** a data collection script (`check_cron_health.py`) that gathers everything — job metadata, recent output files, error logs, output quality signals (empty? repetitive? erroring?), and trend data across runs.

**Part two:** switch the cron job from script-only (`no_agent=True`) to **agent-driven**. After the data collector runs, an LLM agent reads the collected data, analyses the outputs, identifies real issues versus false alarms, and applies fixes where safe.

This is the difference between a smoke alarm and a maintenance engineer.

## What the first agent-driven run found

On its very first run, the redesigned auditor found and fixed three real bugs that had been affecting the system for weeks:

- **Discord MCP config:** The `tools.include` field was a dictionary instead of a list. The MCP loader quietly rejected it, and all 15 Discord tools were broken — silently, for weeks.

- **Google Knowledge Extraction:** A reference file was missing. The job kept retrying tool calls to work around it, wasting tokens on every single polling tick.

- **Display personality warnings:** An empty personalities config was generating a warning on every session start. Not a functional bug, but noise that drowned out real alerts.

It also identified false alarms — things the mechanical checker would have flagged as errors but are actually normal: silent-on-success scripts, repetitive polling output ("No new commits"), and benign infrastructure warnings.

## Why this matters

Most AI agent setups ship with cron-like scheduling and call it done. Jobs are fire-and-forget. If one starts failing silently — wrong config type, missing reference file, API key expired — you do not find out until you notice the absence of its output days or weeks later.

A self-healing auditor closes that gap. It does not just check whether a job ran — it reads what the job produced and decides whether the output is genuinely useful. When it finds something wrong, it fixes what it safely can and flags the rest.

The key insight is that the auditor itself needs to be checked. Make sure your monitoring tool actually runs before you trust it to monitor anything else.

---

*Drafted by Hermes. Nothing goes live until reviewed and approved.*