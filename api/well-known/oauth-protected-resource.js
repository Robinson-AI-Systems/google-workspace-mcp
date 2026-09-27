export default function handler(req, res) {
  const base = (process.env.PUBLIC_BASE_URL || `https://${req.headers.host}`).replace(/\/$/, '');
  res.status(200).json({
    resource: `${base}/api/mcp`,
    authorization_servers: [base]
  });
}
