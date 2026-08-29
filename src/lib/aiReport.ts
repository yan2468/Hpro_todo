import type { AIConfig } from './aiConfig';
import { normalizeAIUrl } from './aiConfig';
import type { Report, Task } from '../types';
import { categoryLabel } from '../types';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface WeeklyResult {
  title: string;
  bullets: string[];
}

export interface GenResult {
  ok: boolean;
  skipped?: boolean; // 本周已生成，自动模式下跳过
  title?: string;
  error?: string;
}

// ===== 本周时间范围（周一 00:00 ~ 周日 23:59:59，本地时区）=====
export function weekRange(now: Date = new Date()) {
  const start = new Date(now);
  const dow = (start.getDay() + 6) % 7; // 周一=0
  start.setDate(start.getDate() - dow);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  const p = (n: number) => String(n).padStart(2, '0');
  return {
    start,
    end,
    startStr: `${start.getFullYear()}-${p(start.getMonth() + 1)}-${p(start.getDate())}`,
    endStr: `${end.getFullYear()}-${p(end.getMonth() + 1)}-${p(end.getDate())}`,
  };
}

// 把 reportDate 转成本地时区的 YYYY-MM-DD。
// ponytail: 之前用 .slice(0,10) 是错的——后端 SELECT date 列返回的是 Date 对象，
// JSON 序列化为 '2026-08-21T00:00:00.000Z' 时 slice 拿到 UTC 日期，比本地少 1 天。
// 改用 new Date + 本地年月日，与 fmtReportDate 保持一致即可。
function toLocalYMD(s: string): string {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d.getTime())) return s.slice(0, 10);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

// ===== 本周日报数量（自动生成前提：>=5）=====
export function weeklyDailies(reports: Report[], now: Date = new Date()): Report[] {
  const { startStr, endStr } = weekRange(now);
  return reports.filter((r) => {
    if (r.type !== 'daily' || !r.reportDate) return false;
    const s = toLocalYMD(r.reportDate);
    return s >= startStr && s <= endStr;
  });
}

export function hasWeeklyThisWeek(reports: Report[], now: Date = new Date()): boolean {
  const { startStr, endStr } = weekRange(now);
  return reports.some((r) => {
    if (r.type !== 'weekly' || !r.reportDate) return false;
    const d = toLocalYMD(r.reportDate);
    return d >= startStr && d <= endStr;
  });
}

// ===== 调用大模型（桌面端走主进程 ai:chat 规避 CORS，移动/Web 走直连）=====
export async function callLLM(config: AIConfig, messages: ChatMessage[]): Promise<string> {
  const url = normalizeAIUrl(config.url);
  if (!url) throw new Error('接口地址为空，请先在设置中心填写');
  const electronAPI = (window as any).electronAPI;
  if (electronAPI?.aiChat) {
    const res = await electronAPI.aiChat({
      url,
      apiKey: config.apiKey,
      model: config.model,
      temperature: config.temperature,
      messages,
    });
    if (!res?.ok) throw new Error(res?.error || 'AI 调用失败');
    return res.content as string;
  }
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: config.temperature,
    }),
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    throw new Error(`AI 调用失败 HTTP ${resp.status}：${txt.slice(0, 160)}`);
  }
  const j = await resp.json();
  return j?.choices?.[0]?.message?.content ?? '';
}

function cleanBullet(s: string): string {
  return s
    .replace(/^\s*[\d]+[.、)）]\s*/, '')
    .replace(/^[-*•]\s*/, '')
    .replace(/^["'「『]|["'」』]$/g, '')
    .trim();
}

// 从模型输出解析 title + bullets（优先 JSON，失败则按行解析）
function parseResult(text: string): WeeklyResult {
  const trimmed = text.trim();
  try {
    const obj = JSON.parse(trimmed);
    const bullets = Array.isArray(obj.bullets)
      ? obj.bullets.map((b: any) => cleanBullet(String(b))).filter(Boolean)
      : [];
    const title = (obj.title || '').toString().trim() || '本周工作周报';
    return { title, bullets: bullets.length ? bullets : [cleanBullet(trimmed)].filter(Boolean) };
  } catch {
    const lines = trimmed
      .split(/\r?\n/)
      .map(cleanBullet)
      .filter(Boolean);
    return { title: '本周工作周报', bullets: lines.length ? lines : [trimmed] };
  }
}

// 组装本周数据 + 构造提示词
function buildMessages(config: AIConfig, tasks: Task[], reports: Report[], now: Date) {
  const { startStr, endStr } = weekRange(now);
  const dailies = weeklyDailies(reports, now);
  const weekTasks = tasks.filter((t) => {
    const c = new Date(t.createdAt);
    return c >= weekRange(now).start && c <= weekRange(now).end;
  });

  const dailyText = dailies.length
    ? dailies
        .map((r) => {
          const bullets = r.bullets.length ? r.bullets.map((b) => `  - ${b}`).join('\n') : '  （无分点）';
          return `【${r.reportDate} 日报】${r.company ? ' · ' + r.company : ''}\n${bullets}`;
        })
        .join('\n')
    : '（本周暂无以日报）';

  const taskText = weekTasks.length
    ? weekTasks
        .map(
          (t) =>
            `- ${t.title}（${t.status === 'completed' ? '已完成' : t.status === 'postponed' ? '已延期' : '进行中'} · ${categoryLabel(t.category)}）`
        )
        .join('\n')
    : '（本周暂无关联任务）';

  const system =
    config.prompt.trim() +
    (config.skills.trim() ? `\n\n附加技能 / 指令：\n${config.skills.trim()}` : '');

  const user =
    `请基于以下「${startStr} ~ ${endStr}」本周资料生成周报。\n\n` +
    `=== 本周日报 ===\n${dailyText}\n\n` +
    `=== 本周任务 ===\n${taskText}\n\n` +
    `请严格以如下 JSON 格式输出（不要包裹在代码块里）：\n` +
    `{ "title": "本周工作周报（${startStr} ~ ${endStr}）", "bullets": ["分点1", "分点2", ...] }`;

  return [
    { role: 'system' as const, content: system },
    { role: 'user' as const, content: user },
  ];
}

// 仅生成内容（不落库），供预览 / 测试
export async function buildWeeklyReport(
  config: AIConfig,
  tasks: Task[],
  reports: Report[],
  now: Date = new Date()
): Promise<WeeklyResult> {
  const dailies = weeklyDailies(reports, now);
  if (dailies.length < 5) {
    throw new Error(`本周日报不足 5 条（当前 ${dailies.length} 条），暂不生成周报`);
  }
  const messages = buildMessages(config, tasks, reports, now);
  const content = await callLLM(config, messages);
  return parseResult(content);
}

// 生成并落库为周报（自动模式跳过本周已生成）
export async function generateAndSaveWeekly(
  config: AIConfig,
  tasks: Task[],
  reports: Report[],
  addReport: (r: Partial<Report>) => Promise<any>,
  now: Date = new Date()
): Promise<GenResult> {
  if (!config.enabled) return { ok: false, error: 'AI 周报未启用' };
  if (!config.apiKey || !config.url) return { ok: false, error: '请先在设置中心填写 API Key 与接口地址' };
  if (hasWeeklyThisWeek(reports, now)) return { ok: true, skipped: true };

  const dailies = weeklyDailies(reports, now);
  if (dailies.length < 5) {
    return { ok: false, error: `本周日报不足 5 条（当前 ${dailies.length} 条），无法生成` };
  }

  try {
    const result = await buildWeeklyReport(config, tasks, reports, now);
    await addReport({
      type: 'weekly',
      title: result.title,
      reportDate: weekRange(now).startStr,
      reportTime: config.genTime,
      bullets: result.bullets,
    });
    return { ok: true, title: result.title };
  } catch (e: any) {
    return { ok: false, error: e?.message || '生成失败' };
  }
}
