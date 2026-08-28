// 数据库迁移脚本：在已有 tasks / reports 表上补齐新字段，并回填旧数据默认值
// 用法（在服务器 /var/www/dev-todo 目录下）：
//   node migrate.cjs
// 可重复执行，已存在的字段会被跳过，回填 SQL 使用 WHERE ... IS NULL 避免覆盖已有值。
require('dotenv').config();
const pg = require('pg');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

(async () => {
  try {
    const url = process.env.DATABASE_URL.replace(/\/\/[^:]+:[^@]+@/, '//***:***@');
    console.log('connecting to', url);
    await pool.query('SELECT 1');
    console.log('connected');

    // ===== tasks 表字段 =====
    await pool.query(
      'ALTER TABLE tasks ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES tasks(id) ON DELETE CASCADE'
    );
    await pool.query("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS steps TEXT DEFAULT '[]'");
    await pool.query("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS priority TEXT");
    await pool.query("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS note TEXT DEFAULT ''");
    await pool.query("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 0");

    // ===== reports 表字段 =====
    // 字段名与 DDL 保持一致：content（前端业务字段仍叫 bullets）
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reports (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type        TEXT NOT NULL CHECK (type IN ('daily', 'weekly')),
        title       TEXT NOT NULL,
        report_date DATE NOT NULL,
        end_date    DATE,
        content     TEXT[] DEFAULT '{}',
        created_at  TIMESTAMPTZ DEFAULT now(),
        updated_at  TIMESTAMPTZ DEFAULT now()
      )
    `);
    // 兼容旧库：若存在 bullets 列且不存在 content 列，则重命名，避免数据丢失
    await pool.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'reports' AND column_name = 'bullets'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'reports' AND column_name = 'content'
        ) THEN
          ALTER TABLE reports RENAME COLUMN bullets TO content;
        END IF;
      END $$;
    `);
    await pool.query('ALTER TABLE reports ADD COLUMN IF NOT EXISTS end_date DATE');
    await pool.query("ALTER TABLE reports ADD COLUMN IF NOT EXISTS report_time TEXT");
    await pool.query("ALTER TABLE reports ADD COLUMN IF NOT EXISTS company TEXT");
    await pool.query('CREATE INDEX IF NOT EXISTS idx_reports_user ON reports(user_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_reports_type ON reports(user_id, type)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_reports_date ON reports(user_id, report_date)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_reports_end_date ON reports(user_id, end_date)');

    // ===== habits 表 + 打卡记录表（习惯打卡功能） =====
    await pool.query(`
      CREATE TABLE IF NOT EXISTS habits (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title       TEXT NOT NULL,
        color       TEXT DEFAULT '#f5a623',
        icon        TEXT DEFAULT '🔥',
        reminder_at TIME,
        start_date  DATE NOT NULL DEFAULT CURRENT_DATE,
        created_at  TIMESTAMPTZ DEFAULT now(),
        updated_at  TIMESTAMPTZ DEFAULT now()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS habit_checkins (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        habit_id    UUID NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
        user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        check_date  DATE NOT NULL,
        created_at  TIMESTAMPTZ DEFAULT now(),
        UNIQUE(habit_id, check_date)
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_habits_user ON habits(user_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_habit_checkins_habit ON habit_checkins(habit_id, check_date)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_habit_checkins_user ON habit_checkins(user_id, check_date)');

    // ===== 员工上班成本计算表 =====
    await pool.query(`
      CREATE TABLE IF NOT EXISTS employee_costs (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name        TEXT NOT NULL,
        salary      NUMERIC(12,2) NOT NULL DEFAULT 0,
        other_costs JSONB NOT NULL DEFAULT '[]'::jsonb,
        valid_from  DATE NOT NULL DEFAULT CURRENT_DATE,
        valid_to    DATE,
        created_at  TIMESTAMPTZ DEFAULT now(),
        updated_at  TIMESTAMPTZ DEFAULT now()
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_employee_costs_user ON employee_costs(user_id)');

    // ===== 按天补录的其他花费 =====
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cost_extras (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        cost_id    UUID NOT NULL REFERENCES employee_costs(id) ON DELETE CASCADE,
        cost_date  DATE NOT NULL,
        amount     NUMERIC(12,2) NOT NULL DEFAULT 0,
        note       TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ DEFAULT now()
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_cost_extras_user ON cost_extras(user_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_cost_extras_cost ON cost_extras(cost_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_cost_extras_date ON cost_extras(user_id, cost_date)');

    // ===== 用户设置同步 =====
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_settings (
        user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        s_key       TEXT NOT NULL,
        s_value     TEXT NOT NULL DEFAULT '',
        updated_at  TIMESTAMPTZ DEFAULT now(),
        PRIMARY KEY (user_id, s_key)
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_user_settings_user ON user_settings(user_id)');

    // ===== 回填旧数据中的空字段 =====
    // 1) end_date 为空时：日报 = report_date，周报 = report_date + 6 天
    const endFill = await pool.query(`
      UPDATE reports
      SET end_date = (report_date + (CASE WHEN type = 'weekly' THEN 6 ELSE 0 END))::date
      WHERE end_date IS NULL
    `);
    console.log('回填 end_date：', endFill.rowCount, '条');

    // 2) company 为空时统一设为 '霞数智算'
    const companyFill = await pool.query(`
      UPDATE reports SET company = '霞数智算' WHERE company IS NULL OR company = ''
    `);
    console.log('回填 company：', companyFill.rowCount, '条');

    // 3) report_time 为空时统一设为 '00:00:00'
    const timeFill = await pool.query(`
      UPDATE reports SET report_time = '00:00:00' WHERE report_time IS NULL OR report_time = ''
    `);
    console.log('回填 report_time：', timeFill.rowCount, '条');

    console.log('迁移完成：已确保 tasks / reports 新字段并完成旧数据回填');

    const r = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('reports') ORDER BY table_name"
    );
    console.log('已存在表：', r.rows.map((x) => x.table_name).join(', ') || '（无）');
  } catch (e) {
    console.error('迁移失败:', e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
