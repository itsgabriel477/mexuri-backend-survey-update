// middleware/basicAuth.js
import dotenv from 'dotenv';
dotenv.config();

/**
 * Decode a Basic Auth header like "Basic dXNlcjpwYXNz"
 * Returns { user, pass } or null
 */
function parseBasicAuth(header) {
  if (!header || !header.startsWith('Basic ')) return null;
  try {
    const base64 = header.split(' ')[1];
    const decoded = Buffer.from(base64, 'base64').toString('utf8');
    const [user, pass] = decoded.split(':');
    return { user, pass };
  } catch {
    return null;
  }
}

/**
 * Middleware: protect routes with Basic Auth using ADMIN_USER / ADMIN_PASS from .env
 */
export default function basicAuth(req, res, next) {
  const header = req.headers.authorization;
  const creds = parseBasicAuth(header);

  if (!creds) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Admin Area"');
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const expectedUser = process.env.ADMIN_USER;
  const expectedPass = process.env.ADMIN_PASS;

  if (creds.user === expectedUser && creds.pass === expectedPass) {
    req.admin = { user: creds.user };
    return next();
  }

  res.setHeader('WWW-Authenticate', 'Basic realm="Admin Area"');
  return res.status(401).json({ error: 'Unauthorized' });
}
