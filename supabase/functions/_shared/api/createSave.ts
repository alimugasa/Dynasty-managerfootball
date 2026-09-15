// Creates a dynasty: create_save() clones the template, and then the engine's
// state is built from the clone and projected back over it.
//
// The seed is generated here, on the server, and never accepted from the
// client. It decides every draft, every injury and every result for the life
// of the save; a client that could choose it could choose its outcomes, which
// is rule 2's whole concern. It is also never returned: the client has no use
// for it and no right to it.
//
// One transaction. A save either exists with its document, its rosters, its
// contracts, its cap sheet, its opening table and its depth chart, or it does
// not exist at all.

import { ApiError, badRequest, type Handler } from './context.ts';
import { optionalInt, optionalString, rawOf } from './parse.ts';
import { isGmStyle } from './gmStyles.ts';
import { parseSettings, type FranchiseSettings } from './franchiseOptions.ts';
import { MAX_SAVE_NAME } from './renameSave.ts';
import { BuildStepError, runStep, step, type BuildStep } from './buildSteps.ts';
import { freshSeed62 } from '../seed.ts';
import { loadWorld } from './world.ts';
import { PostgresSaveStore } from './saveStore.ts';
import { ownedSave, rngSeed32, touchSave } from './save.ts';
import { refreshWaiverPriority } from './waivers.ts';
import { defaultDepthChart, projectWorld, seedStandings, writeDepthChart } from './project/index.ts';
import { createRng } from '../engine/rng.ts';
import { primePipeline } from '../engine/offseason/population.ts';
import { serialize } from '../save/index.ts';
import { insertNews } from './news.ts';
import { openingStories } from './franchiseNews.ts';
import { openingFacts } from './franchiseNewsFacts.ts';
import type { Db } from './db.ts';

export interface CreateSaveIn {
  readonly name: string;
  readonly teamId: string;
  /** The save file the player picked. Omitted by callers with no menu behind
   *  them (the tests, the seed scripts), which take the lowest free slot. */
  readonly slot?: number;
  /** Both names or neither. A save with neither reports that it has no GM
   *  rather than being given a placeholder one. */
  readonly gmFirstName?: string;
  readonly gmLastName?: string;
  /** How the player said this manager sees the job. Optional: a save whose
   *  creator skipped the question stores null and reports it as unanswered. */
  readonly gmStyle?: string;
  /** The eight rules the franchise is played under. All eight or none: a save
   *  recorded with five of them is one nobody can say was played on Hard. */
  readonly settings?: FranchiseSettings;
}

export interface CreateSaveOut {
  readonly saveId: string;
  readonly season: number;
  readonly userTeamId: string;
  readonly slot: number;
  /** What each step of the build produced, counted from the rows it wrote.
   *  Reported after the transaction commits, because rows inside an open one
   *  are invisible to everything else -- see buildSteps.ts. */
  readonly steps: readonly BuildStep[];
}

export const ENGINE_VERSION = '0.1.0';

/** The first slot this player has nothing in. Used only when the caller names
 *  no slot; the menu always names one. */
async function lowestFreeSlot(db: Db, userId: string): Promise<number> {
  const rows = await db<{ slot: number }[]>`
    select slot from public.saves
     where user_id = ${userId} and not is_template order by slot`;
  const used = new Set(rows.map((r) => r.slot));
  let slot = 1;
  while (used.has(slot)) slot += 1;
  return slot;
}

export const createSave: Handler<CreateSaveIn, CreateSaveOut> = {
  auth: 'required',
  parse: (raw) => {
    const r = rawOf(raw);
    const name = typeof r['name'] === 'string' ? r['name'].trim() : '';
    const teamId = typeof r['teamId'] === 'string' ? r['teamId'].trim() : '';
    if (name === '') throw badRequest('name is required');
    // The same ceiling rename-save enforces: one place decides how long a save
    // file's name may be, and both the screen that sets it and the screen that
    // changes it later agree.
    if (name.length > MAX_SAVE_NAME) {
      throw badRequest(`A save file name is at most ${String(MAX_SAVE_NAME)} characters.`);
    }
    if (teamId === '') throw badRequest('teamId is required');
    const slot = optionalInt(r, 'slot');
    if (slot !== undefined && slot < 1) throw badRequest('slot must be 1 or greater');
    const gmFirstName = optionalString(r, 'gmFirstName');
    const gmLastName = optionalString(r, 'gmLastName');
    // Half a name is worse than none: it would put "Vance" on a slot screen
    // with nothing in front of it and no way to tell whether the first name was
    // lost or never given.
    if ((gmFirstName === undefined) !== (gmLastName === undefined)) {
      throw badRequest('a general manager needs both a first and a last name');
    }
    // Refused rather than dropped. A style the server does not know means the
    // two catalogues have drifted, and silently storing null would hide that
    // behind a save that looks fine until someone notices the answer is gone.
    const gmStyle = optionalString(r, 'gmStyle');
    if (gmStyle !== undefined && !isGmStyle(gmStyle)) {
      throw badRequest(`unknown general manager style "${gmStyle}"`);
    }
    // Refused rather than dropped, for the same reason: a settings document the
    // server cannot read means the catalogues have drifted, and storing null
    // would hide that behind a save that looks fine.
    let settings: FranchiseSettings | undefined;
    try {
      settings = parseSettings(r['settings']);
    } catch (error) {
      throw badRequest(error instanceof Error ? error.message : String(error));
    }
    return {
      name, teamId,
      ...(slot === undefined ? {} : { slot }),
      ...(gmFirstName === undefined ? {} : { gmFirstName }),
      ...(gmLastName === undefined ? {} : { gmLastName }),
      ...(gmStyle === undefined ? {} : { gmStyle }),
      ...(settings === undefined ? {} : { settings }),
    };
  },
  run: async ({ sql, userId }, input) => {
    if (userId === null) throw new ApiError(401, 'unauthorized', 'no user');
    const seed = freshSeed62();

    return sql.begin(async (tx) => {
      // The slot is settled before the world is cloned: 25,000 rows copied and
      // then rolled back is a slow way to say "that file is in use". The unique
      // index is still what guarantees it -- two tabs claiming one slot at the
      // same moment is a race this query cannot see, and the index can.
      const slot = input.slot ?? await lowestFreeSlot(tx, userId);
      const [taken] = await tx<{ id: string }[]>`
        select id from public.saves
         where user_id = ${userId} and not is_template and slot = ${slot}`;
      if (taken !== undefined) throw badRequest(`save file ${String(slot)} is already in use`);

      let saveId: string;
      try {
        const [row] = await tx<{ id: string }[]>`
          select public.create_save(${userId}::uuid, ${input.name}, ${input.teamId},
                                    ${seed.toString()}::bigint, ${ENGINE_VERSION}) as id`;
        if (row === undefined) throw new Error('create_save returned no id');
        saveId = row.id;
      } catch (error) {
        // The function raises on an unknown club or a missing template; both are
        // the caller's problem, not a 500.
        const message = error instanceof Error ? error.message : String(error);
        if (/team|template/i.test(message)) throw badRequest(message);
        throw new BuildStepError('league', error);
      }

      await tx`
        update public.saves
           set slot = ${slot},
               gm_first_name = ${input.gmFirstName ?? null},
               gm_last_name = ${input.gmLastName ?? null},
               gm_style = ${input.gmStyle ?? null},
               franchise_settings = ${
                 input.settings === undefined ? null : tx.json(input.settings)}
         where id = ${saveId}`;

      const save = await ownedSave(tx, userId, saveId);
      const seed32 = rngSeed32(save.rng_seed);

      // The world from the save's own rows, then the draft classes the first
      // offseasons will draw on: a league with an empty pipeline drafts nobody
      // for three years, which the reports guard against the same way.
      const league = await runStep('players', async () => {
        const world = await loadWorld(tx, saveId, save.season);
        primePipeline(world, createRng(seed32));
        return world;
      });

      await runStep('rosters', () => projectWorld(tx, saveId, league));
      // The seed's injury list describes the clubs as the season opens: a
      // player it lists as out for n weeks misses the first n-1. Dating those
      // rows to week 0 of this season is what lets the week runner read them.
      // Nine clubs' only kicker or punter is on the long-term list; they play
      // anyway, with the other specialist doing both jobs (roster.ts), until
      // in-season signing lets a club do better.
      await tx`
        update public.player_injuries set injured_season = ${save.season}, injured_week = 0
         where save_id = ${saveId} and injured_season is null`;
      await runStep('depth', () => writeDepthChart(
        tx, saveId, input.teamId, defaultDepthChart(league, input.teamId)));
      // Opening the front office: the league table the season starts from, the
      // engine's own document, and the save marked as sitting at week 1.
      await runStep('office', async () => {
        await seedStandings(tx, saveId, save.season, league.teamIds);
        const now = new Date().toISOString();
        await new PostgresSaveStore(tx).write(saveId, serialize(league, {
          meta: {
            saveId, name: input.name, userTeamId: input.teamId,
            season: save.season, week: 1, phase: 'REGULAR_SEASON',
            seed: seed32, engineVersion: ENGINE_VERSION, createdAt: now, updatedAt: now,
          },
        }));
        // The waiver queue a season opens with. There is no table yet, so
        // this is last season's finish in reverse -- and in a league's first
        // season there is no finish either, and the order falls back to
        // something stable and visibly arbitrary rather than to a guess.
        await refreshWaiverPriority(tx, saveId, save.season);
        await touchSave(tx, saveId, { week: 1, phase: 'REGULAR_SEASON' });
      });

      // The feed a brand new franchise opens on. Four stories, all of them
      // read back out of the rows this transaction has just written -- the
      // club's identity, its owner, its roster, its week 1 fixture -- so a
      // save that failed to get a schedule gets a story saying so rather than
      // a preview of a game that does not exist. Inside the transaction with
      // everything else: a dynasty either has its opening feed or does not
      // exist. The tally below counts what this wrote.
      await runStep('news', async () => {
        const gmName = input.gmFirstName === undefined || input.gmLastName === undefined
          ? null : `${input.gmFirstName} ${input.gmLastName}`;
        const facts = await openingFacts(tx, saveId, save.season, input.teamId, gmName);
        if (facts !== null) await insertNews(tx, saveId, openingStories(facts));
      });

      // Counted, not asserted. Every figure the screen shows for a step is the
      // number of rows that step actually left behind, read back inside the
      // same transaction that wrote them.
      const [tally] = await tx<{
        teams: string; players: string; rosters: string; contracts: string;
        depth: string; schedule: string; picks: string; news: string;
        conferences: string; divisions: string;
      }[]>`
        select
          (select count(*) from public.teams where save_id = ${saveId})::text as teams,
          (select count(*) from public.players where save_id = ${saveId})::text as players,
          (select count(*) from public.team_rosters where save_id = ${saveId})::text as rosters,
          (select count(*) from public.player_contracts
            where save_id = ${saveId})::text as contracts,
          (select count(*) from public.team_depth_charts
            where save_id = ${saveId})::text as depth,
          (select count(*) from public.season_schedule
            where save_id = ${saveId} and season = ${save.season})::text as schedule,
          (select count(*) from public.draft_picks where save_id = ${saveId})::text as picks,
          (select count(*) from public.news where save_id = ${saveId})::text as news,
          (select count(*) from public.league_conferences
            where save_id = ${saveId})::text as conferences,
          (select count(*) from public.league_divisions
            where save_id = ${saveId})::text as divisions`;
      const n = (v: string | undefined): number => Number(v ?? 0);

      const steps: BuildStep[] = [
        step('league', n(tally?.conferences) + n(tally?.divisions), 'conferences and divisions'),
        step('teams', n(tally?.teams), 'teams'),
        step('players', n(tally?.players), 'players'),
        step('rosters', n(tally?.rosters), 'roster places'),
        step('contracts', n(tally?.contracts), 'contracts'),
        step('depth', n(tally?.depth), 'depth chart places'),
        step('schedule', n(tally?.schedule), 'fixtures'),
        step('picks', n(tally?.picks), 'picks'),
        // Four opening stories, counted like everything else. A save whose
        // club had no identity row writes none, and this reports the zero
        // rather than the four it was supposed to write.
        step('news', n(tally?.news), 'stories'),
        // Opening the office is work rather than rows; a 1 here would be a
        // number pretending to be a measurement.
        step('office', null, null),
      ];

      return { saveId, season: save.season, userTeamId: input.teamId, slot, steps };
    });
  },
};
