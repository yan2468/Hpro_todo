-- Dave the Diver 任务清单 · 阿里云 PostgreSQL 建表脚本
-- 执行：psql "$DATABASE_URL" -f server/schema.sql

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tasks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id   UUID REFERENCES tasks(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  category    TEXT DEFAULT 'main',
  tags        TEXT[] DEFAULT '{}',
  current     INT DEFAULT 0,
  total       INT DEFAULT 0,
  steps       TEXT DEFAULT '[]',       -- JSON 数组，如 [{"text":"买菜","done":false}]
  priority    TEXT DEFAULT NULL,       -- 优先级：urgent_important|urgent|important|normal
  note        TEXT DEFAULT '',         -- 任务备注（桌面小组件与移动端均展示）
  sort_order  INT DEFAULT 0,           -- 同优先级内排序权重，越小越靠前
  status      TEXT DEFAULT 'active',   -- active | completed | postponed
  reminder_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(user_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_id);

CREATE TABLE IF NOT EXISTS reports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('daily', 'weekly')),
  title       TEXT NOT NULL,
  report_date DATE NOT NULL,
  end_date    DATE, -- 周报结束时间 = report_date + 6 天；日报与 report_date 相同
  report_time TEXT, -- 开始时间 HH:mm；周报结束时间自动套用同一时间
  company     TEXT, -- 所属公司 / 单位
  content     TEXT[] DEFAULT '{}', -- 报告分点（前端字段名为 bullets）
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reports_user ON reports(user_id);
CREATE INDEX IF NOT EXISTS idx_reports_type ON reports(user_id, type);
CREATE INDEX IF NOT EXISTS idx_reports_date ON reports(user_id, report_date);
CREATE INDEX IF NOT EXISTS idx_reports_end_date ON reports(user_id, end_date);

-- ===== 习惯打卡功能 =====
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
);

CREATE TABLE IF NOT EXISTS habit_checkins (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  habit_id    UUID NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  check_date  DATE NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(habit_id, check_date)
);

CREATE INDEX IF NOT EXISTS idx_habits_user ON habits(user_id);
CREATE INDEX IF NOT EXISTS idx_habit_checkins_habit ON habit_checkins(habit_id, check_date);
CREATE INDEX IF NOT EXISTS idx_habit_checkins_user ON habit_checkins(user_id, check_date);

-- ===== 员工上班成本计算表 =====
CREATE TABLE IF NOT EXISTS employee_costs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,                                  -- 员工姓名
  salary      NUMERIC(12,2) NOT NULL DEFAULT 0,               -- 月薪（元/月）
  other_costs JSONB NOT NULL DEFAULT '[]'::jsonb,             -- 其他月度花费：[{"label":"油费","amount":300}, ...]
  valid_from  DATE NOT NULL DEFAULT CURRENT_DATE,             -- 在职有效起始日
  valid_to    DATE,                                            -- 在职有效截止日（NULL = 至今）
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employee_costs_user ON employee_costs(user_id);

-- ===== 按天补录的其他花费（出差加油、临时差旅等，挂在具体员工+日期上） =====
CREATE TABLE IF NOT EXISTS cost_extras (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cost_id    UUID NOT NULL REFERENCES employee_costs(id) ON DELETE CASCADE,
  cost_date  DATE NOT NULL,                               -- 发生日期 'YYYY-MM-DD'
  amount     NUMERIC(12,2) NOT NULL DEFAULT 0,            -- 该笔额外花费金额（元）
  note       TEXT NOT NULL DEFAULT '',                   -- 说明，如「出差加油」
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cost_extras_user ON cost_extras(user_id);
CREATE INDEX IF NOT EXISTS idx_cost_extras_cost ON cost_extras(cost_id);
CREATE INDEX IF NOT EXISTS idx_cost_extras_date ON cost_extras(user_id, cost_date);

-- ===== 用户设置同步 =====
-- 把原本仅存 localStorage 的设置（个人资料、主题、AI 配置、标签、工作状态等）同步到云端，
-- 实现移动端 / 电脑端设置一致。
CREATE TABLE IF NOT EXISTS user_settings (
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  s_key       TEXT NOT NULL,
  s_value     TEXT NOT NULL DEFAULT '',
  updated_at  TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, s_key)
);

CREATE INDEX IF NOT EXISTS idx_user_settings_user ON user_settings(user_id);
