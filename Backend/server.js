// server.js
import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import cors from 'cors';

// Local imports (ESM paths must include .js extension)
import basicAuth from './middleware/basicAuth.js';
import adminSurveys from './routes/adminSurveys.js';
import surveys from './routes/surveys.js'; // Public survey POST route

const app = express();

// 🧱 Security middleware
app.use(helmet());

// 🌐 CORS setup (optional)
if (process.env.ENABLE_CORS === 'true') {
  const allowed = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const corsOptions = allowed.length ? { origin: allowed } : {};
  app.use(cors(corsOptions));
}

// 🧩 Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// 🧾 Logging
app.use(morgan('combined'));

// ⚙️ Global rate limiter (for all routes)
const globalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 200, // requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(globalLimiter);

// 📥 Stricter limiter for public survey submissions
const surveyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30, // max submissions per IP per hour
  message: { error: 'Too many submissions from this IP, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// 🧭 Routes
app.use('/api/surveys', surveyLimiter, surveys); // POST from your React form
app.use('/api/admin/surveys', basicAuth, adminSurveys); // Admin view + delete

// 🩺 Health check (optional)
app.get('/health', (req, res) => {
  const emailjsConfigured = !!(
    process.env.EMAILJS_SERVICE_ID &&
    process.env.EMAILJS_TEMPLATE_ID &&
    process.env.EMAILJS_USER_ID
  );
  res.json({
    status: 'ok',
    emailjs_enabled: emailjsConfigured,
    node_env: process.env.NODE_ENV || 'development',
  });
});

// 🚫 404 fallback
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// 🧨 Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Server error' });
});

console.log('DB config (from env):', {
  DB_HOST: process.env.DB_HOST,
  DB_USER: process.env.DB_USER,
  DB_NAME: process.env.DB_NAME,
  NODE_ENV: process.env.NODE_ENV || 'development'
});


// 🚀 Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  const emailjsConfigured = !!(
    process.env.EMAILJS_SERVICE_ID &&
    process.env.EMAILJS_TEMPLATE_ID &&
    process.env.EMAILJS_USER_ID
  );
  console.log(`✅ Server listening on port ${PORT} (EmailJS configured: ${emailjsConfigured})`);
});
