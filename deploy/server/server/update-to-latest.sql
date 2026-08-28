-- ============================================================
-- 把现有数据库更新到最新版（幂等，可重复执行）
-- 用途：reports.bullets -> content；tasks 补 note；新增 employee_costs
-- 执行：在 psql / 阿里云 DMS / 任意 PG 客户端里整段运行
-- ============================================================

-- 1) reports 表：bullets 改名为 content（与后端代码写入字段一致，否则保存 500）
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'reports'
      AND column_name  = 'bullets'
  ) THEN
    ALTER TABLE public.reports RENAME COLUMN bullets TO content;
  END IF;
END $$;

-- 2) tasks 表：补 note 字段（代码已使用，用于任务备注）
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS note TEXT DEFAULT '';

-- 3) 员工上班成本计算表（本次新增功能）
CREATE TABLE IF NOT EXISTS public.employee_costs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,                                  -- 员工姓名
  salary      NUMERIC(12,2) NOT NULL DEFAULT 0,               -- 月薪（元/月）
  other_costs JSONB NOT NULL DEFAULT '[]'::jsonb,             -- 其他月度花费：[{"label":"油费","amount":300}, ...]
  valid_from  DATE NOT NULL DEFAULT CURRENT_DATE,             -- 在职有效起始日
  valid_to    DATE,                                            -- 在职有效截止日（NULL = 至今）
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employee_costs_user ON public.employee_costs(user_id);

-- 表归属保持与既有表一致（你原 DDL 的 owner 是 heiheihei）
ALTER TABLE public.employee_costs OWNER TO heiheihei;
