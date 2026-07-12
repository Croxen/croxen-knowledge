#!/usr/bin/env python3
"""Deploy script for Croxen Labs.

Usage:
    python3 deploy.py dev    # Build + preview deployment (stable dev URL)
    python3 deploy.py prod   # Build + production deployment
    python3 deploy.py build  # Build only, no deploy

Dev deployments get aliased to a stable URL so you always know where to look.
Production deployments go to the main URL.

Requires: VERCEL_TOKEN environment variable.
"""
import os
import subprocess
import sys
import re
from pathlib import Path

REPO = Path(__file__).resolve().parent
VERCEL_TOKEN = os.environ.get("VERCEL_TOKEN", "")

# Stable dev alias — always points to the latest preview
DEV_ALIAS = "dev-croxen-labs"

# Production URL
PROD_URL = "https://croxen-knowledge-public.vercel.app"


def run(cmd, env=None):
    """Run a command, return (exit_code, stdout, stderr)."""
    full_env = env or {}
    if VERCEL_TOKEN:
        full_env["VERCEL_TOKEN"] = VERCEL_TOKEN
    r = subprocess.run(cmd, capture_output=True, text=True, env={**os.environ, **full_env}, cwd=REPO)
    return r.returncode, r.stdout, r.stderr


def build():
    """Build the static site."""
    print("=== Building site ===")
    code, out, err = run(["python3", "build.py"])
    print(out)
    if code != 0:
        print(f"Build failed: {err}", file=sys.stderr)
        sys.exit(1)
    print("✓ Build complete\n")


def deploy_dev():
    """Deploy to Vercel preview and alias to stable dev URL."""
    build()

    print("=== Deploying to preview ===")
    code, out, err = run(["vercel", "--yes"])
    print(out)
    if code != 0:
        print(f"Deploy failed: {err}", file=sys.stderr)
        sys.exit(1)

    # Extract the preview URL from output
    # Look for a URL like https://something.vercel.app
    urls = re.findall(r'https://[a-z0-9-]+\.vercel\.app', out)
    preview_url = None
    for url in urls:
        if "croxen-knowledge-public" not in url and "vercel.app" in url:
            preview_url = url
            break
    if not preview_url:
        # Fallback: use the first URL that's not the prod alias
        for url in urls:
            if PROD_URL not in url:
                preview_url = url
                break

    if not preview_url:
        print("Could not find preview URL in output", file=sys.stderr)
        sys.exit(1)

    print(f"\n✓ Preview deployed: {preview_url}")

    # Alias to stable dev URL
    print(f"\n=== Aliasing to {DEV_ALIAS} ===")
    code, out, err = run(["vercel", "alias", "set", preview_url, DEV_ALIAS])
    if code != 0:
        print(f"Alias failed: {err}", file=sys.stderr)
        # Not fatal — preview URL still works
    else:
        print(f"✓ Dev URL: https://{DEV_ALIAS}.vercel.app")

    print(f"\n{'='*50}")
    print(f"DEV DEPLOYED")
    print(f"{'='*50}")
    print(f"Preview: {preview_url}")
    print(f"Stable:  https://{DEV_ALIAS}.vercel.app")
    print(f"\nReview the dev URL. When ready to publish:")
    print(f"  python3 deploy.py prod")
    print(f"{'='*50}")


def deploy_prod():
    """Deploy to Vercel production."""
    build()

    print("=== Deploying to production ===")
    code, out, err = run(["vercel", "--prod", "--yes"])
    print(out)
    if code != 0:
        print(f"Deploy failed: {err}", file=sys.stderr)
        sys.exit(1)

    print(f"\n{'='*50}")
    print(f"PRODUCTION DEPLOYED")
    print(f"{'='*50}")
    print(f"URL: {PROD_URL}")
    print(f"{'='*50}")


def main():
    if not VERCEL_TOKEN:
        print("ERROR: VERCEL_TOKEN not set", file=sys.stderr)
        sys.exit(1)

    if len(sys.argv) < 2 or sys.argv[1] not in ("dev", "prod", "build"):
        print(__doc__)
        sys.exit(1)

    mode = sys.argv[1]
    if mode == "dev":
        deploy_dev()
    elif mode == "prod":
        deploy_prod()
    elif mode == "build":
        build()


if __name__ == "__main__":
    main()
