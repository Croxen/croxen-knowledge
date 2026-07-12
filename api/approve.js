// Serverless API endpoint for approving draft articles.
// Vercel automatically detects api/*.js as serverless functions.
//
// POST /api/approve
// Body: {"slug": "article-slug", "section": "experiments"}
// Header: X-Approve-Secret: <secret>
//
// This endpoint:
// 1. Fetches the Markdown file from the GitHub repo
// 2. Updates the front matter from status: draft to status: approved
// 3. Commits the change back to GitHub (triggers a prod rebuild via Vercel)

const GH_TOKEN = process.env.GH_TOKEN;
const GH_REPO = process.env.GH_REPO || "Croxen/croxen-knowledge";
const APPROVE_SECRET = process.env.APPROVE_SECRET;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { slug, section } = req.body || {};

  // Validate
  if (!slug || !section) {
    return res.status(400).json({ error: "Missing slug or section" });
  }
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return res.status(400).json({ error: "Invalid slug format" });
  }
  if (!["learning", "experiments", "guides"].includes(section)) {
    return res.status(400).json({ error: "Invalid section" });
  }

  // Check secret if configured
  if (APPROVE_SECRET) {
    const auth = req.headers["x-approve-secret"];
    if (auth !== APPROVE_SECRET) {
      return res.status(403).json({ error: "Unauthorized" });
    }
  }

  if (!GH_TOKEN) {
    return res.status(500).json({ error: "GH_TOKEN not configured" });
  }

  const filePath = `content/${section}/${slug}.md`;
  const apiUrl = `https://api.github.com/repos/${GH_REPO}/contents/${filePath}?ref=main`;

  // 1. Fetch the file from GitHub
  let fileData;
  try {
    const resp = await fetch(apiUrl, {
      headers: {
        Authorization: `Bearer ${GH_TOKEN}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "croxen-labs-approve",
      },
    });
    if (!resp.ok) {
      const errText = await resp.text();
      return res.status(resp.status).json({ error: `GitHub API: ${errText}` });
    }
    fileData = await resp.json();
  } catch (err) {
    return res.status(500).json({ error: `Failed to fetch file: ${err.message}` });
  }

  // 2. Decode and update the content
  const content = Buffer.from(fileData.content, "base64").toString("utf-8");
  const sha = fileData.sha;

  // Replace status: draft → status: approved
  let updatedContent = content.replace(
    /^(status:\s*)draft\s*$/m,
    "$1approved"
  );
  // Also update visibility: draft → visibility: approved
  updatedContent = updatedContent.replace(
    /^(visibility:\s*)draft\s*$/m,
    "$1approved"
  );

  // Check if anything changed
  if (updatedContent === content) {
    return res.status(200).json({ message: "Article was already approved", slug });
  }

  // 3. Commit the updated file back to GitHub
  const encodedContent = Buffer.from(updatedContent, "utf-8").toString("base64");
  try {
    const resp = await fetch(apiUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${GH_TOKEN}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": "croxen-labs-approve",
      },
      body: JSON.stringify({
        message: `Approve: ${section}/${slug}`,
        content: encodedContent,
        sha,
        branch: "main",
      }),
    });
    if (!resp.ok) {
      const errText = await resp.text();
      return res.status(resp.status).json({ error: `GitHub commit failed: ${errText}` });
    }
    const result = await resp.json();
    return res.status(200).json({
      message: "Article approved! Production deploy triggered.",
      slug,
      section,
      commit: result.commit?.sha || "",
    });
  } catch (err) {
    return res.status(500).json({ error: `Failed to commit: ${err.message}` });
  }
}
