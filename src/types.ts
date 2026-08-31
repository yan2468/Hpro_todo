export type TaskStatus = 'active' | 'completed' | 'postponed';

export type CategoryId = 'main' | 'side' | 'daily' | 'story' | 'vip' | 'event';

/** 任务内的步骤（可勾选），步骤数即 total，自动计算 */
export interface Step {
  text: string;
  done: boolean;
}

/** 优先级：四色小旗 + 排序权重（0 最靠前） */
export type PriorityId = 'urgent_important' | 'urgent' | 'important' | 'normal';

export interface PriorityMeta {
  id: PriorityId;
  label: string;
  short: string;
  color: string;
  order: number;
}

// 顺序：重要且紧急(红) > 不重要但紧急(黄) > 重要不紧急(蓝) > 不重要不紧急(绿)
export const PRIORITIES: PriorityMeta[] = [
  { id: 'urgent_important', label: '重要且紧急', short: '紧急', color: '#e74c3c', order: 0 },
  { id: 'urgent', label: '不重要但紧急', short: '紧急', color: '#f1c40f', order: 1 },
  { id: 'important', label: '重要不紧急', short: '重要', color: '#3498db', order: 2 },
  { id: 'normal', label: '不重要不紧急', short: '普通', color: '#2ecc71', order: 3 },
];

export const priorityById = (id?: string | null): PriorityMeta | undefined =>
  PRIORITIES.find((p) => p.id === id);

export const priorityOrder = (id?: string | null): number => priorityById(id)?.order ?? 99;

export interface Task {
  id: string;
  user_id: string;
  parentId?: string | null;
  title: string;
  category: CategoryId | string;
  tags: string[];
  current: number;
  total: number;
  steps?: Step[];
  priority?: PriorityId | null;
  status: TaskStatus;
  note?: string | null;
  sortOrder?: number;
  reminderAt: string | null;
  createdAt: string;
  updatedAt?: string;
}

export type ReportType = 'daily' | 'weekly';
export type ReportStatus = 'draft' | 'published';

export interface Report {
  id: string;
  user_id: string;
  type: ReportType;
  title: string;
  reportDate: string;
  endDate?: string;
  reportTime?: string; // HH:mm，日报/周报开始时间；周报结束时间自动 = 开始时间 + 6 天
  company?: string; // 所属公司 / 单位
  status: ReportStatus; // draft=暂存/草稿，published=正式发布
  bullets: string[];
  createdAt: string;
  updatedAt?: string;
}

export interface User {
  id: string;
  email: string;
}

export interface CategoryMeta {
  id: CategoryId;
  label: string;
  color: string;
  icon: string;
}

// 对应截图 6 个分类图标：主线 / 支线 / 每日 / 剧情 / VIP / 活动
export const CATEGORIES: CategoryMeta[] = [
  { id: 'main', label: '主线', color: '#2f78c4', icon: '🐟' },
  { id: 'side', label: '支线', color: '#d4a017', icon: '🌿' },
  { id: 'daily', label: '每日', color: '#9c6b3f', icon: '☀️' },
  { id: 'story', label: '剧情', color: '#7a4fb0', icon: '◆' },
  { id: 'vip', label: 'VIP', color: '#e0b400', icon: '👑' },
  { id: 'event', label: '活动', color: '#2f8f8f', icon: '⚡' },
];

export const categoryColor = (id: string): string =>
  CATEGORIES.find((c) => c.id === id)?.color ?? '#3a7d5d';

export const categoryLabel = (id: string): string =>
  CATEGORIES.find((c) => c.id === id)?.label ?? '任务';

/* ===== 员工上班成本计算表 ===== */

/** 一项可选月度花费（油费、差旅费、打印费等） */
export interface OtherCost {
  label: string; // 名称
  amount: number; // 每月金额（元）
}

/** 员工成本配置 */
export interface EmployeeCost {
  id: string;
  user_id: string;
  name: string; // 姓名
  salary: number; // 月薪（元/月）
  otherCosts: OtherCost[]; // 其他月度花费
  validFrom: string; // 在职有效起始日 'YYYY-MM-DD'
  validTo: string | null; // 在职有效截止日（null = 至今）
  createdAt: string;
  updatedAt?: string;
}

/** 按天补录的其他花费（如某天出差加油、临时差旅） */
export interface CostExtra {
  id: string;
  userId: string;
  costId: string; // 对应 employee_costs.id
  costDate: string; // 'YYYY-MM-DD'
  amount: number; // 该笔金额（元）
  note: string; // 说明
  createdAt: string;
}


/* ===== 习惯打卡 ===== */

/** 习惯定义 */
export interface Habit {
  id: string;
  user_id: string;
  title: string;
  color: string; // '#f5a623'
  icon: string; // emoji，如 '🔥'
  reminderAt: string | null; // 'HH:mm' 或 null
  startDate: string; // 'YYYY-MM-DD'
  createdAt: string;
  updatedAt?: string;
}

/** 单次打卡记录 */
export interface HabitCheckin {
  id: string;
  habitId: string;
  userId: string;
  checkDate: string; // 'YYYY-MM-DD'
  createdAt: string;
}

/** 习惯聚合统计 */
export interface HabitStats {
  habitId: string;
  total: number; // 累计打卡次数
  currentStreak: number; // 当前连续天数（含今天或昨天）
  monthlyCount: number; // 本月打卡次数
  monthlyRate: number; // 月完成率 0~1 = monthlyCount / 本月已过天数
}

/** 习惯图标候选（复用 emoji 池，不做自定义上传） */
export const HABIT_ICONS: string[] = [
  '🔥',
  '💧',
  '📚',
  '🏃',
  '♟️',
  '🧘',
  '💤',
  '🍎',
  '🌿',
  '⭐',
  '💪',
  '🎯',
];

/** 习惯默认主题色候选（含纯色 + 渐变色） */
export const HABIT_COLORS: string[] = [
  '#f5a623',
  '#2f8f5a',
  '#2f78c4',
  '#e0533d',
  '#9c6b3f',
  '#7a4fb0',
  '#e91e63',
  '#00bcd4',
  '#ff6f00',
  '#607d8b',
  '#8bc34a',
  '#ff5252',
  'linear-gradient(135deg, #f5a623, #e0533d)',
  'linear-gradient(135deg, #2f8f5a, #00bcd4)',
  'linear-gradient(135deg, #7a4fb0, #e91e63)',
  'linear-gradient(135deg, #2f78c4, #8bc34a)',
  'linear-gradient(135deg, #ff6f00, #f5a623)',
  'linear-gradient(135deg, #e91e63, #7a4fb0)',
];
