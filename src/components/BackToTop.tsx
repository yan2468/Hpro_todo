import { useEffect, useState } from 'react';

/**
 * 通用返回顶部按钮。
 * 滚动超过 threshold 时淡入显示，点击平滑回到顶部。
 * 移动端底部自动避让 tab 栏（见 index.css 媒体查询）。
 */
export function BackToTop({
  threshold = 400,
  bottomMobile = 80,
  bottomDesktop = 24,
  zIndex = 35,
}: {
  threshold?: number;
  bottomMobile?: number;
  bottomDesktop?: number;
  zIndex?: number;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > threshold);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [threshold]);

  // 仅使用阈值与层级，移动/桌面底部距离由 CSS 媒体查询控制（占位参数保留 API 兼容）
  void bottomMobile;
  void bottomDesktop;

  return (
    <button
      className={`back-to-top${visible ? ' show' : ''}`}
      style={{ zIndex }}
      aria-label="返回顶部"
      title="返回顶部"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
    >
      ↑
    </button>
  );
}
