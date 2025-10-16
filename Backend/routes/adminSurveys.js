// routes/adminSurveys.js
import express from 'express';
import pool from '../db.js';

const router = express.Router();

// GET /api/admin/surveys?page,limit,search
router.get('/', async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const limit = Math.min(100, parseInt(req.query.limit || '20', 10));
  const offset = (page - 1) * limit;
  const search = (req.query.search || '').trim();

  // Build SQL and parameter arrays separately for count and data queries
  let countSql = 'SELECT COUNT(*) as cnt FROM surveys';
  let dataSql = `
    SELECT id, brand_name, brand_service, description, responses, is_submitted, submitted_at
    FROM surveys
  `;
  const countParams = [];
  const dataParams = [];

  if (search) {
    const like = `%${search}%`;
    const likeClause = ' WHERE brand_name LIKE ? OR brand_service LIKE ? OR description LIKE ?';
    countSql += likeClause;
    dataSql += likeClause;
    countParams.push(like, like, like);
    dataParams.push(like, like, like);
  }

  dataSql += ' ORDER BY submitted_at DESC, id DESC LIMIT ? OFFSET ?';
  dataParams.push(limit, offset);

  let conn;
  try {
    conn = await pool.getConnection();

    // run count query with countParams
    const [countRows] = await conn.query(countSql, countParams);
    const total = (countRows && countRows[0] && countRows[0].cnt) ? countRows[0].cnt : 0;

    // run data query with dataParams
    const [rows] = await conn.query(dataSql, dataParams);

    return res.json({
      items: rows,
      total,
      page,
      limit,
    });
  } catch (err) {
    // verbose logging for debugging (remove or reduce in production)
    console.error('GET /api/admin/surveys error (detailed):', {
      message: err?.message,
      code: err?.code,
      errno: err?.errno,
      sqlMessage: err?.sqlMessage,
      sqlState: err?.sqlState,
      sql: err?.sql,
      query: req.query,
      stack: err?.stack && err.stack.split('\n').slice(0,6).join('\n'),
    });
    return res.status(500).json({ error: 'Failed to fetch surveys' });
  } finally {
    if (conn) {
      try { conn.release(); } catch (e) { console.warn('Failed to release DB connection', e); }
    }
  }
});

// GET /api/admin/surveys/:id
router.get('/:id', async (req, res) => {
  const id = req.params.id;
  let conn;
  try {
    conn = await pool.getConnection();
    const [rows] = await conn.query('SELECT * FROM surveys WHERE id = ? LIMIT 1', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    return res.json(rows[0]);
  } catch (err) {
    console.error('GET /api/admin/surveys/:id error (detailed):', {
      message: err?.message,
      code: err?.code,
      sqlMessage: err?.sqlMessage,
      sql: err?.sql,
      params: { id },
      stack: err?.stack && err.stack.split('\n').slice(0,6).join('\n'),
    });
    return res.status(500).json({ error: 'Failed to fetch survey detail' });
  } finally {
    if (conn) {
      try { conn.release(); } catch (e) {}
    }
  }
});

// DELETE /api/admin/surveys/:id
router.delete('/:id', async (req, res) => {
  const id = req.params.id;
  let conn;
  try {
    conn = await pool.getConnection();
    const [result] = await conn.query('DELETE FROM surveys WHERE id = ?', [id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Not found' });
    return res.json({ deletedId: id });
  } catch (err) {
    console.error('DELETE /api/admin/surveys/:id error (detailed):', {
      message: err?.message,
      code: err?.code,
      sqlMessage: err?.sqlMessage,
      sql: err?.sql,
      params: { id },
      stack: err?.stack && err.stack.split('\n').slice(0,6).join('\n'),
    });
    return res.status(500).json({ error: 'Failed to delete survey' });
  } finally {
    if (conn) {
      try { conn.release(); } catch (e) {}
    }
  }
});

export default router;
