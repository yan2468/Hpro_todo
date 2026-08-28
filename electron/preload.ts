import { contextBridge, ipcRenderer, Notification } from 'electron';

// 暴露最小 API 给渲染进程，用于桌面端系统通知与小组件
contextBridge.exposeInMainWorld('ddNotify', {
  show: (title: string, body: string) => {
    new Notification({ title, body }).show();
  },
});

contextBridge.exposeInMainWorld('electronAPI', {
  // 桌面小组件
  openWidget: () => ipcRenderer.invoke('widget:open'),
  closeWidget: () => ipcRenderer.invoke('widget:close'),
  // 凭证同步（供小组件独立拉取任务）
  setAuth: (auth: { token: string | null; base: string | null }) =>
    ipcRenderer.invoke('auth:set', auth),
  getAuth: () => ipcRenderer.invoke('auth:get'),
  // 报告导出（桌面端保存文件对话框）
  exportReport: (content: string, filename: string) =>
    ipcRenderer.invoke('report:export', { content, filename }),
  // 桌面端提醒：由主进程在右下角弹出提示窗并播放电子音
  scheduleReminder: (title: string, time: string, id?: string) =>
    ipcRenderer.invoke('reminder:schedule', { title, time, id }),
  cancelReminder: (id: string) => ipcRenderer.invoke('reminder:cancel', id),
  // 小组件内点击完成任务
  updateTask: (id: string, patch: Record<string, unknown>) =>
    ipcRenderer.invoke('task:update', { id, patch }),
  // 跨窗口任务变更广播：任意一端改动任务后，通知主进程转发给所有窗口刷新
  notifyTaskChanged: () => ipcRenderer.send('tasks:changed-request'),
  // 大模型对话（DeepSeek / OpenAI 兼容）：由主进程发起 HTTP 请求，规避 CORS
  aiChat: (payload: {
    url: string;
    apiKey: string;
    model: string;
    temperature: number;
    messages: { role: string; content: string }[];
  }) => ipcRenderer.invoke('ai:chat', payload),
  // AI 自动生成配置：渲染端保存后同步推给主进程，让后台也能按新配置重新调度
  setAIConfig: (c: any) => ipcRenderer.invoke('ai:set-config', c),
  getAIConfig: () => ipcRenderer.invoke('ai:get-config'),
  // 通知主进程立刻尝试生成一次（手动触发）
  aiRunNow: () => ipcRenderer.invoke('ai:run-now'),
  // 订阅任务变更事件（主进程广播），返回取消订阅函数
  onTasksChanged: (cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.on('tasks:changed', listener);
    return () => ipcRenderer.removeListener('tasks:changed', listener);
  },
  // 自定义标题栏窗口控制
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximizeOrRestore: () => ipcRenderer.invoke('window:maximize-or-restore'),
    // 请求关闭：走主进程的统一关闭拦截（弹确认框），而非直接退出
    requestClose: () => ipcRenderer.send('window:requestClose'),
    // 最小化到后台：仅隐藏主窗口，桌面小组件保持运行
    hide: () => ipcRenderer.invoke('window:hide'),
    // 直接关闭：放行真正退出（销毁小组件并 quit）
    forceClose: () => ipcRenderer.invoke('window:forceClose'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
    onMaximizedChange: (cb: (isMaximized: boolean) => void) => {
      const listener = (_e: any, v: boolean) => cb(v);
      ipcRenderer.on('window:maximized-change', listener);
      return () => ipcRenderer.removeListener('window:maximized-change', listener);
    },
    // 主进程在任意关闭尝试时回调，渲染端据此弹出确认框
    onRequestClose: (cb: () => void) => {
      const listener = () => cb();
      ipcRenderer.on('app:request-close', listener);
      return () => ipcRenderer.removeListener('app:request-close', listener);
    },
  },
  // 关闭行为偏好（记住我的选择）
  getClosePref: () => ipcRenderer.invoke('app:getClosePref'),
  setClosePref: (p: { remember: boolean; action: 'minimize' | 'quit' | null }) =>
    ipcRenderer.invoke('app:setClosePref', p),
});
