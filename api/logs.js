// API log maintenance mesin - Vercel Serverless Function
// Database: Upstash Redis. Tanpa library tambahan.
const KEY = 'kame:maintenance_logs';
const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

async function redis(cmd) {
  const r = await fetch(REDIS_URL, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + REDIS_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j.error || 'Redis HTTP ' + r.status);
  return j.result;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!REDIS_URL || !REDIS_TOKEN) return res.status(500).json({ error: 'not_configured' });

  const pin = process.env.APP_PIN;
  if (pin && req.headers['x-pin'] !== pin) return res.status(401).json({ error: 'PIN salah' });

  try {
    if (req.method === 'GET') {
      const flat = (await redis(['HGETALL', KEY])) || [];
      const out = [];
      for (let i = 1; i < flat.length; i += 2) {
        try { out.push(JSON.parse(flat[i])); } catch (e) {}
      }
      return res.status(200).json(out);
    }
    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
      const items = (Array.isArray(body) ? body : [body]).filter(l => l && l.id && l.tgl);
      if (!items.length) return res.status(400).json({ error: 'Data tidak valid' });
      const cmd = ['HSET', KEY];
      items.forEach(l => cmd.push(String(l.id), JSON.stringify(l)));
      await redis(cmd);
      return res.status(200).json({ ok: true, saved: items.length });
    }
    if (req.method === 'DELETE') {
      const id = req.query && req.query.id;
      if (!id) return res.status(400).json({ error: 'id diperlukan' });
      await redis(['HDEL', KEY, String(id)]);
      return res.status(200).json({ ok: true });
    }
    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ error: 'Method tidak diizinkan' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
