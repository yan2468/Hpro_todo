import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

const electronAPI = (window as any).electronAPI;

// 统一提醒入口：移动端用 Capacitor LocalNotifications，桌面端由 Electron 主进程弹出右下角窗口+电子音，浏览器用系统 Notification
export async function scheduleReminder(title: string, when: Date, id?: string): Promise<void> {
  const delay = when.getTime() - Date.now();
  if (delay <= 0) return;

  // Electron 桌面端：提醒完全交给主进程计时与弹窗（单一计时源，最可靠）。
  // 注意：桌面端不并行走浏览器 Notification 分支——WebView/Electron 下系统通知常常不可见，
  // 会导致「看似已调度实则无弹窗」的假象。主进程弹窗窗口才是用户可见的提醒。
  if (electronAPI?.scheduleReminder) {
    await electronAPI.scheduleReminder(title, when.toISOString(), id);
    return;
  }

  if (Capacitor.isNativePlatform()) {
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') await LocalNotifications.requestPermissions();
    await LocalNotifications.schedule({
      notifications: [
        {
          id: Math.floor(Math.random() * 1_000_000),
          title: '戴夫的任务提醒',
          body: title,
          schedule: { at: when },
        },
      ],
    });
    return;
  }

  if ('Notification' in window) {
    const fire = () => new Notification('戴夫的任务提醒', { body: title });
    if (Notification.permission === 'granted') {
      setTimeout(fire, delay);
    } else if (Notification.requestPermission) {
      Notification.requestPermission().then((p) => {
        if (p === 'granted') setTimeout(fire, delay);
      });
    }
    return;
  }

  // 兜底：无通知能力时仅控制台提示（仅开发环境，避免生产客户端刷日志）
  if (import.meta.env?.DEV) {
    console.log('[reminder]', title, when.toLocaleString());
  }
}

/** 取消已设定的提醒（编辑时若清空提醒时间则调用） */
export async function cancelReminder(id: string): Promise<void> {
  if (electronAPI?.cancelReminder) {
    await electronAPI.cancelReminder(id);
  }
}
