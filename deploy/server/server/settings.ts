import type { FastifyInstance } from 'fastify';
import { pool } from './db.js';

export async function registerSettings(app: FastifyInstance) {
  app.get('/settings', async (req) => {
    const uid = (req.user as { id: string }).id;
    const r = await pool.query(
      'SELECT s_key, s_value FROM user_settings WHERE user_id = $1',
      [uid]
    );
    const out: Record<string, string> = {};
    for (const row of r.rows) {
      out[row.s_key as string] = row.s_value as string;
    }
    return out;
  });

  app.put('/settings', async (req, reply) => {
    const uid = (req.user as { id: string }).id;
    const body = req.body as Record<string, string>;
    if (!body || typeof body !== 'object') {
      return reply.code(400).send({ error: 'invalid body' });
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const [key, value] of Object.entries(body)) {
        await client.query(
          `INSERT INTO user_settings(user_id, s_key, s_value, updated_at)
           VALUES($1, $2, $3, now())
           ON CONFLICT (user_id, s_key)
           DO UPDATE SET s_value = EXCLUDED.s_value, updated_at = now()`,
          [uid, key, value]
        );
      }
      await client.query('COMMIT');
      return { ok: true };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  });
}
