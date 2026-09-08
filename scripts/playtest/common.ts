// Shared pieces of the play-test screens.

import type { Chip } from '../../src/components/ChipRow';
import type { Game } from './host';

export const GROUPS: readonly Chip[] = [
  { key: 'QB', label: 'QB' }, { key: 'RB', label: 'RB' }, { key: 'WR', label: 'WR' },
  { key: 'TE', label: 'TE' }, { key: 'OL', label: 'OL' }, { key: 'EDGE', label: 'Edge' },
  { key: 'DT', label: 'DT' }, { key: 'LB', label: 'LB' }, { key: 'CB', label: 'CB' },
  { key: 'S', label: 'S' }, { key: 'K', label: 'K' }, { key: 'P', label: 'P' },
];

export const money = (n: number): string => `${(n / 1e6).toFixed(1)}M`;

export const record = (s: { wins: number; losses: number; ties: number } | undefined): string =>
  s === undefined ? '—' : `${String(s.wins)}-${String(s.losses)}${s.ties > 0 ? `-${String(s.ties)}` : ''}`;

export const ordinal = (n: number): string => {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${String(n)}th`;
  return `${String(n)}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
};

export interface ScreenProps {
  readonly game: Game;
  readonly open: (screen: string, id: string) => void;
}
