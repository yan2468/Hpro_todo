import { Capacitor } from '@capacitor/core';

const electronAPI = (window as any).electronAPI;

/** 是否在 Electron 桌面端运行 */
export const isElectron = !!electronAPI;

/** 是否在原生移动端（Android/iOS）运行 */
export const isNativeMobile = Capacitor.isNativePlatform();

/** 视口宽度判定：<=768px 视为手机布局 */
const mobileQuery =
  typeof window !== 'undefined' ? window.matchMedia?.('(max-width: 768px)') : undefined;

/** 是否在移动端样式下运行（原生移动端 + 小屏幕浏览器，统称"手机视图"） */
export function isMobileView(): boolean {
  if (isNativeMobile) return true;
  return mobileQuery?.matches ?? false;
}

/** 主输入设备是否为粗指针（触摸屏，无鼠标悬停） */
const coarseQuery =
  typeof window !== 'undefined' ? window.matchMedia?.('(pointer: coarse)') : undefined;

/**
 * 是否处于触摸交互模式（原生移动端 + 触摸屏设备）。
 * 用于决定拖拽交互路径：触摸模式 = 长按拖拽；否则 = HTML5 拖拽。
 * 注意：桌面 Electron 窗口即使宽度 <768px（手机样式布局），主指针仍是鼠标，
 * 必须走 HTML5 拖拽，否则卡片 draggable=false 导致桌面端完全无法拖拽重排。
 */
export function isTouchMode(): boolean {
  if (isNativeMobile) return true;
  return coarseQuery?.matches ?? false;
}

/** 默认后端地址：ECS 公网 IP + 端口 */
export const DEFAULT_API_BASE = 'http://8.163.32.86:8787';

/**
 * 给 body 标记 .is-mobile 类，让 CSS 媒体查询之外的 JS 也能识别。
 * 监听 resize / 屏幕方向变化，切换标记。
 */
function syncBodyMobileClass(): void {
  if (typeof document === 'undefined') return;
  const apply = () => {
    document.body.classList.toggle('is-mobile', isMobileView());
  };
  apply();
  mobileQuery?.addEventListener?.('change', apply);
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', apply);
}
syncBodyMobileClass();