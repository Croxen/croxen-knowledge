// Serverless API: trigger production redeploy via GitHub Actions.
// POST /api/redeploy-prod — requires X-Approve-Secret header
// Used by the "Redeploy production" button on the dev site.

const GH_TOKEN = process.env.GH_TOKEN;
const GH_REPO = process.env.GH_REPO || "Croxen/croxen-knowledge";
const APPROVE_SECRET = process.env.APPROVE_SECRET;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (APPROVE_SECRET && req.headers["x-approve-secret"] !== APPROVE_SECRET) return res.status(403).json({ error: "Unauthorized" });
  if (!GH_TOKEN) return res.status(500).json({ error: "GH_TOKEN not configured" });

  const r = await fetch(`https://api.github.com/repos/${GH_REPO}/actions/workflows/deploy.yml/dispatches`, {
    method: "POST",
    headers: { Authorization: `Bearer ${GH_TOKEN}`, Accept: "application/vnd.github+json", "Content-Type": "application/json", "User-Agent": "croxen-labs" },
    body: JSON.stringify({ ref: "main" }),
  });
  if (!r.ok) { const t = await r.text(); return res.status(r.status).json({ error: t }); }
  return res.status(200).json({ message: "Production redeploy started. Live in ~60 seconds." });
}