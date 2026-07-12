// Serverless API: deploy the current dev build to production.
// Vercel auto-detects api/*.js as serverless functions.
//
// POST /api/deploy-design  — requires X-Approve-Secret header
//   Deploys the connected GitHub repo (main branch) to Vercel
//   production, making the current dev design live.
//
// This is the "Approve design" button in the top-right of the dev site.
// It pushes whatever is on dev (templates, CSS, copy) to prod — it does
// NOT touch article approval (that's the per-article Approve button).

const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const VERCEL_PROJECT = process.env.VERCEL_PROJECT || "croxen-knowledge";
const GH_REPO = process.env.GH_REPO || "Croxen/croxen-knowledge";
const APPROVE_SECRET = process.env.APPROVE_SECRET;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (APPROVE_SECRET && req.headers["x-approve-secret"] !== APPROVE_SECRET) {
    return res.status(403).json({ error: "Unauthorized" });
  }
  if (!VERCEL_TOKEN) {
    return res.status(500).json({ error: "VERCEL_TOKEN not configured" });
  }

  try {
    const resp = await fetch("https://api.vercel.com/v13/deployments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${VERCEL_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: VERCEL_PROJECT,
        target: "production",
        gitSource: { repo: GH_REPO, ref: "main" },
      }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      return res.status(resp.status).json({ error: `Deploy failed: ${text}` });
    }
    const data = await resp.json();
    return res.status(200).json({
      message: "Design deployed to production. Live in ~30 seconds.",
      url: data.url,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
