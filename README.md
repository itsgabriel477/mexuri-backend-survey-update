# Backend — Survey & Admin Survey (README)

> This README explains what was implemented in the backend to support the public **Survey** page and the **Admin Survey** pages of the site. It covers architecture, routes, database schema, environment variables, sample queries and troubleshooting tips.

---

## Table of contents

1. Project overview
2. Architecture & tech stack
3. Important environment variables
4. Database schema (MySQL / phpMyAdmin friendly)
5. API endpoints (public + admin)
6. Authentication & admin access
7. Example queries / seed data
8. How to run locally and connect to hosted DB
9. Error handling & common fixes
10. Tests & data validation
11. Notes & next steps

---

## 1. Project overview

The backend exposes a small REST API to:

* Serve the public **Survey** form and accept submissions.
* Provide the **Admin Survey** pages with paginated, searchable lists of survey submissions and admin-only management operations (view/delete/export).

Design goals:

* Minimal, easy-to-maintain Express routes.
* Portable SQL schema that works with MySQL and can be managed with phpMyAdmin.
* Simple admin authentication (basic username/password for admin pages).
* Clear error handling and pagination for admin listing.

---

## 2. Architecture & tech stack

* Node.js + Express (server)
* MySQL (or MariaDB) as relational store — accessible via phpMyAdmin when hosted
* `mysql2` or `mysql` Node package for DB connection (prefer `mysql2`)
* Optional: `dotenv` for environment variables
* Admin pages use the same API but require admin credentials

Example minimal `db.js` helper (connection pool):

```js
// db.js
const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
});

module.exports = { pool };
```

Use `pool.query(...)` in your route handlers.

---

## 3. Important environment variables

Put these in your `.env` (do NOT commit credentials):

```
# Database
DB_HOST=your-db-host.example.com
DB_PORT=3306
DB_USER=db_user
DB_PASS=supersecret
DB_NAME=mexuri_survey

# Admin (simple basic auth)
ADMIN_USER=admin
ADMIN_PASS=adminpassword

# Optional
PORT=4000
NODE_ENV=development
```

If using a hosted DB (cPanel / phpMyAdmin), `DB_HOST` will be the host given by the hosting provider (often an IP address or `localhost` if the DB is on the same server). If connecting remotely, the host may be the public IP and remote access must be allowed.

---

## 4. Database schema (MySQL)

The schema below is intentionally simple and works well with phpMyAdmin.

```sql
-- surveys table (survey definitions, optional if you only accept free-form submissions)
CREATE TABLE IF NOT EXISTS surveys (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- responses table (actual submissions)
CREATE TABLE IF NOT EXISTS responses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  survey_id INT NOT NULL,
  respondent_name VARCHAR(255),
  respondent_email VARCHAR(255),
  payload JSON,           -- stores answers as JSON (MySQL 5.7+ supports JSON)
  ip_address VARCHAR(45), -- store IPv4/IPv6
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE
);

-- admin users (for simple username/password admin auth)
CREATE TABLE IF NOT EXISTS admin_users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

> If your MySQL version doesn't support `JSON`, change `payload JSON` to `payload TEXT` and store stringified JSON.

---

## 5. API endpoints

### Public endpoints

* `POST /api/surveys/:id/submit`

  * Accepts survey submission for survey with id `:id`.
  * Body example (JSON):

    ```json
    {
      "respondent_name": "Jane Doe",
      "respondent_email": "jane@example.com",
      "answers": { "q1": "Yes", "q2": "No", "q3": "Some text" }
    }
    ```
  * Server action: validate payload, insert into `responses` (store `answers` into `payload`), return 201 + created record id.

* `POST /api/surveys` (optional)

  * Create a survey definition.

### Admin endpoints (require admin auth)

* `GET /api/admin/surveys` — list submissions (paginated & searchable)

  * Query params: `page` (default 1), `limit` (default 20), `search` (optional text to search in name/email/payload)
  * Example: `/api/admin/surveys?page=1&limit=20&search=Jane`

* `GET /api/admin/surveys/:responseId` — get one submission details

* `DELETE /api/admin/surveys/:responseId` — delete a submission

* `GET /api/admin/surveys/export` — (optional) export CSV of submissions

Implementation notes for pagination + search:

* Use `LIMIT ? OFFSET ?` and a `WHERE` clause when `search` is provided (search `respondent_name`, `respondent_email`, `payload`).
* Return pagination metadata: currentPage, totalPages, totalCount.

Example count + list query:

```sql
SELECT COUNT(*) as total FROM responses WHERE (respondent_name LIKE ? OR respondent_email LIKE ? OR payload LIKE ?);
SELECT id, survey_id, respondent_name, respondent_email, created_at
FROM responses
WHERE (respondent_name LIKE ? OR respondent_email LIKE ? OR payload LIKE ?)
ORDER BY created_at DESC
LIMIT ? OFFSET ?;
```

---

## 6. Authentication & admin access

For quick setup the backend uses a simple admin username/password check (Basic Auth or a small middleware) — not recommended for production without HTTPS.

Example middleware (very simple):

```js
// adminAuth.js
module.exports = function (req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: 'Missing auth' });

  // Basic <base64(user:pass)>
  const base64 = authHeader.split(' ')[1] || '';
  const [user, pass] = Buffer.from(base64, 'base64').toString().split(':');

  if (user === process.env.ADMIN_USER && pass === process.env.ADMIN_PASS) return next();
  return res.status(403).json({ message: 'Forbidden' });
};
```

For better security: store password hashes in `admin_users`, use bcrypt, and serve admin routes over HTTPS.

---

## 7. Example queries & seed data

### SQL: seed a survey + sample responses

```sql
INSERT INTO surveys (title, description) VALUES ('Customer Satisfaction', 'Short feedback survey');

-- Insert sample responses (payload as JSON string)
INSERT INTO responses (survey_id, respondent_name, respondent_email, payload, ip_address)
VALUES
(1, 'Alice', 'alice@example.com', JSON_OBJECT('q1','Yes','q2','No','q3','Loves it'), '203.0.113.5'),
(1, 'Bob', 'bob@example.com', JSON_OBJECT('q1','No','q2','Yes','q3','Needs improvement'), '198.51.100.23');

-- Admin user (if using admin_users table & bcrypt omitted for example only)
INSERT INTO admin_users (username, password_hash) VALUES ('admin', '$2b$10$examplehashhere');
```

If you don't have `JSON_OBJECT`, use a string for payload:

```sql
INSERT INTO responses (survey_id, respondent_name, respondent_email, payload, ip_address)
VALUES (1, 'Test', 't@t.com', '{"q1":"Yes","q2":"No"}', '127.0.0.1');
```

---

## 8. How to run locally and connect to hosted DB

1. Install dependencies

```bash
npm install
```

2. Create `.env` with database credentials (see section 3).

3. Ensure remote DB allows connections from your IP (if connecting from your laptop). For many shared hosts, remote MySQL access is disabled — you can use phpMyAdmin on the host to run migration SQL.

4. Run migrations (paste the SQL from section 4 into phpMyAdmin or run via CLI):

```bash
# if you have mysql client configured
mysql -u $DB_USER -p -h $DB_HOST $DB_NAME < migrations.sql
```

5. Start server

```bash
npm run dev # or node server.js
```

6. Test API

```bash
curl -X POST http://localhost:4000/api/surveys/1/submit \
  -H 'Content-Type: application/json' \
  -d '{"respondent_name":"Test","respondent_email":"t@t.com","answers":{"q1":"Yes"}}'
```

For admin listing (example):

```bash
curl -u admin:adminpassword 'http://localhost:4000/api/admin/surveys?page=1&limit=20'
```

---

## 9. Error handling & common fixes

* `ECONNREFUSED` when calling MySQL:

  * DB host/port incorrect. Confirm `DB_HOST` and `DB_PORT`.
  * MySQL server not running or not reachable from your machine. If hosted on cPanel, you may need to allow remote access or run queries via phpMyAdmin.
  * Firewall blocking the port.

* Empty error message in stack traces:

  * Add logging to your catch blocks to show `err.message` and `err.stack`.

* `500 Internal Server Error` when frontend fetches the admin list:

  * Check server logs for thrown exceptions.
  * Confirm admin middleware is not rejecting requests silently (make it return an informative JSON error).

* JSON column errors:

  * If the server tries to insert JS object into a non-JSON column, stringify before insert: `JSON.stringify(answers)`.

---

## 10. Tests & data validation

* Validate required fields on the server (`respondent_email` format, mandatory answers) before inserting.
* Use parameterized queries (prepared statements) to avoid SQL injection.
* Example validation middleware (very small):

```js
function validateSubmission(req, res, next) {
  const { respondent_email, answers } = req.body;
  if (!respondent_email) return res.status(400).json({ message: 'Email required' });
  if (!answers || typeof answers !== 'object') return res.status(400).json({ message: 'Answers required' });
  next();
}
```

---

## 11. Notes & next steps

* Export functionality: add `/api/admin/surveys/export` to return CSV and support download in admin UI.
* Use hashed passwords and a proper session or token system for admin (JWT or sessions) if you want persistent admin sessions.
* Add rate limiting for public endpoints to reduce spam submissions.
* Consider reCAPTCHA if spam is an issue.
* If you plan to host front-end and back-end separately, set `CORS` appropriately on the backend and secure the admin endpoints.

---

If you'd like, I can also:

* Provide the exact SQL file (`migrations.sql`) containing table CREATE statements and seed data.
* Produce a short Express route file (`routes/surveys.js`) with the exact implementation of the endpoints above.

*— End of README*
# Mexuri-modified-AdminPage-
