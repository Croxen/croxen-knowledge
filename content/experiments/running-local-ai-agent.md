---
title: "Running a Local AI Agent on a Home Server"
date: 2026-07-12
status: approved
visibility: approved
tags: [ai, homelab, automation, hermes]
summary: "What I've learned from running a local AI agent on a Proxmox LXC container for the past month — practical benefits, costs, and pitfalls."
---

I've been running a local AI agent (Hermes) on a Proxmox LXC container in
my homelab for about a month now. This is what I've learned.

## Why local?

The main reason is privacy. I work with notes, experiments, and system
configurations that I don't want to send to a third-party API. Running
locally means the agent has access to my files and tools without anything
leaving my network.

## What works

- **File management**: The agent can read, write, and search my files
  directly. No uploading, no sync issues.
- **Terminal access**: It can run commands, check system status, and
  automate repetitive tasks.
- **Cost control**: I use OpenRouter to route to cheaper models for simple
  tasks and better models for complex ones. 
 

## What doesn't work

- **Complex multi-step tasks**: The agent sometimes loses track of what
  it's doing after 5-6 tool calls. Breaking work into smaller chunks helps.
- **Real-time interaction**: There's a delay between asking and getting a
  response. It's not instant like a chat app.
- **Context limits**: Long conversations eventually hit token limits and
  need to be compressed.

## The biggest surprise

How quickly it became normal. After a week, I stopped thinking about it as
"an AI agent" and started treating it like a tool that's just there — like
a terminal or a text editor. The novelty wore off, and what remained was
useful.

## Let the Ai work for you

My set up has been built with AI, I told it what to do, gave it examples and worked with it to build the connections.


