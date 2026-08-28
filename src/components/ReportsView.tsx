import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useReportStore } from '../store/reportsStore';
import { useTaskStore } from '../store/taskStore';
import type { Report, ReportType } from '../types';
import { ConfirmDialog } from './ConfirmDialog';
import { ReportForm, type ReportFormData } from './ReportForm';
import { BackToTop } from './BackToTop';
import { parseReports } from '../lib/parseReports';
import { getAIConfig } from '../lib/aiConfig';
import { generateAndSaveWeekly, weeklyDailies } from '../lib/aiReport';

// 报告卡片 / 导出展示用的日期时间：reportDate + 可选的 HH:mm
// 后端返回的 reportDate 是 ISO 字符串（如 2026-08-19T16:00:00.000Z），需按本地时区解析
function fmtReportDate(date: string | undefined, time?: string): string {
  if (!date) return '';
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const dateStr = `${y}-${m}-${day}`;
  return time ? `${dateStr} ${time}` : dateStr;
}

// 分点自动标点：除最后一条用句号「。」，其余用分号「；」
function punct(text: string, isLast: boolean): string {
  const t = text.trim();
  if (!t) return t;
  return t + (isLast ? '。' : '；');
}

export function ReportsView() {
  const store = useReportStore();
  const taskStore = useTaskStore();

  // 进入报告页（日报页）时主动刷新，避免数据库新增/他端修改的日报未及时同步到前端
  useEffect(() => {
    if (localStorage.getItem('dd_token')) store.refresh();
  }, [store.refresh]);
  const [filter, setFilter] = useState<ReportType | 'all'>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Report | null>(null);
  const [defaultType, setDefaultType] = useState<ReportType>('daily');
  const [pendingDelete, setPendingDelete] = useState<Report | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiStatus, setAiStatus] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const dailiesThisWeek = weeklyDailies(store.reports).length;
  const aiReady = dailiesThisWeek >= 5;
  const aiCfg = getAIConfig();

  const generateAI = async () => {
    const cfg = getAIConfig();
    if (!cfg.enabled) {
      setAiStatus('AI 周报未启用，请到「设置中心 → AI 周报」开启');
      return;
    }
    if (!aiReady) {
      setAiStatus(`本周日报不足 5 条（当前 ${dailiesThisWeek} 条），暂无法生成`);
      return;
    }
    setAiBusy(true);
    setAiStatus('正在调用大模型生成周报…');
    const res = await generateAndSaveWeekly(
      cfg,
      taskStore.tasks ?? [],
      store.reports,
      store.addReport
    );
    setAiBusy(false);
    if (res.ok) {
      setAiStatus(res.skipped ? '本周周报已存在，已跳过' : `已生成周报：${res.title}`);
    } else {
      setAiStatus(`生成失败：${res.error}`);
    }
  };

  const filtered = store.reports.filter((r) => (filter === 'all' ? true : r.type === filter));

  const openNew = (type: ReportType) => {
    setDefaultType(type);
    setEditing(null);
    setFormOpen(true);
  };

  const edit = (r: Report) => {
    setEditing(r);
    setDefaultType(r.type);
    setFormOpen(true);
  };

  const submit = async (data: ReportFormData) => {
    try {
      if (editing) {
        await store.updateReport(editing.id, data);
      } else {
        await store.addReport(data);
      }
      setFormOpen(false);
      setEditing(null);
    } catch (e: any) {
      alert(`保存失败：${e.message || '未知错误'}`);
    }
  };

  const clone = async (r: Report) => {
    await store.clone(r.id, { type: r.type });
  };

  const remove = async () => {
    if (pendingDelete) {
      await store.remove(pendingDelete.id);
      setPendingDelete(null);
    }
  };

  const renderReportMd = (r: Report): string => {
    const bullets = r.bullets.length
      ? r.bullets.map((b, i) => `${i + 1}. ${punct(b, i === r.bullets.length - 1)}`).join('\n')
      : '（暂无分点）';
    const dateRange =
      r.type === 'weekly' && r.endDate
        ? `${fmtReportDate(r.reportDate, r.reportTime)} 至 ${fmtReportDate(r.endDate, r.reportTime)}`
        : fmtReportDate(r.reportDate, r.reportTime);
    const meta = [r.type === 'daily' ? '日报' : '周报', r.company].filter(Boolean).join(' · ');
    return `### ${r.title}（${meta}）\n> ${dateRange}\n\n${bullets}\n`;
  };

  const buildMarkdown = (): string => {
    const now = new Date();
    const section = (title: string, list: Report[]) => {
      if (!list.length) return `## ${title}\n\n（暂无）\n\n`;
      return `## ${title}\n\n${list.map(renderReportMd).join('\n')}\n`;
    };
    const daily = store.reports.filter((r) => r.type === 'daily');
    const weekly = store.reports.filter((r) => r.type === 'weekly');
    return (
      `# 🐮🐴的打工日志 · 报告导出\n\n` +
      `导出时间：${now.toLocaleString('zh-CN')}\n\n` +
      section('日报', daily) +
      section('周报', weekly)
    );
  };

  const downloadText = async (content: string, filename: string) => {
    const electronAPI = (window as any).electronAPI;
    if (electronAPI?.exportReport) {
      const res = await electronAPI.exportReport(content, filename);
      if (!res?.ok && !res?.cancelled) {
        alert(`导出失败：${res?.error || '未知错误'}`);
      }
      return;
    }
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const stamp = () => {
    const now = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(
      now.getMinutes()
    )}`;
  };

  const exportAll = async () => {
    if (!store.reports.length) return;
    await downloadText(buildMarkdown(), `牛马打工日志-报告导出-${stamp()}.md`);
  };

  const exportOne = async (r: Report) => {
    await downloadText(renderReportMd(r), `牛马打工日志-${r.title || '报告'}-${stamp()}.md`);
  };

  const formatReportCopy = (r: Report): string => {
    const lines = r.bullets.length
      ? r.bullets.map((b, i) => {
          const isLast = i === r.bullets.length - 1;
          return `${i + 1}. ${b.trim()}${isLast ? '。' : '；'}`;
        })
      : ['（暂无分点）'];
    return lines.join('\n');
  };

  // 跨端复制：优先用 navigator.clipboard（需安全上下文+用户手势）；
  // 移动端 Capacitor WebView 往往无 clipboard 或非安全上下文，退回隐藏文本域 + execCommand('copy')。
  const copyText = async (text: string): Promise<boolean> => {
    try {
      if (navigator.clipboard && window.isSecureContext && document.hasFocus()) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      /* 走兜底 */
    }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-9999px';
      ta.style.left = '0';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      ta.setSelectionRange(0, text.length);
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  };

  const copyOne = async (r: Report) => {
    const ok = await copyText(formatReportCopy(r));
    if (ok) {
      setCopiedId(r.id);
      setTimeout(() => setCopiedId(null), 1500);
    } else {
      alert('复制失败，请手动复制');
    }
  };

  const TEMPLATE = `# 牛马打工日志 · 导入模板

# 说明：按下面格式填写，保存为 .md 后点「导入」即可。
# - 日报：以「MM月DD日」开头的行作为标题，其下方序号列表为分点
# - 周报：以「**本周（中小企）**」开头的行作为标题，到 --- 分隔符结束
# - 可选：用「公司：xxx」指定单位（对之后每条报告生效，直到再次出现该行为止）

公司：威希德

## 日报示例
08月19日
1. 完成设备监测系统选型方案初稿
2. 推进威希德设备管理系统 5 步异常闭环
3. 与客户确认现场触摸屏监控覆盖范围

## 周报示例
**本周（中小企）**
1. 完成生产看板 KPI 卡片与趋势图设计
2. 推进画景食品产品主数据治理
3. 输出数转平台报价方案模板（订阅+实施）
---
`;

  const downloadTemplate = () => {
    downloadText(TEMPLATE, '牛马打工日志-导入模板.md');
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const triggerImport = () => fileInputRef.current?.click();

  const onFileImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseReports(text);
      if (parsed.length === 0) {
        const preview = text.trim().slice(0, 80).replace(/\s+/g, ' ');
        alert(
          `未识别到可导入的报告。\n文件名：${file.name}\n大小：${file.size} 字节\n前 80 字：${preview || '（空文件）'}\n\n请确认选择的是 🐂🐎Daily.md 这类日志文件。`
        );
        return;
      }
      let ok = 0;
      let fail = 0;
      for (const p of parsed) {
        try {
          await store.addReport({
            type: p.type,
            title: p.title,
            reportDate: p.date,
            endDate: p.endDate,
            company: p.company ?? '',
            bullets: p.bullets,
          });
          ok++;
        } catch {
          fail++;
        }
      }
      alert(`导入完成：成功 ${ok} 条，失败 ${fail} 条（已并入日报 / 周报列表）`);
    } catch (err: any) {
      alert(`导入失败：${err?.message || '读取文件出错'}`);
    } finally {
      e.target.value = '';
    }
  };

  return (
    <div className="report-view">
      <div className="report-header">
        <div className="report-filter">
          <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>
            全部
          </button>
          <button className={filter === 'daily' ? 'active' : ''} onClick={() => setFilter('daily')}>
            日报
          </button>
          <button className={filter === 'weekly' ? 'active' : ''} onClick={() => setFilter('weekly')}>
            周报
          </button>
        </div>
        <div className="report-add-group">
          <button className="btn primary" onClick={() => openNew('daily')}>
            + 日报
          </button>
          <button className="btn primary" onClick={() => openNew('weekly')}>
            + 周报
          </button>
        </div>
        <div className="report-tools">
          <button className="btn export-btn" onClick={exportAll} disabled={!store.reports.length}>
            ⬇ 导出
          </button>
          <button className="btn template-btn" onClick={downloadTemplate}>
            ⬇ 模板
          </button>
          <button className="btn import-btn" onClick={triggerImport}>
            ⬆ 导入
          </button>
        </div>
        <button
          className="btn ai-gen-btn"
          onClick={generateAI}
          disabled={aiBusy}
          title="按设置中心的配置，调用大模型生成本周周报"
        >
          {aiBusy ? '生成中…' : '🤖 AI 生成本周周报'}
        </button>
        <div className={`ai-status ${aiReady ? '' : 'warn'}`}>
          本周日报 {dailiesThisWeek} / 5 条
          {aiReady
            ? aiCfg.enabled
              ? `（满足生成条件 ✓）预计 ${aiCfg.genTime || '18:00'}:00 时进行生成`
              : '（满足生成条件 ✓）未启用自动生成，可到设置中心开启'
            : '（需 ≥ 5 条方可生成）'}
        </div>
        {aiStatus && <div className="ai-status-msg">{aiStatus}</div>}
        <input
          ref={fileInputRef}
          type="file"
          accept=".md,.markdown,.txt,text/markdown,text/plain,*/*"
          style={{ display: 'none' }}
          onChange={onFileImport}
        />
      </div>

      {store.loading && filtered.length === 0 && <div className="empty">加载中…</div>}
      {store.error && <div className="err report-err">{store.error}</div>}

      <div className="report-list">
        {filtered.length === 0 && !store.loading ? (
          <div className="empty">
            <span className="big">📝</span>
            还没有{typeLabel(filter)}，点上方按钮添加一个吧！
          </div>
        ) : (
          filtered.map((r) => (
            <div key={r.id} className={`report-card ${r.type}`}>
              <div className="report-card-head">
                <div className="report-title-row">
                  <span className="report-badge">{r.type === 'daily' ? '日报' : '周报'}</span>
                  <span className="report-title">{r.title}</span>
                </div>
                <span className="report-date">
                  {r.type === 'weekly' && r.endDate
                    ? `${fmtReportDate(r.reportDate)} 至 ${fmtReportDate(r.endDate)}`
                    : fmtReportDate(r.reportDate)}
                  <span className="report-time">{r.reportTime}</span>
                </span>
              </div>
              <ol className="report-bullets">
                {r.bullets.length === 0 ? (
                  <li className="empty-bullet">（暂无分点）</li>
                ) : (
                  r.bullets.map((b, i) => (
                    <li key={i}>
                      <span className="report-bullet-num">{i + 1}.</span>
                      {punct(b, i === r.bullets.length - 1)}
                    </li>
                  ))
                )}
              </ol>
              <div className="report-actions">
                <button className="icon-btn" onClick={() => exportOne(r)} title="导出此条">
                  ⬇
                </button>
                <button className="icon-btn" onClick={() => copyOne(r)} title="复制内容">
                  {copiedId === r.id ? '✓' : '📋'}
                </button>
                <button className="icon-btn" onClick={() => edit(r)} title="编辑">
                  ✎
                </button>
                <button className="icon-btn" onClick={() => clone(r)} title="复制为新的">
                  ⧉
                </button>
                <button className="icon-btn danger" onClick={() => setPendingDelete(r)} title="删除">
                  🗑
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {formOpen && (
        <ReportForm initial={editing} defaultType={defaultType} onSubmit={submit} onClose={() => setFormOpen(false)} />
      )}
      <ConfirmDialog
        open={!!pendingDelete}
        title="删除报告？"
        message={pendingDelete ? `确定要删除「${pendingDelete.title}」吗？删除后不可恢复。` : ''}
        confirmText="删除"
        cancelText="再想想"
        onConfirm={remove}
        onCancel={() => setPendingDelete(null)}
      />
      <BackToTop />
    </div>
  );
}

function typeLabel(f: ReportType | 'all'): string {
  if (f === 'daily') return '日报';
  if (f === 'weekly') return '周报';
  return '报告';
}
