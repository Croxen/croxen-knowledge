#!/usr/bin/env python3
"""
Weekly content-cron helper.

Scans recent Hermes session history for genuinely interesting, self-contained
learnings, drafts 2–3 articles as `status: draft` into the public content repo,
pushes them, triggers a dev rebuild, and emails Andrew the review links.

Quality over quantity: it only drafts when a session surfaces a clear,
self-contained lesson or result worth publishing. Empty weeks are skipped.

Run from the cron context with HERMES session tools available.
"""
import os
import re
import sys
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(os.environ.get("CROXEN_REPO", str(Path.home() / "croxen-knowledge-public")))
SECRET = os.environ.get("CROXEN_APPROVE_SECRET", "croxen-labs-approve-2026")
DEV_DEPLOY_URL = "https://dev-croxen-labs.vercel.app/api/deploy-dev"
EMAIL_TO = os.environ.get("CROXEN_AUTHOR_EMAIL", "amr.roden@gmail.com")

INTEREST_SIGNALS = [
    "fixed", "discovered", "learned", "root cause", "breakthrough", "working",
    "finally", "solved", "built", "deployed", "migrated", "automated",
    "lesson", "gotcha", "pitfall", "trick", "insight", "benchmark",
]
SKIP_SIGNALS = [
    "rebooted", "restarted service", "ran backup", "checked logs", "no change",
    "routine", "daily", "monitoring", "status check",
]


def notify(subject, body):
    """Send an email via himalaya (installed at ~/.local/bin/himalaya)."""
    msg = (
        f"From: Croxen <{EMAIL_TO}>\n"
        f"To: {EMAIL_TO}\n"
        f"Subject: {subject}\n\n"
        f"{body}\n"
    )
    try:
        r = subprocess.run(
            ["himalaya", "message", "send"],
            input=msg, capture_output=True, text=True, timeout=60,
        )
        return r.returncode == 0, r.stdout.strip() or r.stderr.strip()
    except Exception as e:
        return False, str(e)


def slugify(title):
    s = title.lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s[:60]


def draft_article(section, title, summary, body_markdown):
    """Write a draft article file into the repo. Returns (path, slug)."""
    slug = slugify(title)
    date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    front = (
        f"---\n"
        f'title: "{title}"\n'
        f"date: {date}\n"
        f"status: draft\n"
        f"visibility: draft\n"
        f"tags: [ai, automation, hermes]\n"
        f"summary: \"{summary}\"\n"
        f"---\n\n"
    )
    content = front + body_markdown.strip() + "\n"
    out = REPO / "content" / section / f"{slug}.md"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(content, encoding="utf-8")
    return out, slug


def push_and_deploy():
    """Commit drafts, push, trigger dev rebuild, return True on success."""
    r = subprocess.run(["git", "-C", str(REPO), "add", "-A"], capture_output=True, text=True)
    status = subprocess.run(
        ["git", "-C", str(REPO), "status", "--porcelain"],
        capture_output=True, text=True,
    )
    if not status.stdout.strip():
        return False, "no changes"
    r = subprocess.run(
        ["git", "-C", str(REPO), "commit", "-m", "Weekly draft(s) from Hermes"],
        capture_output=True, text=True,
    )
    if r.returncode != 0:
        return False, r.stderr.strip()
    r = subprocess.run(["git", "-C", str(REPO), "push"], capture_output=True, text=True)
    if r.returncode != 0:
        return False, r.stderr.strip()

    # Trigger dev rebuild via serverless endpoint (secrets live on Vercel)
    import urllib.request
    try:
        req = urllib.request.Request(
            DEV_DEPLOY_URL,
            data=json.dumps({}).encode(),
            headers={"Content-Type": "application/json", "X-Approve-Secret": SECRET},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode())
            return True, data.get("message", "dev rebuilt")
    except Exception as e:
        # Push succeeded; dev rebuild is best-effort
        return True, f"pushed (dev rebuild trigger failed: {e})"


# The actual content discovery is performed by the Hermes agent running this
# cron (it has session_search + web tools). This script is the deterministic
# half: given a list of drafted articles (passed via argv JSON or stdin), it
# commits, pushes, rebuilds dev, and emails the review links.
#
# Usage (from the cron prompt, after the agent has written drafts):
#   python3 cron_weekly_content.py '[{"section":"experiments","title":"...","slug":"..."}]'
if __name__ == "__main__":
    if len(sys.argv) > 1:
        try:
            drafts = json.loads(sys.argv[1])
        except Exception:
            drafts = []
    else:
        # Read JSON from stdin
        raw = sys.stdin.read().strip()
        drafts = json.loads(raw) if raw else []

    if not drafts:
        # Nothing worth publishing this week — skip silently.
        print("No drafts this week. Skipping.")
        sys.exit(0)

    ok, msg = push_and_deploy()
    links = "\n".join(
        f"  https://dev-croxen-labs.vercel.app/{d['section']}/{d['slug']}/"
        for d in drafts
    )
    body = (
        f"Hermes drafted {len(drafts)} article(s) for your review on the dev site.\n\n"
        f"{links}\n\n"
        f"Review each on the dev preview, then press the green 'Approve for production'\n"
        f"button to publish. Nothing goes live until you approve it.\n\n"
        f"Deploy status: {msg}\n"
    )
    sent, detail = notify(
        f"[{len(drafts)} new draft(s) ready to review] Croxen Labs",
        body,
    )
    print(f"Pushed: {msg}")
    print(f"Email sent: {sent} ({detail})")
    print(f"Links:\n{links}")
