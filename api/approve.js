// Serverless API for article management on the dev preview.
// Vercel auto-detects api/*.js as serverless functions.
//
// POST /api/approve   — flip draft → approved (commits to GitHub)
// POST /api/edit      — save edited Markdown content to GitHub
// POST /api/delete    — delete a draft article from the repo
// GET  /api/content   — fetch raw Markdown for the editor
//
// All POSTs require X-Approve-Secret header.
//
// Deployments are handled by a Hermes cron job (croxen_deploy.sh) that
// polls GitHub every 5 minutes, deploys dev on any commit, and deploys
// prod when an "Approve:" commit is detected.

const GH_TOKEN = process.env.GH_TOKEN;
const GH_REPO = process.env.GH_REPO || "Croxen/croxen-knowledge";
const APPROVE_SECRET = process.env.APPROVE_SECRET;

const VALID_SECTIONS = ["learning", "experiments", "guides"];

function checkSecret(req) {
  if (!APPROVE_SECRET) return true;
  return req.headers["x-approve-secret"] === APPROVE_SECRET;
}

function validateSlug(slug) {
  return /^[a-z0-9-]+$/.test(slug);
}

async function gh(path, opts = {}) {
  const resp = await fetch(`https://api.github.com/repos/${GH_REPO}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${GH_TOKEN}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "croxen-labs",
      ...(opts.headers || {}),
    },
  });
  if (!resp.ok) {
    const text = await resp.text();
    return { ok: false, status: resp.status, text };
  }
  const data = await resp.json();
  return { ok: true, data };
}

function ghCommit(path, content, sha, message) {
  return gh(`/contents/${path}?ref=main`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      content: Buffer.from(content, "utf-8").toString("base64"),
      sha, branch: "main",
      author: { name: "Croxen", email: "Croxen@users.noreply.github.com" },
    }),
  });
}

function ghDelete(path, sha, message) {
  return gh(`/contents/${path}?ref=main`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message, sha, branch: "main",
      author: { name: "Croxen", email: "Croxen@users.noreply.github.com" },
    }),
  });
}

export default async function handler(req, res) {
  // GET — fetch raw Markdown for the editor
  if (req.method === "GET") {
    const { slug, section } = req.query || {};
    if (!slug || !section || !validateSlug(slug) || !VALID_SECTIONS.includes(section)) {
      return res.status(400).json({ error: "Invalid slug or section" });
    }
    if (!checkSecret(req)) return res.status(403).json({ error: "Unauthorized" });
    if (!GH_TOKEN) return res.status(500).json({ error: "GH_TOKEN not configured" });

    const result = await gh(`/contents/content/${section}/${slug}.md?ref=main`);
    if (!result.ok) return res.status(result.status).json({ error: `GitHub: ${result.text}` });
    const content = Buffer.from(result.data.content, "base64").toString("utf-8");
    return res.status(200).json({ slug, section, content });
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!checkSecret(req)) return res.status(403).json({ error: "Unauthorized" });
  if (!GH_TOKEN) return res.status(500).json({ error: "GH_TOKEN not configured" });

  const { action, slug, section, content } = req.body || {};
  if (!slug || !section || !validateSlug(slug) || !VALID_SECTIONS.includes(section)) {
    return res.status(400).json({ error: "Invalid slug or section" });
  }

  const filePath = `content/${section}/${slug}.md`;

  // Fetch current file for sha
  const current = await gh(`/contents/${filePath}?ref=main`);
  if (!current.ok) return res.status(current.status).json({ error: `GitHub: ${current.text}` });
  const sha = current.data.sha;

  if (action === "approve") {
    let body = Buffer.from(current.data.content, "base64").toString("utf-8");
    const before = body;
    body = body.replace(/^(status:\s*)draft\s*$/m, "$1approved");
    body = body.replace(/^(visibility:\s*)draft\s*$/m, "$1approved");
    if (body === before) return res.status(200).json({ message: "Already approved", slug });

    const commit = await ghCommit(filePath, body, sha, `Approve: ${section}/${slug}`);
    if (!commit.ok) return res.status(commit.status).json({ error: `Commit failed: ${commit.text}` });
    return res.status(200).json({
      message: "Approved! Production site updates within 5 minutes.",
      slug, section,
      commit: commit.data.commit?.sha || "",
    });
  }

  if (action === "edit") {
    if (!content || typeof content !== "string") return res.status(400).json({ error: "Missing content" });
    const commit = await ghCommit(filePath, content, sha, `Edit: ${section}/${slug}`);
    if (!commit.ok) return res.status(commit.status).json({ error: `Commit failed: ${commit.text}` });
    return res.status(200).json({
      message: "Saved. Dev preview updates within 5 minutes.",
      slug, section,
      commit: commit.data.commit?.sha || "",
    });
  }

  if (action === "delete") {
    const del = await ghDelete(filePath, sha, `Delete: ${section}/${slug}`);
    if (!del.ok) return res.status(del.status).json({ error: `Delete failed: ${del.text}` });
    return res.status(200).json({ message: "Deleted. Dev preview updates within 5 minutes.", slug, section });
  }

  return res.status(400).json({ error: `Unknown action: ${action}` });
}