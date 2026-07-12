// Serverless API for article management on the dev preview.
// Vercel automatically detects api/*.js as serverless functions.
//
// POST /api/approve   — flip draft → approved, triggers prod rebuild
// POST /api/edit      — save edited Markdown content back to GitHub
// POST /api/delete    — delete a draft article from the repo
// GET  /api/content   — fetch raw Markdown for the editor
//
// All POSTs require X-Approve-Secret header.

const GH_TOKEN = process.env.GH_TOKEN;
const GH_REPO = process.env.GH_REPO || "Croxen/croxen-knowledge";
const APPROVE_SECRET = process.env.APPROVE_SECRET;
const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const VERCEL_PROJECT = process.env.VERCEL_PROJECT || "croxen-knowledge";

const VALID_SECTIONS = ["learning", "experiments", "guides"];

function checkSecret(req) {
  if (!APPROVE_SECRET) return true;
  return req.headers["x-approve-secret"] === APPROVE_SECRET;
}

function validateSlug(slug) {
  return /^[a-z0-9-]+$/.test(slug);
}

async function fetchFile(apiUrl) {
  const resp = await fetch(apiUrl, {
    headers: {
      Authorization: `Bearer ${GH_TOKEN}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "croxen-labs",
    },
  });
  if (!resp.ok) {
    const text = await resp.text();
    return { ok: false, status: resp.status, text };
  }
  const data = await resp.json();
  return { ok: true, data };
}

async function commitFile(apiUrl, content, sha, message) {
  const encoded = Buffer.from(content, "utf-8").toString("base64");
  const resp = await fetch(apiUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${GH_TOKEN}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "croxen-labs",
    },
    body: JSON.stringify({ message, content: encoded, sha, branch: "main" }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    return { ok: false, status: resp.status, text };
  }
  const data = await resp.json();
  return { ok: true, data };
}

async function deleteFile(apiUrl, sha, message) {
  const resp = await fetch(apiUrl, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${GH_TOKEN}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "croxen-labs",
    },
    body: JSON.stringify({ message, sha, branch: "main" }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    return { ok: false, status: resp.status, text };
  }
  return { ok: true };
}

async function triggerDevRedeploy() {
  if (!VERCEL_TOKEN) return { ok: false, skipped: true };
  try {
    const resp = await fetch(`https://api.vercel.com/v13/deployments`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${VERCEL_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: VERCEL_PROJECT,
        target: "preview",
        gitSource: { repo: GH_REPO, ref: "main" },
        build: { env: { DEV_MODE: "1" } },
      }),
    });
    if (!resp.ok) {
      return { ok: false, status: resp.status, text: await resp.text() };
    }
    const data = await resp.json();
    return { ok: true, url: data.url };
  } catch (err) {
    return { ok: false, text: err.message };
  }
}

export default async function handler(req, res) {
  // GET /api/content?slug=...&section=... — fetch raw Markdown
  if (req.method === "GET") {
    const { slug, section } = req.query || {};
    if (!slug || !section || !validateSlug(slug) || !VALID_SECTIONS.includes(section)) {
      return res.status(400).json({ error: "Invalid slug or section" });
    }
    if (!checkSecret(req)) return res.status(403).json({ error: "Unauthorized" });
    if (!GH_TOKEN) return res.status(500).json({ error: "GH_TOKEN not configured" });

    const apiUrl = `https://api.github.com/repos/${GH_REPO}/contents/content/${section}/${slug}.md?ref=main`;
    const result = await fetchFile(apiUrl);
    if (!result.ok) return res.status(result.status).json({ error: `GitHub: ${result.text}` });

    const content = Buffer.from(result.data.content, "base64").toString("utf-8");
    return res.status(200).json({ slug, section, content });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!checkSecret(req)) return res.status(403).json({ error: "Unauthorized" });
  if (!GH_TOKEN) return res.status(500).json({ error: "GH_TOKEN not configured" });

  const { action, slug, section, content } = req.body || {};

  // Validate common fields
  if (!slug || !section || !validateSlug(slug) || !VALID_SECTIONS.includes(section)) {
    return res.status(400).json({ error: "Invalid slug or section" });
  }

  const filePath = `content/${section}/${slug}.md`;
  const apiUrl = `https://api.github.com/repos/${GH_REPO}/contents/${filePath}?ref=main`;

  // Fetch current file (needed for sha in all actions)
  const result = await fetchFile(apiUrl);
  if (!result.ok) return res.status(result.status).json({ error: `GitHub: ${result.text}` });
  const sha = result.data.sha;

  if (action === "approve") {
    let body = Buffer.from(result.data.content, "base64").toString("utf-8");
    body = body.replace(/^(status:\s*)draft\s*$/m, "$1approved");
    body = body.replace(/^(visibility:\s*)draft\s*$/m, "$1approved");
    if (body === Buffer.from(result.data.content, "base64").toString("utf-8")) {
      return res.status(200).json({ message: "Already approved", slug });
    }
    const commit = await commitFile(apiUrl, body, sha, `Approve: ${section}/${slug}`);
    if (!commit.ok) return res.status(commit.status).json({ error: `Commit failed: ${commit.text}` });
    return res.status(200).json({ message: "Approved! Production deploy triggered.", slug, section, commit: commit.data.commit?.sha || "" });
  }

  if (action === "edit") {
    if (!content || typeof content !== "string") {
      return res.status(400).json({ error: "Missing content" });
    }
    const commit = await commitFile(apiUrl, content, sha, `Edit: ${section}/${slug}`);
    if (!commit.ok) return res.status(commit.status).json({ error: `Commit failed: ${commit.text}` });
    // Trigger a dev preview redeploy so the changes show up
    const redeploy = await triggerDevRedeploy();
    return res.status(200).json({
      message: "Article saved. Dev preview rebuilding — refresh in ~30 seconds.",
      slug, section,
      commit: commit.data.commit?.sha || "",
      redeploy: redeploy.ok ? "triggered" : "skipped",
    });
  }

  if (action === "delete") {
    const del = await deleteFile(apiUrl, sha, `Delete: ${section}/${slug}`);
    if (!del.ok) return res.status(del.status).json({ error: `Delete failed: ${del.text}` });
    // Trigger a dev preview redeploy
    const redeploy = await triggerDevRedeploy();
    return res.status(200).json({
      message: "Article deleted. Dev preview rebuilding.",
      slug, section,
      redeploy: redeploy.ok ? "triggered" : "skipped",
    });
  }

  return res.status(400).json({ error: `Unknown action: ${action}` });
}
