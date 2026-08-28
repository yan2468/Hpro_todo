import { app, BrowserWindow, Menu, ipcMain, dialog, screen, Notification } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { spawnSync } from 'child_process';

// 去除默认菜单栏（File / Edit / View / Window / Help）
Menu.setApplicationMenu(null);

let mainWin: BrowserWindow | null = null;
let widgetWin: BrowserWindow | null = null;
let splashWin: BrowserWindow | null = null;
// 关闭拦截开关：为 true 时允许真正退出（对应「直接关闭」）
let forceClose = false;

function splashHtml(): string {
  return path.join(app.getAppPath(), 'dist', 'splash.html');
}

function createSplashWindow() {
  splashWin = new BrowserWindow({
    width: 360,
    height: 480,
    frame: false,
    transparent: false,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    backgroundColor: '#fffdf5',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  splashWin.loadFile(splashHtml());
  splashWin.once('ready-to-show', () => {
    splashWin?.show();
  });
}

function closeSplashWindow() {
  if (splashWin && !splashWin.isDestroyed()) {
    splashWin.close();
    splashWin = null;
  }
}

// 凭证缓存（供桌面小组件独立拉取任务，避免依赖渲染进程 localStorage）
const authFile = path.join(app.getPath('userData'), 'widget-auth.json');
let authState: { token: string | null; base: string | null } | null = (() => {
  try {
    return JSON.parse(fs.readFileSync(authFile, 'utf8'));
  } catch {
    return null;
  }
})();
function saveAuth(a: { token: string | null; base: string | null }) {
  authState = a;
  try {
    fs.writeFileSync(authFile, JSON.stringify(a));
  } catch {
    /* ignore */
  }
}

// ===== AI 自动生成配置（与渲染端 dd_ai_config 同步，主进程调度用）=====
const aiConfigFile = path.join(app.getPath('userData'), 'ai-config.json');
function readAIConfig(): any | null {
  try {
    return JSON.parse(fs.readFileSync(aiConfigFile, 'utf8'));
  } catch {
    return null;
  }
}
let aiConfigCache: any = readAIConfig();
function saveAIConfigCache(c: any) {
  aiConfigCache = c;
  try {
    fs.writeFileSync(aiConfigFile, JSON.stringify(c));
  } catch {
    /* ignore */
  }
}

// ===== 关闭行为偏好（最小化到后台 / 直接关闭 + 记住选择）=====
const closePrefFile = path.join(app.getPath('userData'), 'close-pref.json');
type ClosePref = { remember: boolean; action: 'minimize' | 'quit' | null };
function readClosePref(): ClosePref {
  try {
    const p = JSON.parse(fs.readFileSync(closePrefFile, 'utf8'));
    if (p && typeof p.remember === 'boolean' && (p.action === 'minimize' || p.action === 'quit' || p.action === null)) {
      return p as ClosePref;
    }
  } catch {
    /* ignore */
  }
  return { remember: false, action: null };
}
function saveClosePref(p: ClosePref) {
  try {
    fs.writeFileSync(closePrefFile, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

function indexHtml(): string {
  return path.join(app.getAppPath(), 'dist', 'index.html');
}

function createWidgetWindow() {
  if (widgetWin && !widgetWin.isDestroyed()) {
    widgetWin.focus();
    return;
  }
  widgetWin = new BrowserWindow({
    width: 320,
    height: 460,
    minWidth: 240,
    minHeight: 300,
    frame: false, // 无边框，作为桌面悬浮挂件
    transparent: true, // 支持背景透明度调节
    alwaysOnTop: false, // 不置顶：像桌面便签一样呆在桌面，而不是挡在其他窗口前面
    type: 'toolbar', // Windows 工具窗口：不出现在任务栏 / Alt+Tab，像桌面小组件
    skipTaskbar: true, // 双保险：不出现在任务栏
    resizable: true,
    hasShadow: false, // 去掉系统窗口阴影，更像一个贴桌面的小组件
    closable: true, // 支持关闭：应用内 ✕ 或系统关闭均可
    minimizable: false,
    maximizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
    },
  });
  widgetWin.loadFile(indexHtml(), { hash: 'widget' });
  widgetWin.on('closed', () => {
    widgetWin = null;
  });
  // ponytail: 把小组件嵌入桌面层（与壁纸同级），桌面图标会在 widget 上方、widget 不再遮挡其他应用窗口
  widgetWin.webContents.once('did-finish-load', () => pinWindowToDesktop(widgetWin!));
}

// Windows: 通过 Win32 SetParent 把小组件挂到 Progman/WorkerW 之下，使其处于「桌面层」
// ponytail: 仅 Windows 走这条路；macOS / Linux 跳过
function pinWindowToDesktop(win: BrowserWindow) {
  if (process.platform !== 'win32') return;
  try {
    const hwndBuf = win.getNativeWindowHandle();
    const hwndHex = [...hwndBuf].map((b) => b.toString(16).padStart(2, '0')).join('');
    const ps = [
      'Add-Type -TypeDefinition @"',
      'using System;',
      'using System.Runtime.InteropServices;',
      'public class W {',
      '  [DllImport("user32.dll", SetLastError=true)] public static extern IntPtr FindWindow(string c, string w);',
      '  [DllImport("user32.dll", SetLastError=true)] public static extern IntPtr SetParent(IntPtr h, IntPtr p);',
      '  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr h, uint m, IntPtr w, IntPtr l);',
      '}"@ -ErrorAction SilentlyContinue',
      `$prog = [W]::FindWindow('Progman', $null)`,
      `[W]::SendMessage($prog, 0x052C, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null`,
      `$worker = [W]::FindWindow('WorkerW', $null)`,
      `if ($worker -eq [IntPtr]::Zero) { $worker = $prog }`,
      `[W]::SetParent([IntPtr]0x${hwndHex}, $worker) | Out-Null`,
    ].join('\n');
    spawnSync('powershell.exe', ['-NoProfile', '-Command', ps], {
      stdio: 'ignore',
      windowsHide: true,
    });
  } catch (e) {
    console.error('pinWindowToDesktop failed', e);
  }
}

ipcMain.handle('widget:open', () => {
  createWidgetWindow();
  return true;
});
ipcMain.handle('widget:close', () => {
  if (widgetWin && !widgetWin.isDestroyed()) widgetWin.close();
  return true;
});

// ===== 桌面端提醒：右下角弹窗 + 电子音 =====
const scheduledReminders = new Map<string, NodeJS.Timeout>();
let reminderPopupWin: BrowserWindow | null = null;

function showReminderPopup(title: string, id?: string) {
  if (reminderPopupWin && !reminderPopupWin.isDestroyed()) {
    reminderPopupWin.close();
  }
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  const w = 320;
  const h = 150;
  reminderPopupWin = new BrowserWindow({
    width: w,
    height: h,
    x: Math.max(16, sw - w - 16),
    y: Math.max(16, sh - h - 16),
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    transparent: true,
    hasShadow: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
    },
  });
  const params = new URLSearchParams({ title });
  if (id) params.set('id', id);
  reminderPopupWin.loadFile(indexHtml(), { hash: `reminder?${params.toString()}` });
  reminderPopupWin.on('closed', () => {
    reminderPopupWin = null;
  });
  // 12 秒后自动关闭，避免长期占用右下角
  setTimeout(() => {
    if (reminderPopupWin && !reminderPopupWin.isDestroyed()) reminderPopupWin.close();
  }, 12000);
}

ipcMain.handle(
  'reminder:schedule',
  (_e, payload: { title: string; time: string; id?: string }) => {
    const { title, time, id } = payload;
    if (id && scheduledReminders.has(id)) {
      clearTimeout(scheduledReminders.get(id)!);
      scheduledReminders.delete(id);
    }
    const delay = new Date(time).getTime() - Date.now();
    if (delay <= 0) return { ok: false, past: true };
    const timer = setTimeout(() => {
      showReminderPopup(title, id);
      if (id) scheduledReminders.delete(id);
    }, delay);
    if (id) scheduledReminders.set(id, timer);
    return { ok: true };
  }
);

ipcMain.handle('reminder:cancel', (_e, id: string) => {
  if (scheduledReminders.has(id)) {
    clearTimeout(scheduledReminders.get(id)!);
    scheduledReminders.delete(id);
  }
  return { ok: true };
});

ipcMain.handle('auth:set', (_e, a) => {
  saveAuth(a);
  return true;
});
ipcMain.handle('auth:get', () => authState);

// ===== AI 调度：渲染端保存配置后推过来，主进程按 frequency/time 定时触发生成 =====
// ponytail: 调度器只跑一份，触发时间到了就跑 autoGenerateWeeklyOnce()
let aiTimer: NodeJS.Timeout | null = null;

function nextTriggerDate(c: any, now: Date = new Date()): Date | null {
  if (!c || !c.genTime || !c.genFrequency) return null;
  const [h, m] = String(c.genTime).split(':').map((x) => Number(x));
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  const next = new Date(now);
  next.setHours(h, m, 0, 0);
  if (c.genFrequency === 'daily') {
    if (next <= now) next.setDate(next.getDate() + 1);
    return next;
  }
  if (c.genFrequency === 'weekly') {
    const target = (((c.genWeekday ?? 5) % 7) + 7) % 7;
    let diff = (target - next.getDay() + 7) % 7;
    if (diff === 0 && next <= now) diff = 7;
    next.setDate(next.getDate() + diff);
    return next;
  }
  if (c.genFrequency === 'custom') {
    const interval = Math.max(1, Number(c.genInterval) || 1);
    if (c.genLastAt) {
      const last = new Date(c.genLastAt);
      if (!isNaN(last.getTime())) {
        const base = new Date(last);
        base.setDate(base.getDate() + interval);
        base.setHours(h, m, 0, 0);
        if (base > now) return base;
      }
    }
    if (next <= now) next.setDate(next.getDate() + 1);
    return next;
  }
  return null;
}

function rescheduleAI() {
  if (aiTimer) {
    clearTimeout(aiTimer);
    aiTimer = null;
  }
  const c = aiConfigCache;
  if (!c || !c.enabled) return;
  // 事件触发模式由渲染端在添加第 5 条日报时即时处理，主进程不再定时调度
  if (c.genMode === 'event') {
    console.log('[ai-scheduler] event mode, skip timed scheduling');
    return;
  }
  const t = nextTriggerDate(c);
  if (!t) return;
  const delay = Math.max(1000, t.getTime() - Date.now());
  aiTimer = setTimeout(async () => {
    try {
      await autoGenerateWeeklyOnce();
    } catch (e) {
      console.error('autoGenerateWeeklyOnce error', e);
    } finally {
      rescheduleAI();
    }
  }, delay);
  console.log('[ai-scheduler] next run at', t.toLocaleString(), 'in', delay, 'ms');
}

ipcMain.handle('ai:set-config', (_e, c: any) => {
  saveAIConfigCache(c || {});
  rescheduleAI();
  return true;
});
ipcMain.handle('ai:get-config', () => aiConfigCache);
ipcMain.handle('ai:run-now', async () => {
  const r = await autoGenerateWeeklyOnce();
  rescheduleAI();
  return r;
});

// 真正跑一次：拉本周日报+任务，调用大模型，写周报
async function autoGenerateWeeklyOnce(): Promise<{ ok: boolean; skipped?: boolean; title?: string; error?: string }> {
  const c = aiConfigCache;
  if (!c || !c.enabled) return { ok: false, error: 'AI 未启用' };
  if (!authState || !authState.token || !authState.base) return { ok: false, error: '未登录' };
  if (!c.apiKey || !c.url) return { ok: false, error: '请先在设置中心填写 API Key 与接口地址' };

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${authState.token}`,
  };
  const base = authState.base.replace(/\/$/, '');

  try {
    // 1) 拉本周日报 + 任务
    const [reportsRes, tasksRes] = await Promise.all([
      fetch(`${base}/reports`, { headers }),
      fetch(`${base}/tasks`, { headers }),
    ]);
    if (!reportsRes.ok) return { ok: false, error: `拉报告失败 HTTP ${reportsRes.status}` };
    if (!tasksRes.ok) return { ok: false, error: `拉任务失败 HTTP ${tasksRes.status}` };
    const reports: any[] = await reportsRes.json();
    const tasks: any[] = await tasksRes.json();

    // 2) 筛本周日报
    const now = new Date();
    const dow = (now.getDay() + 6) % 7;
    const wkStart = new Date(now);
    wkStart.setDate(wkStart.getDate() - dow);
    wkStart.setHours(0, 0, 0, 0);
    const wkEnd = new Date(wkStart);
    wkEnd.setDate(wkEnd.getDate() + 6);
    wkEnd.setHours(23, 59, 59, 999);

    const toLocalYMD = (s: any): string => {
      if (!s) return '';
      const d = new Date(s);
      if (isNaN(d.getTime())) return String(s).slice(0, 10);
      const y = d.getFullYear();
      const mo = String(d.getMonth() + 1).padStart(2, '0');
      const da = String(d.getDate()).padStart(2, '0');
      return `${y}-${mo}-${da}`;
    };
    const startStr = `${wkStart.getFullYear()}-${String(wkStart.getMonth() + 1).padStart(2, '0')}-${String(wkStart.getDate()).padStart(2, '0')}`;
    const endStr = `${wkEnd.getFullYear()}-${String(wkEnd.getMonth() + 1).padStart(2, '0')}-${String(wkEnd.getDate()).padStart(2, '0')}`;

    const dailies = reports.filter(
      (r) =>
        r.type === 'daily' &&
        r.reportDate &&
        (() => {
          const d = toLocalYMD(r.reportDate);
          return d >= startStr && d <= endStr;
        })()
    );
    if (dailies.length < 5) {
      return { ok: false, error: `本周日报不足 5 条（${dailies.length} 条），跳过` };
    }

    // 本周已存在周报则跳过
    const hasWeekly = reports.some((r) => r.type === 'weekly' && toLocalYMD(r.reportDate) === startStr);
    if (hasWeekly) return { ok: true, skipped: true };

    // 3) 组装 prompt 并调大模型
    const dailyText = dailies
      .map((r) => {
        const bullets = (r.bullets ?? []).map((b: string) => `  - ${b}`).join('\n') || '  （无分点）';
        return `【${toLocalYMD(r.reportDate)} 日报】${r.company ? ' · ' + r.company : ''}\n${bullets}`;
      })
      .join('\n');
    const weekTasks = tasks.filter((t) => {
      const cc = new Date(t.createdAt);
      return cc >= wkStart && cc <= wkEnd;
    });
    const taskText = weekTasks.length
      ? weekTasks
          .map(
            (t) =>
              `- ${t.title}（${
                t.status === 'completed' ? '已完成' : t.status === 'postponed' ? '已延期' : '进行中'
              }）`
          )
          .join('\n')
      : '（本周暂无关联任务）';

    const system = String(c.prompt ?? '').trim();
    const user =
      `请基于以下「${startStr} ~ ${endStr}」本周资料生成周报。\n\n` +
      `=== 本周日报 ===\n${dailyText}\n\n` +
      `=== 本周任务 ===\n${taskText}\n\n` +
      `请严格以如下 JSON 格式输出（不要包裹在代码块里）：\n` +
      `{ "title": "本周工作周报（${startStr} ~ ${endStr}）", "bullets": ["分点1", "分点2", ...] }`;

    const llmRes = await fetch(c.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${c.apiKey}`,
      },
      body: JSON.stringify({
        model: c.model || 'deepseek-chat',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: Number(c.temperature) || 0.7,
      }),
    });
    if (!llmRes.ok) {
      const t = await llmRes.text().catch(() => '');
      return { ok: false, error: `大模型 HTTP ${llmRes.status}：${t.slice(0, 160)}` };
    }
    const j = await llmRes.json();
    const content = j?.choices?.[0]?.message?.content ?? '';
    let title = `本周工作周报（${startStr} ~ ${endStr}）`;
    let bullets: string[] = [];
    try {
      const obj = JSON.parse(content);
      title = (obj.title ?? title).toString();
      bullets = Array.isArray(obj.bullets) ? obj.bullets.map((b: any) => String(b)) : [];
    } catch {
      bullets = content
        .split(/\r?\n/)
        .map((s: string) => s.replace(/^\s*[-*•\d.、)）]\s*/, '').trim())
        .filter(Boolean);
    }
    if (!bullets.length) return { ok: false, error: '模型未返回有效分点' };

    // 4) POST /reports 创建周报
    const createRes = await fetch(`${base}/reports`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        type: 'weekly',
        title,
        reportDate: startStr,
        reportTime: c.genTime || '18:00:00',
        bullets,
      }),
    });
    if (!createRes.ok) {
      const t = await createRes.text().catch(() => '');
      return { ok: false, error: `写入失败 HTTP ${createRes.status}：${t.slice(0, 160)}` };
    }
    const created = await createRes.json();
    void created;

    // 5) 广播 + 系统通知
    BrowserWindow.getAllWindows().forEach((w) => {
      if (!w.isDestroyed()) w.webContents.send('reports:changed');
    });
    try {
      new Notification({
        title: '🐮🐴 周报已生成',
        body: title,
      }).show();
    } catch {
      /* ignore */
    }
    // 6) 更新 genLastAt（custom 模式计算下次用）
    aiConfigCache = { ...(c || {}), genLastAt: new Date().toISOString() };
    saveAIConfigCache(aiConfigCache);
    return { ok: true, title };
  } catch (e: any) {
    return { ok: false, error: e?.message || '未知错误' };
  }
}

// 启动时如果有缓存配置就排上调度
app.whenReady().then(() => {
  if (aiConfigCache?.enabled) rescheduleAI();
});

// 大模型对话（DeepSeek / OpenAI 兼容）：由主进程发起请求，规避渲染进程 CORS 限制
ipcMain.handle(
  'ai:chat',
  async (
    _e,
    payload: {
      url: string;
      apiKey: string;
      model: string;
      temperature: number;
      messages: { role: string; content: string }[];
    }
  ) => {
    const { url, apiKey, model, temperature, messages } = payload;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model, messages, temperature }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        return { ok: false, error: `HTTP ${res.status}：${txt.slice(0, 200)}` };
      }
      const j = await res.json();
      return { ok: true, content: j?.choices?.[0]?.message?.content ?? '' };
    } catch (e: any) {
      return { ok: false, error: e?.message || '请求失败' };
    }
  }
);

// 桌面小组件直接更新任务状态（与主页面点击完成的逻辑保持一致）
ipcMain.handle(
  'task:update',
  async (_e, { id, patch }: { id: string; patch: Record<string, unknown> }) => {
    if (!authState || !authState.token || !authState.base) {
      return { ok: false, error: '未登录' };
    }
    try {
      const res = await fetch(`${authState.base}/tasks/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authState.token}`,
        },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        return { ok: false, error: body.error || `HTTP ${res.status}` };
      }
      // 改动成功：广播给所有窗口（含主窗口），让它们立即同步刷新
      broadcastTasksChanged();
      return { ok: true, data: await res.json() };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }
);

// 任一窗口（主窗口或小组件）改动任务后，请求主进程把「任务已变更」广播给所有窗口
function broadcastTasksChanged() {
  BrowserWindow.getAllWindows().forEach((w) => {
    if (!w.isDestroyed()) w.webContents.send('tasks:changed');
  });
}
ipcMain.on('tasks:changed-request', () => {
  broadcastTasksChanged();
});

ipcMain.handle(
  'report:export',
  async (_e, payload: { content: string; filename: string }) => {
    if (!mainWin) return { ok: false, cancelled: true };
    const { canceled, filePath } = await dialog.showSaveDialog(mainWin, {
      defaultPath: payload.filename,
      filters: [
        { name: 'Markdown', extensions: ['md'] },
        { name: '纯文本', extensions: ['txt'] },
      ],
    });
    if (canceled || !filePath) return { ok: false, cancelled: true };
    try {
      fs.writeFileSync(filePath, payload.content, 'utf8');
      return { ok: true, filePath };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }
);

// 自定义标题栏：窗口控制（最小化 / 最大化 / 关闭）
ipcMain.handle('window:minimize', () => {
  if (mainWin && !mainWin.isDestroyed()) mainWin.minimize();
  return true;
});
ipcMain.handle('window:maximize-or-restore', () => {
  if (!mainWin || mainWin.isDestroyed()) return false;
  if (mainWin.isMaximized()) mainWin.restore();
  else mainWin.maximize();
  return mainWin.isMaximized();
});
// 渲染端 × 按钮 / Alt+F4 / 任务栏关闭 都会汇聚到这里，触发上面的 close 拦截
ipcMain.on('window:requestClose', () => {
  if (mainWin && !mainWin.isDestroyed()) mainWin.close();
});
// 最小化到后台：仅隐藏主窗口，桌面小组件继续运行（独立窗口，不受影响）
ipcMain.handle('window:hide', () => {
  if (mainWin && !mainWin.isDestroyed()) mainWin.hide();
  return true;
});
// 直接关闭：放行真正的退出，主窗口关闭后会销毁小组件并 quit
ipcMain.handle('window:forceClose', () => {
  forceClose = true;
  if (mainWin && !mainWin.isDestroyed()) mainWin.close();
  return true;
});
// 关闭行为偏好（记住我的选择）
ipcMain.handle('app:getClosePref', () => readClosePref());
ipcMain.handle('app:setClosePref', (_e, p: ClosePref) => {
  saveClosePref(p || { remember: false, action: null });
  return true;
});
ipcMain.handle('window:isMaximized', () => {
  return !!mainWin && !mainWin.isDestroyed() && mainWin.isMaximized();
});

function createWindow() {
  mainWin = new BrowserWindow({
    width: 460,
    height: 840,
    minWidth: 360,
    minHeight: 620,
    title: '🐮🐴的打工日志',
    icon: path.join(app.getAppPath(), 'dist', 'icon.png'),
    backgroundColor: '#d7ece4',
    frame: false, // 隐藏原生标题栏，使用自定义标题栏
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
    },
  });
  mainWin.on('maximize', () => {
    if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('window:maximized-change', true);
  });
  mainWin.on('unmaximize', () => {
    if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('window:maximized-change', false);
  });
  // 关闭拦截：默认不直接退出，交给渲染端弹「最小化到后台 / 直接关闭」确认框。
  // 仅在 forceClose=true（用户明确选「直接关闭」）时放行真正退出。
  // 这样无论是点 ×、Alt+F4 还是任务栏关闭，都走同一套确认逻辑。
  mainWin.on('close', (e) => {
    if (forceClose) return;
    e.preventDefault();
    if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('app:request-close');
  });
  mainWin.loadFile(indexHtml());
  mainWin.webContents.on('did-finish-load', () => {
    setTimeout(closeSplashWindow, 260);
  });
  // 调试窗口：启动后自动弹出独立 DevTools（类似 F12），用于实时查看控制台报错
  // 生产环境默认关闭；需要调试时取消下面一行的注释
  // mainWin.webContents.openDevTools({ mode: 'detach' });
  mainWin.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error('did-fail-load', errorCode, errorDescription);
  });
  mainWin.webContents.on('console-message', (_event, level, message) => {
    console.log('console-message', level, message);
  });
  // 主窗口关闭时一并关闭小组件
  mainWin.on('closed', () => {
    if (widgetWin && !widgetWin.isDestroyed()) widgetWin.destroy();
    mainWin = null;
  });
}

app.whenReady().then(() => {
  createSplashWindow();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
