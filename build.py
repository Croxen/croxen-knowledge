#!/usr/bin/env python3
"""Static site generator for croxen-knowledge.

Reads approved Markdown from content/, generates HTML using Jinja2 templates,
and produces RSS, sitemap, and navigation.

Pages generated:
  - index.html (home)
  - about/index.html
  - now/index.html
  - learning/index.html + per-article pages
  - experiments/index.html + per-article pages
  - guides/index.html + per-article pages
  - changelog/index.html
  - feed.xml (RSS)
  - sitemap.xml

Usage:
    python3 build.py          # build into _build/
    python3 build.py --serve  # build + start a local preview server on :8000
"""

import os
import sys
import re
import html
import shutil
import datetime
from pathlib import Path
from urllib.parse import quote

from jinja2 import Environment, FileSystemLoader, select_autoescape
import markdown


REPO_ROOT = Path(__file__).resolve().parent
CONTENT_DIR = REPO_ROOT / "content"
TEMPLATES_DIR = REPO_ROOT / "templates"
STATIC_DIR = REPO_ROOT / "static"
BUILD_DIR = REPO_ROOT / "_build"
SITE_URL = "https://croxen.github.io/croxen-knowledge"

# Sections that contain articles (each gets an index + individual pages)
SECTIONS = {
    "learning": "Learning",
    "experiments": "Experiments",
    "guides": "Guides",
}

# Standalone pages (single page, no article list)
PAGES = {
    "about": "about.html",
    "now": "now.html",
}


def parse_front_matter(text: str) -> tuple[dict, str]:
    """Parse YAML front matter from Markdown. Returns (meta, body)."""
    if not text.startswith("---"):
        return {}, text
    parts = text.split("---", 2)
    if len(parts) < 3:
        return {}, text
    raw = parts[1].strip()
    body = parts[2]
    meta: dict = {}
    for line in raw.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if ":" not in line:
            continue
        key, _, value = line.partition(":")
        key = key.strip()
        value = value.strip()
        # Strip quotes
        if value.startswith('"') and value.endswith('"'):
            value = value[1:-1]
        elif value.startswith("'") and value.endswith("'"):
            value = value[1:-1]
        # Parse tags [a, b, c] → list
        if value.startswith("[") and value.endswith("]"):
            value = [v.strip().strip('"\'') for v in value[1:-1].split(",") if v.strip()]
        meta[key] = value
    return meta, body


def load_articles() -> dict[str, list[dict]]:
    """Load all articles from content/<section>/*.md.

    Returns a dict: {section: [article_dict, ...]} sorted by date descending.
    """
    articles: dict[str, list[dict]] = {s: [] for s in SECTIONS}

    for section in SECTIONS:
        section_dir = CONTENT_DIR / section
        if not section_dir.exists():
            continue
        for md_file in sorted(section_dir.glob("*.md")):
            text = md_file.read_text(encoding="utf-8")
            meta, body = parse_front_matter(text)
            if not meta.get("title"):
                continue
            # Skip drafts and non-approved
            status = str(meta.get("status", "")).lower()
            if status != "approved":
                continue

            html_body = markdown.markdown(body, extensions=["extra", "codehilite"])
            slug = md_file.stem
            article = {
                "title": meta.get("title", slug),
                "date": meta.get("date", ""),
                "tags": meta.get("tags", []) if isinstance(meta.get("tags"), list) else [meta.get("tags", "")],
                "summary": meta.get("summary", ""),
                "html": html_body,
                "url": f"/{section}/{slug}/",
                "slug": slug,
                "section": section,
            }
            articles[section].append(article)

    # Sort each section by date descending
    for s in articles:
        articles[s].sort(key=lambda a: a["date"], reverse=True)

    return articles


def render_templates(articles: dict[str, list[dict]], env: Environment) -> list[dict]:
    """Render all pages. Returns a list of (output_path, content) for sitemap."""
    generated: list[dict] = []
    all_articles: list[dict] = []

    for section_arts in articles.values():
        all_articles.extend(section_arts)
    all_articles.sort(key=lambda a: a["date"], reverse=True)

    # Home page
    template = env.get_template("home.html")
    html_out = template.render(articles=all_articles[:10])
    generated.append({"path": "index.html", "content": html_out, "url": "/"})

    # About page
    template = env.get_template("about.html")
    html_out = template.render()
    generated.append({"path": "about/index.html", "content": html_out, "url": "/about/"})

    # Now page
    now_file = CONTENT_DIR / "now.md"
    now_content = ""
    if now_file.exists():
        _, body = parse_front_matter(now_file.read_text(encoding="utf-8"))
        now_content = markdown.markdown(body, extensions=["extra"])
    template = env.get_template("now.html")
    html_out = template.render(now_content=now_content)
    generated.append({"path": "now/index.html", "content": html_out, "url": "/now/"})

    # Section index pages + individual article pages
    section_template = env.get_template("section.html")
    article_template = env.get_template("article.html")

    for section, title in SECTIONS.items():
        section_arts = articles.get(section, [])
        html_out = section_template.render(articles=section_arts, section_title=title)
        generated.append({"path": f"{section}/index.html", "content": html_out, "url": f"/{section}/"})

        for art in section_arts:
            html_out = article_template.render(
                article=art,
                section=section,
                section_title=title,
            )
            generated.append({
                "path": f"{section}/{art['slug']}/index.html",
                "content": html_out,
                "url": f"/{section}/{art['slug']}/",
                "date": art["date"],
            })

    # Changelog
    changelog = load_changelog()
    template = env.get_template("changelog.html")
    html_out = template.render(entries=changelog)
    generated.append({"path": "changelog/index.html", "content": html_out, "url": "/changelog/"})

    # RSS feed
    rss = generate_rss(all_articles[:15])
    generated.append({"path": "feed.xml", "content": rss, "url": "/feed.xml"})

    # Sitemap
    sitemap = generate_sitemap(generated)
    generated.append({"path": "sitemap.xml", "content": sitemap, "url": "/sitemap.xml"})

    return generated


def load_changelog() -> list[dict]:
    """Load changelog entries from content/changelog.md."""
    cl_file = CONTENT_DIR / "changelog.md"
    if not cl_file.exists():
        return []
    text = cl_file.read_text(encoding="utf-8")
    _, body = parse_front_matter(text)
    entries: list[dict] = []
    # Parse simple format: ## YYYY-MM-DD — Title \n description
    for match in re.finditer(r"^##\s+(\d{4}-\d{2}-\d{2})\s*[—–-]\s*(.+?)(?:\n|\r)(.*?)(?=\n##\s|\Z)", body, re.DOTALL):
        entries.append({
            "date": match.group(1),
            "title": match.group(2).strip(),
            "description": match.group(3).strip(),
        })
    return entries


def generate_rss(articles: list[dict]) -> str:
    """Generate RSS 2.0 feed."""
    now = datetime.datetime.now(datetime.timezone.utc).strftime("%a, %d %b %Y %H:%M:%S +0000")
    items = []
    for a in articles:
        url = SITE_URL + a["url"]
        items.append(f"""    <item>
      <title>{html.escape(a["title"])}</title>
      <link>{url}</link>
      <guid>{url}</guid>
      <pubDate>{a["date"]}</pubDate>
    </item>""")

    items_str = "\n".join(items)
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Croxen Knowledge</title>
    <link>{SITE_URL}</link>
    <description>A public knowledge base about AI, IT, automation, and personal technology.</description>
    <lastBuildDate>{now}</lastBuildDate>
{items_str}
  </channel>
</rss>"""


def generate_sitemap(pages: list[dict]) -> str:
    """Generate sitemap.xml."""
    urls = []
    for p in pages:
        loc = SITE_URL + p["url"]
        lastmod = p.get("date", "")
        if lastmod:
            urls.append(f"  <url><loc>{loc}</loc><lastmod>{lastmod}</lastmod></url>")
        else:
            urls.append(f"  <url><loc>{loc}</loc></url>")
    urls_str = "\n".join(urls)
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
{urls_str}
</urlset>"""


def write_build(generated: list[dict]) -> None:
    """Write all generated files to _build/."""
    if BUILD_DIR.exists():
        shutil.rmtree(BUILD_DIR)
    BUILD_DIR.mkdir(parents=True)

    # Copy static files
    if STATIC_DIR.exists():
        shutil.copytree(STATIC_DIR, BUILD_DIR / "static")

    for page in generated:
        out_path = BUILD_DIR / page["path"]
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(page["content"], encoding="utf-8")

    print(f"Built {len(generated)} pages into {BUILD_DIR}/")


def serve() -> None:
    """Start a simple HTTP server on :8000 for local preview."""
    import http.server
    import socketserver

    os.chdir(BUILD_DIR)
    handler = http.server.SimpleHTTPRequestHandler
    with socketserver.TCPServer(("", 8000), handler) as httpd:
        print(f"Serving on http://localhost:8000/ (Ctrl+C to stop)")
        httpd.serve_forever()


def main():
    env = Environment(
        loader=FileSystemLoader(str(TEMPLATES_DIR)),
        autoescape=select_autoescape(["html", "xml"]),
    )

    articles = load_articles()
    generated = render_templates(articles, env)
    write_build(generated)

    total_articles = sum(len(v) for v in articles.values())
    print(f"Articles: {total_articles}")
    for section, arts in articles.items():
        print(f"  {section}: {len(arts)}")

    if "--serve" in sys.argv:
        serve()


if __name__ == "__main__":
    main()
