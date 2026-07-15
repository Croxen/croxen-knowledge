---
title: "Giving Hermes a Memory: Connecting My AI Agent to Google Gemini and NotebookLM"
date: 2026-07-15
status: approved
visibility: approved
tags: [hermes, automation, google, gemini, notebooklm, ai-agents]
summary: "How I built an automated pipeline that lets my local AI agent learn from my everyday Google Gemini conversations and NotebookLM research — without any manual exports or copy-paste."
---

I use two AI systems every day. **Google Gemini** is my casual thinking partner — I ask it questions, brainstorm ideas, check the daily AI news. **Hermes** is my behind-the-scenes automation engine running on a Proxmox server at home — it manages my smart home, runs scheduled jobs, and maintains a persistent memory of my preferences and projects.

The problem: these two systems didn't talk to each other. Every useful conversation I had with Gemini stayed locked in Google's ecosystem. Hermes had no way to learn from what I was thinking about, researching, or deciding.

I wanted Hermes to become a **behind-the-scenes knowledge bank** — quietly ingesting what I talk about with Gemini and what I research in NotebookLM, extracting the durable bits, and building a structured understanding of my interests, projects, and thinking patterns over time.

## The challenge: Google doesn't make this easy

Neither Gemini consumer chat history nor NotebookLM has an official API for reading your data. Google Takeout exists but it's a manual bulk export — not something you can hook into an automated pipeline.

After a morning of research, I found two community-built Python libraries that reverse-engineer Google's internal APIs:

- **[gemini-webapi](https://github.com/HanaokaYuzu/Gemini-API)** (~2,800 GitHub stars) — reads your Gemini chat history: list all conversations, read full turn-by-turn history
- **[notebooklm-py](https://github.com/teng-lin/notebooklm-py)** (~17,200 GitHub stars) — full programmatic access to NotebookLM: list notebooks, read sources, create notes, export artifacts

Both support **headless, unattended operation**. One-time browser authentication, then they run forever on a schedule with automatic cookie refresh.

## Architecture

The pipeline is three cron jobs running on Hermes' existing scheduler:

```
Every hour (zero LLM cost):
  poll_google_knowledge.py
    ├─ Gemini: list_chats() → read new ones → extract turn history
    └─ NotebookLM: list notebooks → check for changes → extract metadata
    → writes discovery events to inbox

Every 90 minutes (LLM-driven):
  Knowledge extraction agent
    → reads inbox events
    → classifies: preference, project, decision, opportunity
    → extracts structured facts with source provenance
    → proposes candidate memories (never auto-commits)

Every 20 minutes:
  NotebookLM auth keepalive — prevents session expiry
```

The extraction follows an **ingestion policy** — recurring interests, projects, and decisions are always extracted. Finances require explicit approval. Credentials and third-party information are never stored.

## What the first run discovered

The initial poll processed 13 Gemini chats and 14 NotebookLM notebooks. Within minutes, Hermes had surfaced several things about my interests and projects that it didn't previously know — all extracted from conversations I'd had with other AI tools, not from anything I'd explicitly configured.

## Why this matters

Most AI agents only know what you explicitly tell them in their own chat interface. That is a tiny fraction of your actual thinking. By connecting a personal agent to your everyday AI usage, it builds a much richer picture of what you care about over time — without you having to repeat yourself across different tools.

## The code

The polling script, extraction skill, and ingestion policy are all part of Hermes' [agency loop](https://github.com/NousResearch/Hermes-Agent) — an orchestration layer that observes, decides, and acts on a schedule. The Google Knowledge Bridge is its newest event source, joining the existing GitHub release watcher and Home Assistant integration.

---

*Drafted by Hermes. Nothing goes live until reviewed and approved.*
