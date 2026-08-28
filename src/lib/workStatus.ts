// 工作状态配置：控制首页「下班倒计时」的三种状态流转
// 正常工作日 / 临时加班 / 调休休息，并支持按日期预设与文案自定义。

import { isWorkingDay, isHoliday } from './holidays';

export type WorkMode = 'normal' | 'overtime' | 'dayoff';

// 某一天的工作状态计划
export interface DayPlan {
  mode: WorkMode;
  // mode === 'overtime' 时生效
  overtimeEnd?: string; // HH:mm，加班结束时刻
  overtimeCrossMidnight?: boolean; // 加班是否跨到次日（处理跨天边界）
  // mode === 'dayoff' 时生效，覆盖全局默认休息文案
  restText?: string;
}

// 各状态可自定义的展示文案
export interface WorkStatusTexts {
  normalCountdown: string; // 正常倒计时前缀，默认 "离下班还有 "
  overtimeCountdown: string; // 加班倒计时前缀，默认 "离加班结束还有 "
  dayoff: string; // 调休/休息文案，默认 "今日调休"
  done: string; // 倒计时归零后的状态，默认 "已下班"
  pre: string; // 尚未到上班时间时，默认 "还没到上班时间呢~"
}

export interface WorkStatusConfig {
  texts: WorkStatusTexts;
  plans: Record<string, DayPlan>; // key = 本地 YYYY-MM-DD
}

const KEY = 'dd_work_status';

export const DEFAULT_WORK_STATUS: WorkStatusConfig = {
  texts: {
    normalCountdown: '离下班还有 ',
    overtimeCountdown: '离加班结束还有 ',
    dayoff: '今日调休',
    done: '已下班',
    pre: '还没到上班时间呢~',
  },
  plans: {},
};

export const MODE_LABELS: Record<WorkMode, string> = {
  normal: '正常工作日',
  overtime: '临时加班',
  dayoff: '调休/休息',
};

export function getWorkStatus(): WorkStatusConfig {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    return {
      texts: { ...DEFAULT_WORK_STATUS.texts, ...(raw.texts || {}) },
      plans: raw.plans || {},
    };
  } catch {
    return DEFAULT_WORK_STATUS;
  }
}

export function setWorkStatus(c: WorkStatusConfig): void {
  localStorage.setItem(KEY, JSON.stringify(c));
}

// 本地 YYYY-MM-DD（与用户所在时区一致，避免 UTC 偏移）
export function dateKey(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// "HH:mm" -> 当天该时刻；带兜底默认小时
function todayAt(time: string, fallback: number, now: Date): Date {
  const [h, m] = time.split(':').map((x) => parseInt(x, 10));
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    Number.isNaN(h) ? fallback : h,
    Number.isNaN(m) ? 0 : m,
    0,
    0
  );
}

function formatHMS(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}时${m}分${s}秒`;
}

export type CountdownTone = 'count' | 'rest' | 'done' | 'pre';

export interface CountdownView {
  mode: WorkMode;
  tone: CountdownTone;
  text: string;
  isCountdown: boolean;
}

// 核心流转逻辑：根据「当天计划 + 当前时刻」算出应展示的内容
export function computeCountdown(
  cfg: WorkStatusConfig,
  profile: { workStart: string; workEnd: string },
  now: Date = new Date()
): CountdownView {
  const key = dateKey(now);
  // 无显式计划时，按「法定节假日 + 调休」判断当天是否为工作日：
  // 工作日 -> 正常工作日倒计时；非工作日（周末/法定节假日）-> 休息。
  const defaultMode: WorkMode = isWorkingDay(now) ? 'normal' : 'dayoff';
  const plan: DayPlan = cfg.plans[key] || { mode: defaultMode };
  const t = now.getTime();

  // 1) 调休/休息：全天直接显示休息文案，不进入倒计时
  if (plan.mode === 'dayoff') {
    const restText = plan.restText?.trim()
      || (isHoliday(now) ? '今日法定节假日' : '今日休息（周末）');
    return {
      mode: 'dayoff',
      tone: 'rest',
      text: restText,
      isCountdown: false,
    };
  }

  // 2) 计算起止时刻
  const start = todayAt(profile.workStart || '09:00', 9, now);
  let end: Date;
  if (plan.mode === 'overtime') {
    end = todayAt(plan.overtimeEnd || profile.workEnd || '18:00', 18, now);
    if (plan.overtimeCrossMidnight) end = new Date(end.getTime() + 86400000);
  } else {
    end = todayAt(profile.workEnd || '18:00', 18, now);
  }

  // 3) 归零后：明确的状态转换
  if (t >= end.getTime()) {
    return { mode: plan.mode, tone: 'done', text: cfg.texts.done, isCountdown: false };
  }
  // 4) 未到上班时间：提示尚未开始
  if (t < start.getTime()) {
    return { mode: plan.mode, tone: 'pre', text: cfg.texts.pre, isCountdown: false };
  }
  // 5) 倒计时进行中
  const prefix =
    plan.mode === 'overtime' ? cfg.texts.overtimeCountdown : cfg.texts.normalCountdown;
  return {
    mode: plan.mode,
    tone: 'count',
    text: prefix + formatHMS(end.getTime() - t),
    isCountdown: true,
  };
}
