import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { pool } from './db.js';

export async function registerAuth(app: FastifyInstance) {
  app.post('/auth/register', async (req, reply) => {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) {
      return reply.code(400).send({ error: 'email and password required' });
    }
    const hash = await bcrypt.hash(password, 10);
    try {
      const r = await pool.query(
        'INSERT INTO users(email, password_hash) VALUES($1, $2) RETURNING id, email',
        [email, hash]
      );
      const user = r.rows[0];
      const token = app.jwt.sign({ id: user.id, email: user.email });
      return { token, user: { id: user.id, email: user.email } };
    } catch (e: any) {
      if (e.code === '23505') return reply.code(409).send({ error: 'email already registered' });
      throw e;
    }
  });

  app.post('/auth/login', async (req, reply) => {
    const { email, password } = req.body as { email?: string; password?: string };
    const r = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = r.rows[0];
    if (!user || !(await bcrypt.compare(password ?? '', user.password_hash))) {
      return reply.code(401).send({ error: 'invalid credentials' });
    }
    const token = app.jwt.sign({ id: user.id, email: user.email });
    return { token, user: { id: user.id, email: user.email } };
  });
}
