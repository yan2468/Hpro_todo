import type { FastifyInstance } from 'fastify';
import { pool } from './db.js';

type TaskInput = {
  title?: string;
  category?: string;
  tags?: string[];
  current?: number;
  total?: number;
  steps?: string; // JSON 字符串：[{"text","done"}]
  parentId?: string | null;
  priority?: string | null;
  note?: string | null;
  sortOrder?: number;
  status?: string;
  reminderAt?: string | null;
};

export async function registerTasks(app: FastifyInstance) {
  // 除 /auth 与 /health 外，所有路由需鉴权
  app.addHook('preHandler', async (req, reply) => {
    if (req.url.startsWith('/auth') || req.url === '/health') return;
    try {
      await req.jwtVerify();
    } catch {
      return reply.code(401).send({ error: 'unauthorized' });
    }
  });

  app.get('/tasks', async (req) => {
    const uid = (req.user as { id: string }).id;
    const r = await pool.query(
      `SELECT * FROM tasks WHERE user_id = $1
       ORDER BY
         CASE WHEN priority IS NULL THEN 1 ELSE 0 END,
         priority ASC,
         sort_order ASC,
         created_at ASC`,
      [uid]
    );
    return r.rows;
  });

  app.post('/tasks', async (req, reply) => {
    const uid = (req.user as { id: string }).id;
    const b = req.body as TaskInput;
    if (!b.title) return reply.code(400).send({ error: 'title required' });
    // 自动计算同父任务 + 同优先级内的排序序号，新任务排在末尾
    const maxSort = await pool.query(
      `SELECT COALESCE(MAX(sort_order), -1) as max FROM tasks
       WHERE user_id = $1 AND parent_id IS NOT DISTINCT FROM $2 AND priority IS NOT DISTINCT FROM $3`,
      [uid, b.parentId ?? null, b.priority ?? null]
    );
    const sortOrder = b.sortOrder ?? ((maxSort.rows[0].max ?? -1) + 1);
    const r = await pool.query(
      `INSERT INTO tasks(user_id, parent_id, title, category, tags, current, total, steps, priority, note, sort_order, status, reminder_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [
        uid,
        b.parentId ?? null,
        b.title,
        b.category ?? 'main',
        b.tags ?? [],
        b.current ?? 0,
        b.total ?? 0,
        b.steps ?? '[]',
        b.priority ?? null,
        b.note ?? '',
        sortOrder,
        b.status ?? 'active',
        b.reminderAt ?? null,
      ]
    );
    return r.rows[0];
  });

  app.put('/tasks/:id', async (req, reply) => {
    const uid = (req.user as { id: string }).id;
    const { id } = req.params as { id: string };
    const b = req.body as TaskInput;
    const map: Record<string, unknown> = { ...b };
    if ('reminderAt' in map) {
      map.reminder_at = map.reminderAt;
      delete map.reminderAt;
    }
    if ('parentId' in map) {
      map.parent_id = map.parentId;
      delete map.parentId;
    }
    if ('sortOrder' in map) {
      map.sort_order = map.sortOrder;
      delete map.sortOrder;
    }
    const cols = [
      'title',
      'category',
      'tags',
      'current',
      'total',
      'steps',
      'parent_id',
      'priority',
      'note',
      'sort_order',
      'status',
      'reminder_at',
    ];
    const sets = cols.filter((c) => c in map).map((c, i) => `${c} = $${i + 2}`);
    if (!sets.length) return reply.code(400).send({ error: 'nothing to update' });
    const vals = cols.filter((c) => c in map).map((c) => map[c]);
    const r = await pool.query(
      `UPDATE tasks SET ${sets.join(', ')}, updated_at = now()
       WHERE id = $1 AND user_id = $${sets.length + 2} RETURNING *`,
      [id, ...vals, uid]
    );
    if (!r.rows.length) return reply.code(404).send({ error: 'not found' });
    return r.rows[0];
  });

  app.delete('/tasks/:id', async (req, reply) => {
    const uid = (req.user as { id: string }).id;
    const { id } = req.params as { id: string };
    const r = await pool.query(
      'DELETE FROM tasks WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, uid]
    );
    if (!r.rows.length) return reply.code(404).send({ error: 'not found' });
    return { ok: true };
  });
}
