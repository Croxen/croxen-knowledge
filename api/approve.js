// Serverless API for article management on the dev preview.
//
// POST /api/approve  — flip draft→approved, trigger prod deploy via GitHub Actions
// POST /api/edit     — save edited Markdown to GitHub
// POST /api/delete   — delete a draft article from the repo
// GET  /api/content  — fetch raw Markdown for the editor
//
// Deployments:
//   Dev:  croxen_deploy.sh cron (every 5 min) — deploys on any commit
//   Prod: GitHub Actions deploy.yml — triggered on approve

const GH_TOKEN = process.env.GH_TOKEN;
const GH_REPO = process.env.GH_REPO || "Croxen/croxen-knowledge";
const APPROVE_SECRET = process.env.APPROVE_SECRET;
const VALID_SECTIONS = ["learning", "experiments", "guides"];

function checkSecret(req) {
  if (!APPROVE_SECRET) return true;
  return req.headers["x-approve-secret"] === APPROVE_SECRET;
}
function ok(v) { return /^[a-z0-9-]+$/.test(v); }

async function gh(path, opts = {}) {
  const r = await fetch(`https://api.github.com/repos/${GH_REPO}${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${GH_TOKEN}`, Accept: "application/vnd.github+json", "User-Agent": "croxen-labs", ...(opts.headers || {}) },
  });
  if (!r.ok) { const t = await r.text(); return { ok: false, status: r.status, text: t }; }
  return { ok: true, data: await r.json() };
}

function ghWrite(path, content, sha, msg) {
  return gh(`/contents/${path}?ref=main`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: msg, content: Buffer.from(content, "utf-8").toString("base64"), sha, branch: "main", author: { name: "Croxen", email: "Croxen@users.noreply.github.com" } }),
  });
}

function ghDelete(path, sha, msg) {
  return gh(`/contents/${path}?ref=main`, {
    method: "DELETE", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: msg, sha, branch: "main", author: { name: "Croxen", email: "Croxen@users.noreply.github.com" } }),
  });
}

async function triggerProdDeploy() {
  const r = await fetch(`https://api.github.com/repos/${GH_REPO}/actions/workflows/deploy.yml/dispatches`, {
    method: "POST",
    headers: { Authorization: `Bearer ${GH_TOKEN}`, Accept: "application/vnd.github+json", "Content-Type": "application/json", "User-Agent": "croxen-labs" },
    body: JSON.stringify({ ref: "main" }),
  });
  return r.ok;
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    const { slug, section } = req.query || {};
    if (!slug || !section || !ok(slug) || !VALID_SECTIONS.includes(section)) return res.status(400).json({ error: "Invalid slug or section" });
    if (!checkSecret(req)) return res.status(403).json({ error: "Unauthorized" });
    if (!GH_TOKEN) return res.status(500).json({ error: "GH_TOKEN not configured" });
    const r = await gh(`/contents/content/${section}/${slug}.md?ref=main`);
    if (!r.ok) return res.status(r.status).json({ error: `GitHub: ${r.text}` });
    return res.status(200).json({ slug, section, content: Buffer.from(r.data.content, "base64").toString("utf-8") });
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!checkSecret(req)) return res.status(403).json({ error: "Unauthorized" });
  if (!GH_TOKEN) return res.status(500).json({ error: "GH_TOKEN not configured" });

  const { action, slug, section, content } = req.body || {};
  if (!slug || !section || !ok(slug) || !VALID_SECTIONS.includes(section)) return res.status(400).json({ error: "Invalid slug or section" });

  const fp = `content/${section}/${slug}.md`;
  const cur = await gh(`/contents/${fp}?ref=main`);
  if (!cur.ok) return res.status(cur.status).json({ error: `GitHub: ${cur.text}` });
  const sha = cur.data.sha;

  if (action === "approve") {
    let body = Buffer.from(cur.data.content, "base64").toString("utf-8");
    const before = body;
    body = body.replace(/^(status:\s*)draft\s*$/m, "$1approved");
    body = body.replace(/^(visibility:\s*)draft\s*$/m, "$1approved");
    if (body === before) return res.status(200).json({ message: "Already approved", slug });
    const c = await ghWrite(fp, body, sha, `Approve: ${section}/${slug}`);
    if (!c.ok) return res.status(c.status).json({ error: `Commit failed: ${c.text}` });
    const deployed = await triggerProdDeploy();
    return res.status(200).json({
      message: deployed ? "Approved! Live on the public site in ~60 seconds." : "Approved! (Prod deploy trigger failed — tell Hermes to run deploy.py prod)",
      slug, section,
      commit: c.data.commit?.sha || "",
    });
  }

  if (action === "edit") {
    if (!content || typeof content !== "string") return res.status(400).json({ error: "Missing content" });
    const c = await ghWrite(fp, content, sha, `Edit: ${section}/${slug}`);
    if (!c.ok) return res.status(c.status).json({ error: `Commit failed: ${c.text}` });
    return res.status(200).json({ message: "Saved. Dev preview updates within 5 minutes.", slug, section, commit: c.data.commit?.sha || "" });
  }

  if (action === "delete") {
    const d = await ghDelete(fp, sha, `Delete: ${section}/${slug}`);
    if (!d.ok) return res.status(d.status).json({ error: `Delete failed: ${d.text}` });
    return res.status(200).json({ message: "Deleted. Dev preview updates within 5 minutes.", slug, section });
  }

  return res.status(400).json({ error: `Unknown action: ${action}` });
}