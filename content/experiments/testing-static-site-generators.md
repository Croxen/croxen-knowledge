---
title: "Testing Static Site Generators for a Personal Knowledge Base"
date: 2026-07-12
status: approved
visibility: approved
tags: [static-site, knowledge-base, experiments]
summary: "Why I chose a custom Python script over Hugo and Jekyll for a small knowledge base."
---

# Testing Static Site Generators

I tested a few static site generators for my AI knowledge base. Hugo was
fast but added complexity I did not need. Jekyll required a Ruby
dependency I did not want to install. I chose a simpler approach using
Python and Jinja2 because reducing dependencies made the system easier to
understand and maintain.

## What I tried

- **Hugo**: fast, but the template language was overkill for a small site.
- **Jekyll**: solid, but I did not want to install Ruby just to build a site.
- **A custom Python script**: about 200 lines, easy to read, does exactly
  what I need.

## What I learned

The simplest tool that solves the problem is usually the best choice for a
small project. Fewer dependencies mean fewer things to break, and the whole
system stays auditable — you can read every line of the build script and
understand what it does.

## Why this matters

A knowledge base is a long-term project. If the build tool is something
you don't understand, fixing it when it breaks becomes a project of its
own. A 200-line Python script using libraries that have been stable for
years is something I can maintain myself, without waiting for a framework
update or debugging a template language I barely use.
