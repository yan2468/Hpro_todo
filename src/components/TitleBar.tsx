import { useEffect, useState } from 'react';
import { isElectron } from '../lib/platform';

const electronAPI = (window as any).electronAPI;

export function TitleBar() {
  // 移动端不需要窗口控制栏；Electron 桌面端才显示
  if (!isElectron) return null;

  const [isMax, setIsMax] = useState(false);

  useEffect(() => {
    document.body.classList.add('has-titlebar');
    let mounted = true;
    electronAPI?.window?.isMaximized?.().then((v: boolean) => {
      if (mounted) setIsMax(v);
    });
    const off = electronAPI?.window?.onMaximizedChange?.((v: boolean) => {
      setIsMax(v);
    });
    return () => {
      mounted = false;
      document.body.classList.remove('has-titlebar');
      off?.();
    };
  }, []);

  const minimize = () => electronAPI?.window?.minimize?.();
  const maximizeOrRestore = () => electronAPI?.window?.maximizeOrRestore?.();
  // 不直接退出：走主进程统一关闭拦截（弹「最小化到后台 / 直接关闭」确认框）
  const close = () => electronAPI?.window?.requestClose?.();

  return (
    <div className="titlebar" onDoubleClick={maximizeOrRestore}>
      <div className="titlebar-brand">
        <span className="titlebar-title">🐮🐴的打工日志</span>
        <span className="titlebar-wave" aria-hidden>
          <svg width="36" height="14" viewBox="0 0 36 14" fill="none">
            <path
              d="M0 8c4-3 8-6 12-2s8 5 12 1 8-4 12 1"
              stroke="rgba(255,255,255,0.35)"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </span>
      </div>
      <div className="titlebar-controls">
        <button
          className="tb-btn tb-minimize"
          onClick={minimize}
          aria-label="最小化"
          title="最小化"
        >
          <svg width="10" height="2" viewBox="0 0 10 2">
            <rect width="10" height="2" rx="1" fill="currentColor" />
          </svg>
        </button>
        <button
          className="tb-btn tb-maximize"
          onClick={maximizeOrRestore}
          aria-label={isMax ? '还原' : '最大化'}
          title={isMax ? '还原' : '最大化'}
        >
          {isMax ? (
            <svg width="10" height="10" viewBox="0 0 10 10">
              <path
                d="M2 4v4h4V4H2zm1-3v2h4v4h2V1H3z"
                fill="currentColor"
              />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10">
              <rect
                x="1"
                y="1"
                width="8"
                height="8"
                rx="1.5"
                stroke="currentColor"
                strokeWidth="1.5"
                fill="none"
              />
            </svg>
          )}
        </button>
        <button
          className="tb-btn tb-close"
          onClick={close}
          aria-label="关闭"
          title="关闭"
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path
              d="M1 1l8 8M9 1L1 9"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
