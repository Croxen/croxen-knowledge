---
title: "Why AI Agents Cannot Hot-Swap Models Mid-Conversation"
date: 2026-07-15
status: draft
visibility: draft
tags: [ai, automation, hermes]
summary: "The technical reason why AI agents pin their model at session start, and why switching models mid-conversation would cost you more."
---

You change your AI agent's default model in the config file. You restart the agent. But the conversation you had open from before the restart still shows the old model. Why?

The answer is **prompt caching**, and it is one of the most important cost-saving mechanisms in modern AI agents.

## How prompt caching works

Every time you send a message to an AI model, the entire conversation history is sent along with it. For a long conversation, that can be thousands of lines of text. Without caching, you pay for those tokens on every turn.

Prompt caching solves this. The API provider stores a prefix of the conversation — the system prompt, the first several messages, and any static content — and reuses it across turns. You only pay for the new tokens you add, not the full history every time.

For a long-running agent session, this can reduce costs by 80% or more.

## The catch: caches are model-specific

A prompt cache is tied to a specific model. The cache prefix for `claude-sonnet-5` cannot be reused for `gemini-2.5-flash`. If you swap models mid-conversation, the entire cache is invalidated. You would pay full price for the next turn, and the cache would need to be rebuilt from scratch.

This is why Hermes Agent — and most other AI agent frameworks — **pin the model at session start**. The model you begin a conversation with is the model you finish it with.

## What this means in practice

If you want to switch models, you need to start a new session. The old session keeps its model. The new session picks up the new default.

This is not a bug. It is a deliberate design choice that respects your API budget.

## What about model fallback?

Some agents support fallback chains: if the primary model is unavailable, the agent tries a secondary model. This is a safety net, not a cost optimisation. When fallback triggers, the cache is lost, and the next turn costs more. But it is better than a failed response.

If you see your agent using a fallback model, check why the primary failed. You might be paying more per turn than you expect.

## The bottom line

Model pinning is not a limitation — it is a feature. It protects your prompt cache and keeps your per-turn costs predictable. If you want to experiment with a different model, start a fresh session. Your wallet will thank you.