import { useEffect, useState } from 'react';
import { scheduleReminder } from '../lib/notifications';

/** 播放一段电子音效：方波 880Hz / 1109Hz 交替短鸣 */
function playElectronicBeep() {
  const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!AudioCtx) return;
  const ctx = new AudioCtx();
  const freqs = [880, 1109, 880, 1109];
  freqs.forEach((freq, i) => {
    const t = ctx.currentTime + i * 0.18;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    osc.stop(t + 0.12);
  });
}

function getParamsFromHash(): { title: string; id: string | null } {
  const hash = location.hash;
  const qIndex = hash.indexOf('?');
  const params = new URLSearchParams(qIndex >= 0 ? hash.slice(qIndex) : '');
  return {
    title: params.get('title')?.trim() || '任务时间到啦！',
    id: params.get('id')?.trim() || null,
  };
}

/**
 * 提醒弹窗，两种用法：
 * 1) 独立窗口（桌面 Electron）：不带 props，从 location.hash 读取 title/id，到点自动关闭窗口。
 * 2) 应用内弹窗（移动端双通道）：传入 title/id/inApp=true/onClose，作为覆盖层显示，不关闭 App。
 */
export function ReminderPopup(props?: {
  title?: string;
  id?: string | null;
  inApp?: boolean;
  onClose?: () => void;
}) {
  const fromHash = getParamsFromHash();
  const title = (props?.title ?? fromHash.title) || '任务时间到啦！';
  const id = props?.id ?? fromHash.id;
  const inApp = props?.inApp ?? false;
  const close = () => {
    if (inApp) props?.onClose?.();
    else window.close();
  };

  const [snoozed, setSnoozed] = useState(false);

  useEffect(() => {
    document.body.classList.add('reminder-mode');
    playElectronicBeep();
    if (inApp) return () => document.body.classList.remove('reminder-mode');
    const timer = setTimeout(() => window.close(), 12000);
    return () => {
      clearTimeout(timer);
      document.body.classList.remove('reminder-mode');
    };
  }, [inApp]);

  const doSnooze = async (minutes?: number, iso?: string) => {
    const when = iso ? new Date(iso) : new Date(Date.now() + (minutes ?? 10) * 60000);
    // 重新设定系统通知（移动端 LocalNotifications / 桌面 Electron 主进程），实现延期提醒
    await scheduleReminder(title, when, id ?? undefined);
    setSnoozed(true);
    setTimeout(close, 1200);
  };

  // 移动端应用内弹窗：居中遮罩卡片，仅保留「知道了」「10分钟后提醒」两个按钮
  if (inApp) {
    return (
      <div className="reminder-popup in-app">
        <div className="reminder-card">
          <div className="reminder-icon">⏰</div>
          <div className="reminder-body">
            <div className="reminder-title">牛马的提醒</div>
            <div className="reminder-task" title={title}>
              {snoozed ? '已设置 10 分钟后再次提醒' : title}
            </div>
          </div>
          <div className="reminder-in-app-actions">
            <button
              className="reminder-btn know"
              onClick={close}
              aria-label="知道了"
            >
              知道了
            </button>
            <button
              className="reminder-btn ten-min"
              onClick={() => doSnooze(10)}
              aria-label="10分钟后提醒"
            >
              10分钟后提醒
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 桌面端独立提醒窗口：保持原有紧凑布局（双按钮）
  return (
    <div className="reminder-popup">
      <div className="reminder-icon">⏰</div>
      <div className="reminder-body">
        <div className="reminder-title">牛马的提醒</div>
        <div className="reminder-task" title={title}>
          {snoozed ? '已设置 10 分钟后再次提醒' : title}
        </div>
        <div className="reminder-actions">
          <button
            className="reminder-btn ten-min"
            onClick={() => doSnooze(10)}
            aria-label="10分钟后提醒"
          >
            10分钟后提醒
          </button>
          <button
            className="reminder-btn know"
            onClick={close}
            aria-label="知道了"
          >
            知道了
          </button>
        </div>
      </div>
      <button className="reminder-close" onClick={close} aria-label="关闭">
        ✕
      </button>
    </div>
  );
}
