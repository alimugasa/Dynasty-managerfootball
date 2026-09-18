// Presentation ordering only. Grades, outlook and battle selection arrive from the server.
import type { CampPlayerOut } from '../../supabase/functions/_shared/api/reads/camp';

export function campRows(
  players: readonly CampPlayerOut[], group: string, filter: string,
  sort: string, direction: 'asc' | 'desc',
): readonly CampPlayerOut[] {
  const rows = players.filter((p) => (group === '' || p.group === group)
    && (filter === 'ALL'
      || (filter === 'DECISIONS' && ['BUBBLE', 'LONG_SHOT', 'CUT_CANDIDATE', 'ROOKIE_WATCH'].includes(p.status ?? ''))
      || (filter === 'INJURED' && p.injured)
      || (filter === 'RISER' && p.trend === 'RISER')
      || (filter === 'FALLER' && p.trend === 'FALLER')));
  const value = (p: CampPlayerOut): number | null => {
    switch (sort) {
      case 'AGE': return p.age;
      case 'ABILITY': return p.overall;
      case 'CAP': return p.capHit;
      case 'DEAD': return p.deadMoney;
      case 'PRESEASON': return p.preseasonGrade;
      default: return p.practiceGrade;
    }
  };
  return rows.sort((a, b) => {
    const av = value(a); const bv = value(b);
    // Unknown always goes last, in either direction; a genuine zero still sorts.
    if (av === null && bv !== null) return 1;
    if (bv === null && av !== null) return -1;
    const comparison = av === null || bv === null ? 0 : av - bv;
    return (direction === 'asc' ? comparison : -comparison)
      || a.name.localeCompare(b.name) || a.playerId.localeCompare(b.playerId);
  });
}
