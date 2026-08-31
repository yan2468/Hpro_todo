import type { FastifyInstance } from 'fastify';
import { pool } from './db.js';

const DEFAULT_REPORT_TIME = '00:00:00';
const DEFAULT_COMPANY = '霞数智算';

type ReportInput = {
  type?: 'daily' | 'weekly';
  title?: string;
  reportDate?: string;
  endDate?: string;
  reportTime?: string;
  company?: string;
  status?: 'draft' | 'published';
  bullets?: string[];
  content?: string[]; // 兼容 DB 字段名
};

function normalize(row: any) {
  return {
    id: row.id,
    user_id: row.user_id,
    type: row.type,
    title: row.title,
    reportDate: row.report_date,
    endDate: row.end_date,
    reportTime: row.report_time || DEFAULT_REPORT_TIME,
    company: row.company || DEFAULT_COMPANY,
    status: row.status || 'published',
    // DB 实际字段为 content（与 DDL 一致），返回给前端仍用 bullets
    bullets: row.content ?? row.bullets ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function withDefaults(b: ReportInput): ReportInput {
  return {
    ...b,
    reportTime: b.reportTime?.trim() || DEFAULT_REPORT_TIME,
    company: b.company?.trim() || DEFAULT_COMPANY,
  };
}

export async function registerReports(app: FastifyInstance) {
  app.addHook('preHandler', async (req, reply) => {
    if (req.url.startsWith('/auth') || req.url === '/health') return;
    try {
      await req.jwtVerify();
    } catch {
      return reply.code(401).send({ error: 'unauthorized' });
    }
  });

  app.get('/reports', async (req) => {
    const uid = (req.user as { id: string }).id;
    const r = await pool.query(
      'SELECT * FROM reports WHERE user_id = $1 ORDER BY report_date DESC, created_at DESC',
      [uid]
    );
    return r.rows.map(normalize);
  });

  app.get('/reports/:id', async (req, reply) => {
    const uid = (req.user as { id: string }).id;
    const { id } = req.params as { id: string };
    const r = await pool.query(
      'SELECT * FROM reports WHERE id = $1 AND user_id = $2',
      [id, uid]
    );
    if (!r.rows.length) return reply.code(404).send({ error: 'not found' });
    return normalize(r.rows[0]);
  });

  app.post('/reports', async (req, reply) => {
    try {
      const uid = (req.user as { id: string }).id;
      const b = withDefaults(req.body as ReportInput);
      if (!b.title) return reply.code(400).send({ error: 'title required' });
      if (!b.type || !['daily', 'weekly'].includes(b.type)) {
        return reply.code(400).send({ error: 'type must be daily or weekly' });
      }
      const reportDate = b.reportDate ?? new Date().toISOString().slice(0, 10);
      const bullets = b.bullets ?? b.content ?? [];
      const status = b.status || 'published';
      const r = await pool.query(
        `INSERT INTO reports(user_id, type, title, report_date, end_date, report_time, company, content, status)
         VALUES($1,$2,$3,$4,(($4::date) + (CASE WHEN $2 = 'weekly' THEN 6 ELSE 0 END))::date,$5,$6,$7,$8) RETURNING *`,
        [uid, b.type, b.title, reportDate, b.reportTime, b.company, bullets, status]
      );
      return normalize(r.rows[0]);
    } catch (e: any) {
      req.log.error(e);
      return reply.code(500).send({ error: e.message || 'Internal Server Error' });
    }
  });

  app.put('/reports/:id', async (req, reply) => {
    try {
      const uid = (req.user as { id: string }).id;
      const { id } = req.params as { id: string };
      const b = withDefaults(req.body as ReportInput);
      const map: Record<string, unknown> = {};
      if ('type' in b) map.type = b.type;
      if ('title' in b) map.title = b.title;
      if ('reportDate' in b) map.report_date = b.reportDate;
      if ('reportTime' in b) map.report_time = b.reportTime;
      if ('company' in b) map.company = b.company;
      if ('status' in b) map.status = b.status;
      // DB 字段为 content，前端字段为 bullets，同时兼容旧字段名
      if ('bullets' in b) map.content = b.bullets;
      if ('content' in b) map.content = b.content;
      const needsEnd = 'reportDate' in b || 'type' in b;
      const cols = Object.keys(map);
      if (!cols.length && !needsEnd) return reply.code(400).send({ error: 'nothing to update' });
      const sets = cols.map((c, i) => `${c} = $${i + 2}`);
      const vals = cols.map((c) => map[c]);
      if (needsEnd) {
        sets.push(`end_date = (report_date + (CASE WHEN type = 'weekly' THEN 6 ELSE 0 END))::date`);
      }
      // end_date 使用 SQL 表达式，不占用参数，因此 uid 索引基于实际参数数量计算
      const baseParams = [id, ...vals];
      const uidIndex = baseParams.length + 1;
      const r = await pool.query(
        `UPDATE reports SET ${sets.join(', ')}, updated_at = now()
         WHERE id = $1 AND user_id = $${uidIndex} RETURNING *`,
        [...baseParams, uid]
      );
      if (!r.rows.length) return reply.code(404).send({ error: 'not found' });
      return normalize(r.rows[0]);
    } catch (e: any) {
      req.log.error(e);
      return reply.code(500).send({ error: e.message || 'Internal Server Error' });
    }
  });

  app.delete('/reports/:id', async (req, reply) => {
    const uid = (req.user as { id: string }).id;
    const { id } = req.params as { id: string };
    const r = await pool.query(
      'DELETE FROM reports WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, uid]
    );
    if (!r.rows.length) return reply.code(404).send({ error: 'not found' });
    return { ok: true };
  });

  app.post('/reports/:id/clone', async (req, reply) => {
    const uid = (req.user as { id: string }).id;
    const { id } = req.params as { id: string };
    const b = req.body as { type?: 'daily' | 'weekly'; title?: string; reportDate?: string } | undefined;
    const src = await pool.query(
      'SELECT * FROM reports WHERE id = $1 AND user_id = $2',
      [id, uid]
    );
    if (!src.rows.length) return reply.code(404).send({ error: 'not found' });
    const row = src.rows[0];
    const reportDate = b?.reportDate ?? new Date().toISOString().slice(0, 10);
    const r = await pool.query(
      `INSERT INTO reports(user_id, type, title, report_date, end_date, report_time, company, content)
       VALUES($1,$2,$3,$4,(($4::date) + (CASE WHEN $2 = 'weekly' THEN 6 ELSE 0 END))::date,$5,$6,$7) RETURNING *`,
      [
        uid,
        b?.type ?? row.type,
        b?.title ?? `副本 - ${row.title}`,
        reportDate,
        row.report_time ?? null,
        row.company ?? null,
        row.content ?? row.bullets ?? [],
      ]
    );
    return normalize(r.rows[0]);
  });
}
