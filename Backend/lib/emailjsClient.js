// emailjsClient.js
import fetch from 'node-fetch'; // or omit this import on Node18+

const EMAILJS_API = 'https://api.emailjs.com/api/v1.0/email/send';

export async function sendViaEmailJS({ service_id, template_id, user_id, template_params }) {
  if (!service_id || !template_id || !user_id) {
    throw new Error('Missing EmailJS configuration (service_id/template_id/user_id).');
  }

  const body = {
    service_id,
    template_id,
    user_id,
    template_params,
  };

  const res = await fetch(EMAILJS_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    // no credentials required
  });

  if (!res.ok) {
    const text = await res.text().catch(() => null);
    const err = new Error(`EmailJS request failed: ${res.status} ${res.statusText} ${text || ''}`);
    err.status = res.status;
    throw err;
  }

  return res.json();
}
