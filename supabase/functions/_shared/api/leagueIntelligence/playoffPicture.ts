import type { Db } from '../db.ts';
import type { SaveRow } from '../save.ts';
import { postseasonStream, rngSeed32 } from '../save.ts';
import { clubRecords, regularResults } from '../postseason.ts';
import { createRng } from '../../engine/rng.ts';
import { rankClubs, seedLeague, TIEBREAKERS, QUALIFIERS_PER_CONFERENCE } from '../../engine/playoffs.ts';
export interface PictureTeam {
  readonly teamId: string; readonly name: string; readonly division: string; readonly divisionRank: number;
  readonly conferenceRank: number; readonly seed: number | null; readonly wins: number; readonly losses: number;
  readonly ties: number; readonly remaining: number; readonly gamesBack: number | null;
  readonly status: 'DIVISION LEADER' | 'POSTSEASON POSITION' | 'CHASING';
}
export interface PictureConference { readonly id: string; readonly name: string; readonly teams: readonly PictureTeam[] }
export async function readPlayoffPicture(db: Db, save: SaveRow) {
  const [clubs, results, identities, remaining] = await Promise.all([
    clubRecords(db, save.id, save.season), regularResults(db, save.id, save.season),
    db<{ team_id: string; name: string; conference_id: string; conference_name: string; division: string }[]>`
      select t.team_id, t.metro_area || ' ' || t.nickname as name, t.conference_id,
             c.name as conference_name, d.name as division
        from public.teams t join public.league_conferences c on c.save_id = t.save_id and c.conference_id = t.conference_id
        join public.league_divisions d on d.save_id = t.save_id and d.division_id = t.division_id where t.save_id = ${save.id}`,
    db<{ team_id: string; n: number }[]>`
      select t.team_id, count(sc.game_id)::int as n from public.teams t
       left join public.season_schedule sc on sc.save_id = t.save_id and sc.season = ${save.season}
        and sc.competition = 'REGULAR' and sc.status = 'SCHEDULED'
        and (sc.home_team_id = t.team_id or sc.away_team_id = t.team_id)
       where t.save_id = ${save.id} group by t.team_id`,
  ]);
  const rng = createRng(postseasonStream(rngSeed32(save.rng_seed), save.season));
  // Exactly the same inputs, canonical input order and RNG stream as seedPostseason.
  const seeds = seedLeague(clubs, results, rng);
  const seedOf = new Map(seeds.map((s) => [s.teamId, s]));
  const identitiesById = new Map(identities.map((t) => [t.team_id, t]));
  const left = new Map(remaining.map((r) => [r.team_id, r.n]));
  const conferences: PictureConference[] = [];
  for (const conference of [...new Set(clubs.map((c) => c.conferenceId))].sort()) {
    const members = clubs.filter((c) => c.conferenceId === conference);
    const ranked = rankClubs(members, results, rng);
    const divisionRank = new Map<string, number>();
    for (const division of new Set(members.map((c) => c.divisionId))) {
      const group = rankClubs(members.filter((c) => c.divisionId === division), results, rng);
      const leader = group.find((c) => seedOf.get(c.teamId)?.divisionWinner === true);
      if (leader === undefined) throw new Error('Missing projected division leader.');
      [leader, ...group.filter((c) => c.teamId !== leader.teamId)].forEach((c, i) => divisionRank.set(c.teamId, i + 1));
    }
    const cutoff = members.find((c) => seedOf.get(c.teamId)?.seed === QUALIFIERS_PER_CONFERENCE);
    if (cutoff === undefined) throw new Error('Missing postseason cutoff.');
    const teams = ranked.map((c, index): PictureTeam => {
      const identity = identitiesById.get(c.teamId); const gamesLeft = left.get(c.teamId); const divisionPlace = divisionRank.get(c.teamId);
      if (identity === undefined || gamesLeft === undefined || divisionPlace === undefined) throw new Error('Missing playoff-picture team data.');
      const seed = seedOf.get(c.teamId);
      return { teamId: c.teamId, name: identity.name, division: identity.division, divisionRank: divisionPlace,
        conferenceRank: index + 1, seed: seed === undefined ? null : seed.seed,
        wins: c.wins, losses: c.losses, ties: c.ties, remaining: gamesLeft,
        gamesBack: seed === undefined ? ((cutoff.wins - c.wins) + (c.losses - cutoff.losses)) / 2 : null,
        status: seed === undefined ? 'CHASING' : seed.divisionWinner ? 'DIVISION LEADER' : 'POSTSEASON POSITION' };
    }).sort((a, b) => (a.seed === null ? QUALIFIERS_PER_CONFERENCE + a.conferenceRank : a.seed)
      - (b.seed === null ? QUALIFIERS_PER_CONFERENCE + b.conferenceRank : b.seed));
    const name = identities.find((t) => t.conference_id === conference)?.conference_name;
    if (name === undefined) throw new Error('Missing conference label.');
    conferences.push({ id: conference, name, teams });
  }
  return { conferences, qualifiers: QUALIFIERS_PER_CONFERENCE,
    tiebreakers: ['Win percentage', ...TIEBREAKERS.map((t) => t.name), 'Seeded coin draw'] };
}
export type PlayoffPicture = Awaited<ReturnType<typeof readPlayoffPicture>>;
