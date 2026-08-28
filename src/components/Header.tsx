import { OffWorkCountdown } from './OffWorkCountdown';
import { getProfile } from '../lib/profile';
import iconUrl from '/icon.png';

export function Header({
  onSettings,
  onWidget,
}: {
  onSettings?: () => void;
  onWidget?: () => void;
}) {
  const profile = getProfile();
  return (
    <header className="header">
      <div className="header-logo" aria-hidden>
        <img src={iconUrl} alt="logo" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="header-title">欢迎你，神圣的牛马人~</div>
        <div className="header-sub">
          <OffWorkCountdown />
        </div>
      </div>
      {onWidget && (
        <button className="header-gear" onClick={onWidget} aria-label="桌面小组件" title="添加到桌面小组件">
          🖥
        </button>
      )}
      {onSettings && (
        <button
          className="header-avatar"
          onClick={onSettings}
          aria-label="个人资料与设置"
          title="个人资料 / 设置"
        >
          {profile.avatar || '🐮'}
        </button>
      )}
    </header>
  );
}
