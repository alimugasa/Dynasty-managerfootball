import type { Db } from '../db.ts';
import type { SaveRow } from '../save.ts';
import { seasonWeeks } from '../save.ts';

export function intelligenceThresholds(weeks: number) {
  if (!Number.isInteger(weeks) || weeks < 1) throw new Error('Missing regular-season schedule length.');
  return { awards: Math.max(2, Math.ceil(weeks / 3)), picture: Math.max(2, Math.ceil(weeks / 2)) };
}
export async function intelligenceCalendar(db: Db, save: SaveRow) {
  const weeks = await seasonWeeks(db, save.id, save.season);
  const thresholds = intelligenceThresholds(weeks);
  const regular = save.phase === 'REGULAR_SEASON';
  const [played] = await db<{ through: number | null }[]>`
    select max(week)::int as through from public.game_results
     where save_id = ${save.id} and season = ${save.season} and competition = 'REGULAR'
       and week < ${regular ? save.week : weeks + 1}`;
  if (played === undefined) throw new Error('Missing regular-season calendar query.');
  const throughWeek = played.through === null ? 0 : played.through;
  return { season: save.season, phase: save.phase, throughWeek, weeks,
    awardFromWeek: thresholds.awards, pictureFromWeek: thresholds.picture,
    awardsActive: regular && throughWeek >= thresholds.awards,
    pictureActive: regular && throughWeek >= thresholds.picture,
    lateSeason: regular && throughWeek >= Math.ceil(weeks * 0.75) };
}
export type IntelligenceCalendar = Awaited<ReturnType<typeof intelligenceCalendar>>;
