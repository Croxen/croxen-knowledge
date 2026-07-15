---
title: "Programmatic Vercel Deployments: The gitSource Gotcha"
date: 2026-07-15
status: draft
visibility: draft
tags: [ai, automation, hermes]
summary: "When using the Vercel REST API to trigger deployments programmatically, the gitSource field requires both a type and a numeric repoId — not just a repo name string."
---

Vercel's REST API is a powerful way to trigger deployments from your own scripts. But if you are using the git-triggered deployment endpoint, there is a subtle requirement that the documentation does not make obvious.

## The problem

You want to trigger a production deployment from a script. You send a POST to the Vercel deployments endpoint with a `gitSource` object:

```json
{
  "name": "my-project",
  "target": "production",
  "gitSource": {
    "repo": "my-org/my-repo",
    "ref": "main"
  }
}
```

Vercel rejects it:

```json
{
  "error": {
    "code": "bad_request",
    "message": "Invalid request: `gitSource` missing required property `type`."
  }
}
```

Fair enough — you add the `type` field:

```json
{
  "gitSource": {
    "type": "github",
    "repo": "my-org/my-repo",
    "ref": "main"
  }
}
```

Still fails. The deployment goes into an `ERROR` state with no clear error message. What is missing?

## The missing field: `repoId`

The Vercel git-deploy API requires a **numeric** repository ID, not just a repository name string. The full `gitSource` object needs to look like this:

```json
{
  "gitSource": {
    "type": "github",
    "repo": "my-org/my-repo",
    "repoId": "1234567890",
    "ref": "main"
  }
}
```

The `repoId` is the numeric ID from GitHub's API. You can find it by querying the GitHub repository endpoint:

```bash
curl -s https://api.github.com/repos/my-org/my-repo | jq '.id'
```

Or, if your Vercel project was previously linked to GitHub, Vercel may have auto-created a `VERCEL_REPO_ID` environment variable. Check your project's environment variables in the Vercel dashboard.

## Why this matters

If you are building a custom deployment pipeline — for example, a content management system that triggers deployments when articles are approved — getting the `gitSource` shape right is the difference between a working pipeline and a silent failure.

The error messages from Vercel are not helpful here. The API returns `200 OK` with a deployment ID, but the deployment itself goes into an `ERROR` state. You have to poll the deployment status to discover the failure, and even then the error detail is often empty.

## A simpler alternative

If you do not need to trigger deployments from an external script, the simplest approach is to use GitHub Actions. A `workflow_dispatch` trigger lets you kick off a deployment with a single API call to GitHub:

```bash
curl -X POST \
  -H "Authorization: token $GH_TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  "https://api.github.com/repos/my-org/my-repo/actions/workflows/deploy.yml/dispatches" \
  -d '{"ref":"main"}'
```

This is simpler, better documented, and does not require the numeric `repoId`. The trade-off is that you need a GitHub Actions workflow set up, and you are limited by GitHub's API rate limits.

## The bottom line

When using Vercel's REST API for git-triggered deployments, your `gitSource` needs three fields: `type` (string), `repo` (string), and `repoId` (numeric string). Missing any of them will cause a silent deployment failure. If you can use GitHub Actions instead, do — it is one less API surface to debug.