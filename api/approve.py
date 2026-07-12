"""Serverless API endpoint for approving draft articles.

POST /api/approve
Body: {"slug": "article-slug", "section": "experiments"}

This endpoint:
1. Fetches the Markdown file from the GitHub repo
2. Updates the front matter from status: draft to status: approved
3. Commits the change back to GitHub
4. The GitHub push triggers Vercel to rebuild the production site

Required env vars (set in Vercel project settings):
  - GH_TOKEN: GitHub personal access token
  - GH_REPO: "Croxen/croxen-knowledge"
  - APPROVE_SECRET: shared secret for the API (optional, prevents abuse)
"""
import json
import re
import base64
import urllib.request
import urllib.error
import os


def handler(request):
    """Vercel serverless function handler."""
    # Parse the request
    try:
        body = request.get("body", "{}")
        if isinstance(body, str):
            data = json.loads(body)
        else:
            data = body
    except (json.JSONDecodeError, TypeError):
        return _json_response(400, {"error": "Invalid JSON body"})

    slug = data.get("slug", "")
    section = data.get("section", "")

    # Validate
    if not slug or not section:
        return _json_response(400, {"error": "Missing slug or section"})
    if not re.match(r"^[a-z0-9-]+$", slug):
        return _json_response(400, {"error": "Invalid slug format"})
    if section not in ("learning", "experiments", "guides"):
        return _json_response(400, {"error": "Invalid section"})

    # Check secret if configured
    approve_secret = os.environ.get("APPROVE_SECRET", "")
    if approve_secret:
        auth = ""
        headers = request.get("headers", {})
        auth = headers.get("x-approve-secret", headers.get("X-Approve-Secret", ""))
        if auth != approve_secret:
            return _json_response(403, {"error": "Unauthorized"})

    # GitHub config
    gh_token = os.environ.get("GH_TOKEN", "")
    gh_repo = os.environ.get("GH_REPO", "Croxen/croxen-knowledge")
    if not gh_token:
        return _json_response(500, {"error": "GH_TOKEN not configured"})

    file_path = f"content/{section}/{slug}.md"
    api_base = f"https://api.github.com/repos/{gh_repo}/contents/{file_path}"

    # 1. Fetch the file from GitHub
    try:
        req = urllib.request.Request(
            f"{api_base}?ref=main",
            headers={
                "Authorization": f"Bearer {gh_token}",
                "Accept": "application/vnd.github+json",
                "User-Agent": "croxen-labs-approve",
            },
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            file_data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return _json_response(e.code, {"error": f"GitHub API error: {e.read().decode('utf-8', errors='ignore')}"})
    except Exception as e:
        return _json_response(500, {"error": f"Failed to fetch file: {str(e)}"})

    # 2. Decode and update the content
    content = base64.b64decode(file_data["content"]).decode("utf-8")
    sha = file_data["sha"]

    # Replace status: draft with status: approved
    updated_content = re.sub(
        r"(?m)^(status:\s*)draft\s*$",
        r"\1approved",
        content,
        count=1,
    )

    # Also update visibility if it's draft
    updated_content = re.sub(
        r"(?m)^(visibility:\s*)draft\s*$",
        r"\1approved",
        updated_content,
        count=1,
    )

    # Check if anything changed
    if updated_content == content:
        return _json_response(200, {"message": "Article was already approved", "slug": slug})

    # 3. Commit the updated file back to GitHub
    encoded_content = base64.b64encode(updated_content.encode("utf-8")).decode("utf-8")
    commit_payload = {
        "message": f"Approve: {section}/{slug}",
        "content": encoded_content,
        "sha": sha,
        "branch": "main",
    }

    try:
        req = urllib.request.Request(
            api_base,
            data=json.dumps(commit_payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {gh_token}",
                "Accept": "application/vnd.github+json",
                "Content-Type": "application/json",
                "User-Agent": "croxen-labs-approve",
            },
            method="PUT",
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            result = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return _json_response(e.code, {"error": f"GitHub commit failed: {e.read().decode('utf-8', errors='ignore')}"})
    except Exception as e:
        return _json_response(500, {"error": f"Failed to commit: {str(e)}"})

    return _json_response(200, {
        "message": "Article approved! Production deploy triggered.",
        "slug": slug,
        "section": section,
        "commit": result.get("commit", {}).get("sha", ""),
    })


def _json_response(status, body):
    """Return a Vercel-style response."""
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body),
    }
