// The deadline, as a dashboard shows it.
//
// Both the Play tab and the Office read this rather than each deriving it,
// because two countdowns on two screens that disagreed about the same week
// would be worse than one. It is a handful of fields on purpose: a dashboard
// is not the Trade Center and should say one thing.

import type { Db } from './db.ts';
import type { SaveRow } from './save.ts';
import { seasonWeeks } from './save.ts';
import { deadlineNotice, deadlineUrgency, tradeWindow } from './tradeWindow.ts';

export interface TradeDeadlineOut {
  readonly open: boolean;
  readonly week: number;
  readonly weeksLeft: number;
  /** Null well out from the deadline: a countdown that runs all season is
   *  wallpaper, and stops being read long before it starts mattering. */
  readonly notice: string | null;
  readonly urgency: string;
  /** Offers waiting on an answer, which is the other thing worth interrupting
   *  a dashboard for. */
  readonly incomingOffers: number;
}

export async function tradeDeadlineFor(db: Db, save: SaveRow): Promise<TradeDeadlineOut> {
  const weeks = await seasonWeeks(db, save.id, save.season);
  const w = tradeWindow(save.phase, save.week, weeks, save.trade_deadline_week);
  const [offers] = await db<{ n: string }[]>`
    select count(*)::text as n from public.trades
     where save_id = ${save.id} and state = 'PROPOSED'
       and to_team_id = ${save.user_team_id}`;
  return {
    open: w.open, week: w.deadlineWeek, weeksLeft: w.weeksLeft,
    notice: deadlineNotice(w), urgency: deadlineUrgency(w),
    incomingOffers: Number(offers?.n ?? 0),
  };
}
