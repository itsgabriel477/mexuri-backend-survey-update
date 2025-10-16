// routes/surveys.js
import express from 'express';
import axios from 'axios';
import pool from '../db.js';

const router = express.Router();
const EMAILJS_API = 'https://api.emailjs.com/api/v1.0/email/send';

/**
 * Send a minimal notification via EmailJS (server-side)
 * - Only sends a tiny message identifying the survey id and brand_name (no PII or full answers)
 * - Logs success/failure; does NOT throw so it won't break the client response
 */
async function sendEmailNotification({ insertedId, brandName }) {
  const serviceId = process.env.EMAILJS_SERVICE_ID;
  const templateId = process.env.EMAILJS_TEMPLATE_ID;
  const userId = process.env.EMAILJS_USER_ID;

  if (!serviceId || !templateId || !userId) {
    console.warn('EmailJS credentials not configured; skipping notification');
    return;
  }

  const templateParams = {
    survey_id: String(insertedId),
    brand_name: brandName || 'N/A',
    message: `A new survey was submitted (id: ${insertedId}).`,
    submitted_at: new Date().toISOString(),
  };

  const body = {
    service_id: serviceId,
    template_id: templateId,
    user_id: userId,
    template_params: templateParams,
  };

  try {
    const resp = await axios.post(EMAILJS_API, body, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 8000,
    });
    console.log(`EmailJS notification sent for survey ${insertedId} (status ${resp.status})`);
  } catch (err) {
    console.error('EmailJS notify error', err?.response?.data || err.message || err);
  }
}

/**
 * POST /api/surveys
 * - Expects JSON payload from the frontend
 * - Validates minimally, inserts into surveys, returns { id }
 * - Fires off a minimal EmailJS notification (no survey content)
 */
router.post('/', async (req, res) => {
  const {
    brand_name = null,
    brand_service = null,
    target_audience = null,
    business_why = null,
    customer_impression = null,
    contact = null,
    submitted_at = null,
  } = req.body || {};

  // Basic validation: require at least one non-empty field (tweak as needed)
  if (
    !brand_service &&
    !target_audience &&
    !business_why &&
    !customer_impression &&
    !contact &&
    !brand_name
  ) {
    return res.status(400).json({ error: 'At least one field is required' });
  }

  const conn = await pool.getConnection();
  try {
    const insertSql = `
      INSERT INTO surveys
        (brand_name, brand_service, description, responses, is_submitted, submitted_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, NOW())
    `;

    // store the additional fields in 'responses' as JSON string (adapt if your DB has JSON type)
    const responses = JSON.stringify({
      target_audience,
      business_why,
      customer_impression,
      contact,
    });

    // For 'description' we reuse brand_service (adjust if your schema differs)
    const [result] = await conn.query(insertSql, [
      brand_name,
      brand_service,
      brand_service,
      responses,
      1, // is_submitted
      submitted_at || new Date(),
    ]);

    const insertedId = result.insertId;

    // respond to client immediately
    res.status(201).json({ id: insertedId });

    // fire-and-forget notification (do not await; function handles its own errors)
    sendEmailNotification({ insertedId, brandName: brand_name }).catch((e) =>
      console.error('Unexpected error sending EmailJS notification', e)
    );
  } catch (err) {
    console.error('POST /api/surveys error', err);
    // send safe error to client
    res.status(500).json({ error: 'Failed to save survey' });
  } finally {
    try {
      conn.release();
    } catch (releaseErr) {
      console.warn('Failed to release DB connection', releaseErr);
    }
  }
});

export default router;
