// 解析「牛马打工日志」风格的 Markdown 文件，拆分成日报 / 周报报告。
//
// 约定（与 C:\Users\72980\Desktop\🐂🐎Daily.md 一致）：
//  - 日报：以 `MM月DD日`（可带括号后缀，如 `05月06日（调休）`）开头的标题，
//          其下方、到下一个标题 / 周报 / 分隔符之前的序号列表为内容。
//  - 周报：以 `**本周（中小企）**` 开头的标题，其下方、`---` 上方的内容为内容
//          （有序号列表或整段文字）。日期取该周报前最近一条日报所在周的周一。

export interface ParsedReport {
  type: 'daily' | 'weekly';
  title: string;
  date: string; // YYYY-MM-DD 开始时间
  endDate: string; // YYYY-MM-DD 结束时间（日报与 date 相同，周报 = date + 6 天）
  company?: string; // 所属公司 / 单位（可选，由「公司：xxx」行指定）
  bullets: string[];
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function mondayOf(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay(); // 0=周日 .. 6=周六
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}

function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function makeDate(mon: number, day: number): Date {
  // 文件不含年份，默认取当前年份（适用于同一年内的连续日志）
  const year = new Date().getFullYear();
  return new Date(year, mon - 1, day);
}

export function parseReports(text: string): ParsedReport[] {
  const clean = text.replace(/^\uFEFF/, '').replace(/\r/g, '\n');
  const lines = clean.split(/\n/);
  const result: ParsedReport[] = [];
  let lastDaily: Date | null = null;
  let current: ParsedReport | null = null;
  let pendingCompany: string | null = null;

  const dailyRe = /^(\d{1,2})月(\d{1,2})日/;
  const weeklyRe = /^\*\*本周/;
  const sepRe = /^---+\s*$/;
  const bulletRe = /^\s*\d+[.、)]\s*(.*)$/;
  const companyRe = /^(?:公司|单位|企业)\s*[:：]\s*(.+)$/;

  const flush = () => {
    if (current && current.bullets.length) result.push(current);
    current = null;
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    const cm = companyRe.exec(line);
    if (cm) {
      pendingCompany = cm[1].trim();
      continue;
    }

    const dm = dailyRe.exec(line);
    if (dm) {
      flush();
      const d = makeDate(parseInt(dm[1], 10), parseInt(dm[2], 10));
      lastDaily = d;
      current = { type: 'daily', title: line, date: toYMD(d), endDate: toYMD(d), company: pendingCompany ?? undefined, bullets: [] };
      continue;
    }

    if (weeklyRe.test(line)) {
      flush();
      const base = lastDaily ?? new Date();
      const mon = mondayOf(base);
      current = {
        type: 'weekly',
        title: '本周（中小企）',
        date: toYMD(mon),
        endDate: toYMD(addDays(mon, 6)),
        company: pendingCompany ?? undefined,
        bullets: [],
      };
      continue;
    }

    if (sepRe.test(line)) {
      flush();
      continue;
    }

    if (current) {
      const bm = bulletRe.exec(line);
      const content = bm ? bm[1].trim() : line;
      if (content) current.bullets.push(content);
    }
  }
  flush();
  return result;
}
