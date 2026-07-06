import { useState } from 'react';
import { useBracketStore } from '../../state/bracketStore';
import { shareUrl } from '../../state/urlSync';
import './Header.css';

interface Props {
  lastUpdated: string;
  cacheAge: number;
}

function formatAge(ms: number): string {
  const mins = Math.round(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  return `${hrs}h ago`;
}

export function Header({ lastUpdated, cacheAge }: Props) {
  const lockCount = useBracketStore((s) => Object.keys(s.locks).length);
  const resetLocks = useBracketStore((s) => s.resetLocks);
  const [shared, setShared] = useState(false);

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl());
      setShared(true);
      setTimeout(() => setShared(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <header className="site-header">
      <div className="site-header__inner container">
        <h1 className="site-header__logo">
          <span aria-hidden>⚽</span>
          <span>World Cup 2026</span>
        </h1>
        <div className="site-header__controls">
          <div className="live-badge" title={new Date(lastUpdated).toLocaleString()}>
            <span className="live-badge__dot" />
            <span className="live-badge__label">Live</span>
            <span className="live-badge__age">· {formatAge(cacheAge)}</span>
          </div>
          {lockCount > 0 && (
            <button className="ghost-btn" onClick={resetLocks}>
              Reset ({lockCount})
            </button>
          )}
          <button className="primary-btn" onClick={handleShare}>
            {shared ? 'Copied!' : 'Share bracket'}
          </button>
        </div>
      </div>
    </header>
  );
}
