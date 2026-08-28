import type { FastifyInstance } from 'fastify';
import { pool } from './db.js';

/** 东八区 'YYYY-MM-DD' 格式化（pg 把 DATE 解析成 UTC 午夜，JSON 后可能少一天） */
function fmtDate(v: unknown): string {
  if (!v) return '';
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v).slice(0, 10);
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(d)
    .replace(/\//g, '-');
}

function normalize(row: Record<string, unknown>) {
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    salary: Number(row.salary ?? 0),
    otherCosts: Array.isArray(row.other_costs) ? row.other_costs : [],
    validFrom: fmtDate(row.valid_from),
    validTo: row.valid_to ? fmtDate(row.valid_to) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeExtra(row: Record<string, unknown>) {
  return {
    id: row.id,
    userId: row.user_id,
    costId: row.cost_id,
    costDate: fmtDate(row.cost_date),
    amount: Number(row.amount ?? 0),
    note: row.note ?? '',
    createdAt: row.created_at,
  };
}

function ymd(v: unknown): string {
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  return '';
}

type CostInput = {
  name?: string;
  salary?: number;
  otherCosts?: { label: string; amount: number }[];
  validFrom?: string;
  validTo?: string | null;
};

export async function registerCosts(app: FastifyInstance) {
  app.get('/costs', async (req) => {
    const uid = (req.user as { id: string }).id;
    const r = await pool.query(
      'SELECT * FROM employee_costs WHERE user_id = $1 ORDER BY created_at',
      [uid]
    );
    return r.rows.map(normalize);
  });

  app.post('/costs', async (req, reply) => {
    const uid = (req.user as { id: string }).id;
    const b = req.body as CostInput;
    if (!b.name?.trim()) return reply.code(400).send({ error: 'name required' });
    const salary = Number(b.salary ?? 0);
    if (Number.isNaN(salary) || salary < 0) return reply.code(400).send({ error: 'salary invalid' });
    const otherCosts = Array.isArray(b.otherCosts) ? b.otherCosts : [];
    const r = await pool.query(
      `INSERT INTO employee_costs(user_id, name, salary, other_costs, valid_from, valid_to)
       VALUES($1,$2,$3,$4::jsonb,$5,$6) RETURNING *`,
      [
        uid,
        b.name.trim(),
        salary,
        JSON.stringify(otherCosts),
        b.validFrom || fmtDate(new Date()),
        b.validTo || null,
      ]
    );
    return normalize(r.rows[0]);
  });

  // ===== 按天补录的其他花费（必须在 /costs/:id 之前注册，避免被当成 id）=====
  app.get('/costs/extras', async (req) => {
    const uid = (req.user as { id: string }).id;
    const q = req.query as { from?: string; to?: string };
    const conds = ['user_id = $1'];
    const vals: unknown[] = [uid];
    if (ymd(q.from)) {
      conds.push(`cost_date >= $${vals.length + 1}`);
      vals.push(q.from);
    }
    if (ymd(q.to)) {
      conds.push(`cost_date <= $${vals.length + 1}`);
      vals.push(q.to);
    }
    const r = await pool.query(
      `SELECT * FROM cost_extras WHERE ${conds.join(' AND ')} ORDER BY cost_date DESC, created_at DESC`,
      vals
    );
    return r.rows.map(normalizeExtra);
  });

  app.post('/costs/extras', async (req, reply) => {
    const uid = (req.user as { id: string }).id;
    const b = req.body as { costId?: string; costDate?: string; amount?: number; note?: string };
    if (!b.costId) return reply.code(400).send({ error: 'costId required' });
    const costDate = ymd(b.costDate);
    if (!costDate) return reply.code(400).send({ error: 'costDate required (YYYY-MM-DD)' });
    const amount = Number(b.amount ?? 0);
    if (Number.isNaN(amount) || amount < 0) return reply.code(400).send({ error: 'amount invalid' });
    // 校验该 cost 属于当前用户
    const own = await pool.query('SELECT id FROM employee_costs WHERE id = $1 AND user_id = $2', [
      b.costId,
      uid,
    ]);
    if (!own.rows.length) return reply.code(404).send({ error: 'employee not found' });
    const r = await pool.query(
      `INSERT INTO cost_extras(user_id, cost_id, cost_date, amount, note)
       VALUES($1,$2,$3,$4,$5) RETURNING *`,
      [uid, b.costId, costDate, amount, (b.note || '').slice(0, 200)]
    );
    return normalizeExtra(r.rows[0]);
  });

  app.delete('/costs/extras/:id', async (req, reply) => {
    const uid = (req.user as { id: string }).id;
    const { id } = req.params as { id: string };
    const r = await pool.query(
      'DELETE FROM cost_extras WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, uid]
    );
    if (!r.rows.length) return reply.code(404).send({ error: 'not found' });
    return { ok: true };
  });

  app.get('/costs/:id', async (req, reply) => {
    const uid = (req.user as { id: string }).id;
    const { id } = req.params as { id: string };
    const r = await pool.query('SELECT * FROM employee_costs WHERE id = $1 AND user_id = $2', [id, uid]);
    if (!r.rows.length) return reply.code(404).send({ error: 'not found' });
    return normalize(r.rows[0]);
  });

  app.put('/costs/:id', async (req, reply) => {
    const uid = (req.user as { id: string }).id;
    const { id } = req.params as { id: string };
    const b = req.body as CostInput;
    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 2;
    if (b.name !== undefined) {
      sets.push(`name = $${i++}`);
      vals.push(b.name.trim());
    }
    if (b.salary !== undefined) {
      const salary = Number(b.salary);
      if (Number.isNaN(salary) || salary < 0) return reply.code(400).send({ error: 'salary invalid' });
      sets.push(`salary = $${i++}`);
      vals.push(salary);
    }
    if (b.otherCosts !== undefined) {
      const otherCosts = Array.isArray(b.otherCosts) ? b.otherCosts : [];
      sets.push(`other_costs = $${i++}::jsonb`);
      vals.push(JSON.stringify(otherCosts));
    }
    if (b.validFrom !== undefined) {
      sets.push(`valid_from = $${i++}`);
      vals.push(b.validFrom || fmtDate(new Date()));
    }
    if (b.validTo !== undefined) {
      sets.push(`valid_to = $${i++}`);
      vals.push(b.validTo || null);
    }
    if (!sets.length) return reply.code(400).send({ error: 'nothing to update' });
    const r = await pool.query(
      `UPDATE employee_costs SET ${sets.join(', ')}, updated_at = now()
       WHERE id = $1 AND user_id = $${i} RETURNING *`,
      [id, ...vals, uid]
    );
    if (!r.rows.length) return reply.code(404).send({ error: 'not found' });
    return normalize(r.rows[0]);
  });

  app.delete('/costs/:id', async (req, reply) => {
    const uid = (req.user as { id: string }).id;
    const { id } = req.params as { id: string };
    // 先删关联补录
    await pool.query('DELETE FROM cost_extras WHERE cost_id = $1 AND user_id = $2', [id, uid]);
    const r = await pool.query(
      'DELETE FROM employee_costs WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, uid]
    );
    if (!r.rows.length) return reply.code(404).send({ error: 'not found' });
    return { ok: true };
  });
}
