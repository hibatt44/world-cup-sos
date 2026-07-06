import { useEffect } from 'react';
import { useBracketStore } from './bracketStore';

const KEY = 'b';

export function encodeLocks(locks: Record<number, string>): string {
  const entries = Object.entries(locks);
  if (entries.length === 0) return '';
  return entries
    .map(([m, code]) => `${m}:${code}`)
    .join(',');
}

export function decodeLocks(raw: string): Record<number, string> {
  const out: Record<number, string> = {};
  if (!raw) return out;
  for (const part of raw.split(',')) {
    const [m, code] = part.split(':');
    const n = Number(m);
    if (Number.isFinite(n) && code) out[n] = code;
  }
  return out;
}

function readHash(): Record<number, string> {
  const hash = window.location.hash.slice(1);
  const params = new URLSearchParams(hash);
  return decodeLocks(params.get(KEY) ?? '');
}

function writeHash(locks: Record<number, string>) {
  const encoded = encodeLocks(locks);
  const hash = encoded ? `#${KEY}=${encoded}` : '';
  const next = `${window.location.pathname}${window.location.search}${hash}`;
  window.history.replaceState(null, '', next);
}

export function useUrlSync() {
  const locks = useBracketStore((s) => s.locks);
  const hydrate = useBracketStore((s) => s.hydrate);

  // Hydrate once on mount
  useEffect(() => {
    const initial = readHash();
    if (Object.keys(initial).length > 0) hydrate(initial);
    const onPop = () => hydrate(readHash());
    window.addEventListener('hashchange', onPop);
    return () => window.removeEventListener('hashchange', onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced write on locks change
  useEffect(() => {
    const t = setTimeout(() => writeHash(locks), 150);
    return () => clearTimeout(t);
  }, [locks]);
}

export function shareUrl(): string {
  return window.location.href;
}
