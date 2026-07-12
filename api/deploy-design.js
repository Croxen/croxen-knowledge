// Serverless API: deploy the current dev design to production.
// Vercel auto-detects api/*.js as serverless functions.
//
// POST /api/deploy-design  — requires X-Approve-Secret header
//   Triggers the GitHub Actions "deploy.yml" workflow (workflow_dispatch),
//   which builds and deploys the current main branch to Vercel production.
//   This makes the current dev design live on the public site.
//
// This is the "Approve design" button in the top-right of the dev site.
// It pushes whatever is on dev (templates, CSS, copy) to prod — it does
// NOT touch article approval (that's the per-article Approve button).

const GH_TOKEN = process.env.GH_TOKEN;
const GH_REPO = process.env.GH_REPO || "Croxen/croxen-knowledge";
const APPROVE_SECRET = process.env.APPROVE_SECRET;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (APPROVE_SECRET && req.headers["x-approve-secret"] !== APPROVE_SECRET) {
    return res.status(403).json({ error: "Unauthorized" });
  }
  if (!GH_TOKEN) {
    return res.status(500).json({ error: "GH_TOKEN not configured" });
  }

  try {
    // Trigger the GitHub Actions workflow that does the real Vercel deploy.
    const resp = await fetch(
      `https://api.github.com/repos/${GH_REPO}/actions/workflows/deploy.yml/dispatches`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GH_TOKEN}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "User-Agent": "croxen-labs",
        },
        body: JSON.stringify({ ref: "main" }),
      }
    );
    if (!resp.ok) {
      const text = await resp.text();
      return res.status(resp.status).json({ error: `Workflow trigger failed: ${text}` });
    }
    return res.status(200).json({
      message: "Production deploy started. Live in ~30–60 seconds.",
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
