// Serverless API: deploy a fresh preview build with DEV_MODE=1.
// Vercel auto-detects api/*.js as serverless functions.
//
// POST /api/deploy-dev  — requires X-Approve-Secret header
//   Triggers a Vercel preview deployment that builds with DEV_MODE=1,
//   so draft articles are included, then aliases it to the stable
//   dev-croxen-labs.vercel.app URL.
//
// Used by the weekly content cron after it pushes new draft articles,
// so they show up on the dev review site without manual intervention.

const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const VERCEL_PROJECT = process.env.VERCEL_PROJECT || "croxen-knowledge";
const GH_REPO = process.env.GH_REPO || "Croxen/croxen-knowledge";
const GH_REPO_ID = process.env.VERCEL_REPO_ID || "1298092585";
const DEV_ALIAS = process.env.DEV_ALIAS || "dev-croxen-labs";
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
    // 1. Create preview deployment with DEV_MODE build env
    const resp = await fetch("https://api.vercel.com/v13/deployments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${VERCEL_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: VERCEL_PROJECT,
        target: "preview",
        gitSource: { type: "github", repo: GH_REPO, repoId: GH_REPO_ID, ref: "main" },
        build: { env: { DEV_MODE: "1" } },
      }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      return res.status(resp.status).json({ error: `Deploy failed: ${text}` });
    }
    const data = await resp.json();
    const previewUrl = data.url;

    // 2. Alias to stable dev URL
    const aliasResp = await fetch(
      `https://api.vercel.com/v2/aliases/${previewUrl}/${DEV_ALIAS}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${VERCEL_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }
    );
    // Alias failure is non-fatal — preview URL still works

    return res.status(200).json({
      message: "Dev preview rebuilt with drafts. Ready to review.",
      preview: previewUrl,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
