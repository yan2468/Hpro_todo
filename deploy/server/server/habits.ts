import type { FastifyInstance } from 'fastify';
import { pool } from './db.js';

/**
 * 将 PostgreSQL 返回的 DATE/TIMESTAMPTZ 格式化为东八区 'YYYY-MM-DD'。
 * pg 驱动会把 DATE 解析成 JS Date（UTC 午夜），JSON 序列化后可能少一天，
 * 因此必须按目标时区手动格式化后再返回给前端。
 */
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

function normalizeHabit(row: Record<string, unknown>) {
  return {
    ...row,
    start_date: fmtDate(row.start_date),
  };
}

function normalizeCheckin(row: Record<string, unknown>) {
  return {
    ...row,
    check_date: fmtDate(row.check_date),
  };
}

async function habitTotal(habitId: string, userId: string): Promise<number> {
  const r = await pool.query(
    'SELECT COUNT(*)::int AS total FROM habit_checkins WHERE habit_id = $1 AND user_id = $2',
    [habitId, userId]
  );
  return Number(r.rows[0]?.total ?? 0);
}

type HabitInput = {
  title?: string;
  color?: string;
  icon?: string;
  reminderAt?: string | null;
  startDate?: string;
};

/**
 * 习惯打卡路由（7 个）+ 聚合统计。
 * 鉴权复用根实例在 registerTasks 中注册的 preHandler JWT 钩子，
 * 因此本插件不再单独注册钩子；所有 /habits* 路由均要求已登录。
 */
export async function registerHabits(app: FastifyInstance) {
  app.get('/habits', async (req) => {
    const uid = (req.user as { id: string }).id;
    const r = await pool.query(
      'SELECT * FROM habits WHERE user_id = $1 ORDER BY created_at',
      [uid]
    );
    return r.rows.map(normalizeHabit);
  });

  app.post('/habits', async (req, reply) => {
    const uid = (req.user as { id: string }).id;
    const b = req.body as HabitInput;
    if (!b.title) return reply.code(400).send({ error: 'title required' });
    const r = await pool.query(
      `INSERT INTO habits(user_id, title, color, icon, reminder_at, start_date)
       VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
      [
        uid,
        b.title,
        b.color ?? '#f5a623',
        b.icon ?? '🔥',
        b.reminderAt ?? null,
        // start_date 为 NOT NULL DEFAULT CURRENT_DATE；显式传 null 会违反约束
        // 用东八区日期，避免 UTC 午夜导致的跨天偏差
        b.startDate || fmtDate(new Date()),
      ]
    );
    return normalizeHabit(r.rows[0]);
  });

  // 聚合统计：单查询返回全部习惯的统计，转成 { [habitId]: HabitStats }
  // 注意：静态路由 /habits/stats 必须定义在 /habits/:id 之前，避免被参数路由拦截
  app.get('/habits/stats', async (req) => {
    const uid = (req.user as { id: string }).id;
    const r = await pool.query(
      `SELECT
        h.id AS habit_id,
        COALESCE(c.total,0)::int                                  AS total,
        COALESCE(c.monthly_count,0)::int                         AS monthly_count,
        ROUND(COALESCE(c.monthly_count,0)::numeric
              / GREATEST(1, EXTRACT(day FROM current_date))::numeric, 3) AS monthly_rate,
        COALESCE(s.current_streak,0)::int                        AS current_streak
      FROM habits h
      LEFT JOIN (
        SELECT habit_id,
               COUNT(*)                                                          AS total,
               COUNT(*) FILTER (WHERE check_date >= date_trunc('month', current_date)) AS monthly_count
        FROM habit_checkins WHERE user_id = $1
        GROUP BY habit_id
      ) c ON c.habit_id = h.id
      LEFT JOIN (
        WITH d AS (
          SELECT habit_id, check_date,
                 check_date - (ROW_NUMBER() OVER (PARTITION BY habit_id ORDER BY check_date))::int AS grp
          FROM habit_checkins WHERE user_id = $1
        ),
        streaks AS (
          SELECT habit_id, COUNT(*) AS len, MAX(check_date) AS last_date
          FROM d GROUP BY habit_id, grp
        )
        SELECT habit_id, MAX(len) FILTER (WHERE last_date >= current_date - interval '1 day') AS current_streak
        FROM streaks GROUP BY habit_id
      ) s ON s.habit_id = h.id
      WHERE h.user_id = $1`,
      [uid]
    );
    const map: Record<string, unknown> = {};
    for (const row of r.rows) {
      map[row.habit_id] = {
        habitId: row.habit_id,
        total: Number(row.total),
        currentStreak: Number(row.current_streak),
        monthlyCount: Number(row.monthly_count),
        monthlyRate: Number(row.monthly_rate),
      };
    }
    return map;
  });

  app.get('/habits/:id', async (req, reply) => {
    const uid = (req.user as { id: string }).id;
    const { id } = req.params as { id: string };
    const r = await pool.query(
      'SELECT * FROM habits WHERE id = $1 AND user_id = $2',
      [id, uid]
    );
    if (!r.rows.length) return reply.code(404).send({ error: 'not found' });
    return normalizeHabit(r.rows[0]);
  });

  app.put('/habits/:id', async (req, reply) => {
    const uid = (req.user as { id: string }).id;
    const { id } = req.params as { id: string };
    const b = req.body as HabitInput;
    const map: Record<string, unknown> = { ...b };
    if ('reminderAt' in map) {
      map.reminder_at = map.reminderAt;
      delete map.reminderAt;
    }
    if ('startDate' in map) {
      map.start_date = map.startDate;
      delete map.startDate;
    }
    const cols = ['title', 'color', 'icon', 'reminder_at', 'start_date'];
    const sets = cols.filter((c) => c in map).map((c, i) => `${c} = $${i + 2}`);
    if (!sets.length) return reply.code(400).send({ error: 'nothing to update' });
    const vals = cols.filter((c) => c in map).map((c) => map[c]);
    const r = await pool.query(
      `UPDATE habits SET ${sets.join(', ')}, updated_at = now()
       WHERE id = $1 AND user_id = $${sets.length + 2} RETURNING *`,
      [id, ...vals, uid]
    );
    if (!r.rows.length) return reply.code(404).send({ error: 'not found' });
    return normalizeHabit(r.rows[0]);
  });

  app.delete('/habits/:id', async (req, reply) => {
    const uid = (req.user as { id: string }).id;
    const { id } = req.params as { id: string };
    const r = await pool.query(
      'DELETE FROM habits WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, uid]
    );
    if (!r.rows.length) return reply.code(404).send({ error: 'not found' });
    return { ok: true };
  });

  app.post('/habits/:id/checkin', async (req, reply) => {
    const uid = (req.user as { id: string }).id;
    const { id } = req.params as { id: string };
    const b = req.body as { checkDate?: string };
    const checkDate = (b.checkDate ?? '').trim() || fmtDate(new Date());
    // 先校验归属，避免越权打卡
    const owner = await pool.query(
      'SELECT 1 FROM habits WHERE id = $1 AND user_id = $2',
      [id, uid]
    );
    if (!owner.rows.length) return reply.code(404).send({ error: 'not found' });
    const r = await pool.query(
      `INSERT INTO habit_checkins(habit_id, user_id, check_date)
       VALUES($1,$2,$3) ON CONFLICT(habit_id, check_date) DO NOTHING RETURNING *`,
      [id, uid, checkDate]
    );
    let row: Record<string, unknown>;
    if (!r.rows.length) {
      // 唯一约束命中：回查已有记录返回（幂等）
      const existing = await pool.query(
        'SELECT * FROM habit_checkins WHERE habit_id = $1 AND user_id = $2 AND check_date = $3',
        [id, uid, checkDate]
      );
      row = existing.rows[0] ?? { habit_id: id, check_date: checkDate };
    } else {
      row = r.rows[0];
    }
    const total = await habitTotal(id, uid);
    return { ...normalizeCheckin(row), checked: true, total };
  });

  app.delete('/habits/:id/checkin/:date', async (req) => {
    const uid = (req.user as { id: string }).id;
    const { id, date } = req.params as { id: string; date: string };
    await pool.query(
      'DELETE FROM habit_checkins WHERE habit_id = $1 AND check_date = $2 AND user_id = $3',
      [id, date, uid]
    );
    const total = await habitTotal(id, uid);
    return { ok: true, checked: false, total };
  });

  /**
   * 小组件/快捷入口用的一键切换：根据当前是否存在指定日期的打卡记录，
   * 自动插入或删除，并返回最终状态。避免客户端维护 checked 本地状态。
   */
  app.post('/habits/:id/toggle', async (req, reply) => {
    const uid = (req.user as { id: string }).id;
    const { id } = req.params as { id: string };
    const b = req.body as { date?: string };
    const date = (b.date ?? '').trim() || fmtDate(new Date());

    const owner = await pool.query(
      'SELECT 1 FROM habits WHERE id = $1 AND user_id = $2',
      [id, uid]
    );
    if (!owner.rows.length) return reply.code(404).send({ error: 'not found' });

    const existing = await pool.query(
      'SELECT 1 FROM habit_checkins WHERE habit_id = $1 AND check_date = $2 AND user_id = $3',
      [id, date, uid]
    );

    if (existing.rows.length) {
      await pool.query(
        'DELETE FROM habit_checkins WHERE habit_id = $1 AND check_date = $2 AND user_id = $3',
        [id, date, uid]
      );
    } else {
      await pool.query(
        'INSERT INTO habit_checkins(habit_id, user_id, check_date) VALUES($1,$2,$3) ON CONFLICT(habit_id, check_date) DO NOTHING',
        [id, uid, date]
      );
    }

    const total = await habitTotal(id, uid);
    const checked = !existing.rows.length;
    return { checked, total, date };
  });

  app.get('/habits/:id/checkins', async (req) => {
    const uid = (req.user as { id: string }).id;
    const { id } = req.params as { id: string };
    const { from, to } = req.query as { from?: string; to?: string };
    const r = await pool.query(
      `SELECT * FROM habit_checkins
       WHERE habit_id = $1 AND user_id = $2
         AND check_date BETWEEN $3 AND $4
       ORDER BY check_date`,
      [id, uid, from ?? '1900-01-01', to ?? '2999-12-31']
    );
    return r.rows.map(normalizeCheckin);
  });
}
