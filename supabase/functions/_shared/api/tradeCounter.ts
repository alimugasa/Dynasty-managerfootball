// The deal they would do instead.
//
// tradeInterest.ts decides *that* a club counters and what it wants; this
// finds the actual asset and writes the package. The split matters because
// only this half can be wrong in a way a manager would call unfair: a counter
// that asks for a first-round pick to close a gap of three is not a
// negotiation, it is a club taking advantage of a screen that cannot say no.
//
// So the asset chosen is the smallest one on the manager's side of the table
// that closes the gap, and nothing is asked for that the manager does not
// have. A counter nobody can accept is worse than a refusal, because it looks
// like progress.

import type { Db } from './db.ts';
import type { SaveRow } from './save.ts';
import { valueAssets, type AssetRef } from './tradeAssets.ts';
import type { Counter } from './tradeInterest.ts';
import type { ValuedAsset } from './tradeStrategy.ts';
import type { PackageIn } from './tradeDeal.ts';

export interface CounterPackage {
  /** What the countering club sends, which is what the manager was already
   *  being offered -- a counter changes the price, not the prize. */
  readonly give: readonly AssetRef[];
  readonly get: readonly AssetRef[];
  readonly giving: readonly ValuedAsset[];
  readonly getting: readonly ValuedAsset[];
  readonly summary: string;
}

/** How much more than the gap an added asset may be worth before the ask is
 *  no longer reasonable. A club may round up; it may not double. */
const OVERSHOOT = 1.9;

/**
 * Builds the package they would rather have.
 *
 * Their side is unchanged: they still send what the manager asked for. What
 * changes is the manager's side, which gains one asset -- the cheapest thing
 * they own that covers the gap, of the kind the club actually wants.
 *
 * Null when nothing on the manager's roster closes it without overpaying. That
 * is an honest outcome and the caller turns it into a plain refusal: there is
 * no deal here, and pretending otherwise wastes the manager's afternoon.
 */
export async function buildCounterPackage(
  db: Db, save: SaveRow, withTeamId: string, original: PackageIn, counter: Counter,
): Promise<CounterPackage | null> {
  const already = new Set(original.give.map((a) => `${a.kind}:${a.id}`));
  const candidates = await availableAssets(db, save, counter, already);
  if (candidates.length === 0) return null;

  // Priced in *their* terms, because the gap is in their terms: what closes it
  // is what they think it is worth, not what the manager does.
  const priced = await valueAssets(
    db, save.id, save.season,
    candidates.map((c) => ({ kind: c.kind, id: c.id })), withTeamId);

  // The cheapest asset that covers the gap without overshooting it. Sorted
  // ascending so the first match is the smallest -- a club that asked for the
  // best thing that happened to clear the bar would be negotiating in bad
  // faith on every deal.
  const enough = [...priced]
    .sort((a, b) => a.value - b.value)
    .find((a) => a.value >= counter.gap && a.value <= counter.gap * OVERSHOOT);
  if (enough === undefined) return null;

  const give = [...original.give, { kind: enough.kind, id: enough.id }];
  const giving = await valueAssets(
    db, save.id, save.season, give, save.user_team_id);
  const getting = await valueAssets(
    db, save.id, save.season, original.get, save.user_team_id);

  return {
    give, get: original.get, giving, getting,
    summary: `add ${enough.label}`,
  };
}

/** What the managed club has that the other one would take. */
async function availableAssets(
  db: Db, save: SaveRow, counter: Counter, already: ReadonlySet<string>,
): Promise<readonly { kind: 'PLAYER' | 'PICK'; id: string }[]> {
  const out: { kind: 'PLAYER' | 'PICK'; id: string }[] = [];

  if (counter.wants === 'PICK') {
    const rows = await db<{ pick_id: string }[]>`
      select pick_id from public.draft_picks
       where save_id = ${save.id} and current_owner_team_id = ${save.user_team_id}
         and selected_player_id is null
       order by draft_year, round`;
    for (const row of rows) {
      if (!already.has(`PICK:${row.pick_id}`)) out.push({ kind: 'PICK', id: row.pick_id });
    }
    return out;
  }

  // A player, and for a retooling club specifically a young one. Starters are
  // excluded: a counter that asks the manager to gut his own first team is a
  // counter nobody takes, and offering it teaches them to stop reading these.
  const young = counter.wants === 'YOUNG_PLAYER';
  const rows = await db<{ player_id: string }[]>`
    select r.player_id
      from public.team_rosters r
      join public.players p on p.save_id = r.save_id and p.player_id = r.player_id
      left join public.team_depth_charts d
        on d.save_id = r.save_id and d.player_id = r.player_id
     where r.save_id = ${save.id} and r.team_id = ${save.user_team_id}
       and coalesce(d.depth_order, 99) > 1
       and (${young} = false or p.age <= 26)
     order by p.overall_rating`;
  for (const row of rows) {
    if (!already.has(`PLAYER:${row.player_id}`)) out.push({ kind: 'PLAYER', id: row.player_id });
  }
  return out;
}
