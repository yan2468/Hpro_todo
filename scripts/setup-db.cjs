require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pg = require('pg');

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

(async () => {
  try {
    const url = process.env.DATABASE_URL.replace(/\/\/[^:]+:[^@]+@/, '//***:***@');
    console.log('connecting to', url);

    // 连通性 + 版本
    const v = await pool.query('SELECT version()');
    console.log('PG version:', v.rows[0].version.split(' ').slice(0, 2).join(' '));

    // 兼容老 PG：确保 gen_random_uuid 可用（PG13+ 已内置，失败则忽略）
    try {
      await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
      console.log('pgcrypto: ok');
    } catch (e) {
      console.log('pgcrypto skip:', e.message.split('\n')[0]);
    }

    const sql = fs.readFileSync(path.join(__dirname, '..', 'server', 'schema.sql'), 'utf8');
    await pool.query(sql);
    console.log('schema applied');

    // 已存在旧表时，补齐新字段（可重复执行，不会报错）
    await pool.query(
      'ALTER TABLE tasks ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES tasks(id) ON DELETE CASCADE'
    );
    await pool.query(
      "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS steps TEXT DEFAULT '[]'"
    );
    await pool.query(
      "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS priority TEXT"
    );
    console.log('columns migrated (parent_id, steps, priority)');

    const t = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('users','tasks') ORDER BY table_name"
    );
    console.log('tables:', t.rows.map((r) => r.table_name).join(', '));
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
