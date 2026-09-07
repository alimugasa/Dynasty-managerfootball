// League -> document.
//
// Every field is written explicitly. A spread of the runtime object would be
// shorter and would be the wrong thing: it makes the document's shape a
// consequence of whatever the engine happens to hold today, so a field added to
// CareerPlayer would silently enter saves without a version bump, and a field
// removed would silently vanish from them. Naming each one means the document
// changes only when someone changes it.

import type { League } from '../engine/offseason/league.ts';
import type { CareerPlayer, Prospect } from '../engine/offseason/types.ts';
import type { TeamFront } from '../engine/offseason/frontOffice.ts';
import { SAVE_SCHEMA_VERSION } from './version.ts';
import type {
  SavedDeadMoney, SavedPlayer, SavedProspect, SaveDocument, SaveMeta,
} from './types.ts';

function savePlayer(p: CareerPlayer): SavedPlayer {
  return {
    id: p.id,
    name: p.name,
    group: p.group,
    teamId: p.teamId,
    ability: p.ability,
    potential: p.potential,
    mental: p.mental,
    reputation: p.reputation,
    age: p.age,
    experience: p.experience,
    devRate: p.devRate,
    workEthic: p.workEthic,
    durability: p.durability,
    footballIq: p.footballIq,
    gamesMissedCareer: p.gamesMissedCareer,
    gamesMissedSeason: p.gamesMissedSeason,
    allLeague: p.accolades.allLeague,
    awards: p.accolades.awards,
    rings: p.accolades.rings,
    retired: p.retired,
    retiredInSeason: p.retiredInSeason,
    personality: p.personality,
    contract: p.contract === null ? null : {
      aav: p.contract.aav,
      yearsRemaining: p.contract.yearsRemaining,
      years: p.contract.years,
      guaranteed: p.contract.guaranteed,
      signedSeason: p.contract.signedSeason,
    },
    previousTeamId: p.previousTeamId,
  };
}

function saveProspect(p: Prospect): SavedProspect {
  return {
    id: p.id, name: p.name, group: p.group, draftYear: p.draftYear,
    personality: p.personality, ability: p.ability, potential: p.potential,
    age: p.age, devRate: p.devRate, workEthic: p.workEthic,
    durability: p.durability, footballIq: p.footballIq,
  };
}

export interface SerializeOptions {
  readonly meta: SaveMeta;
  /** Dead money by club, by the season the charge was incurred. The runtime
   *  League carries only the current season's, so the caller supplies the
   *  history it is holding. */
  readonly deadMoneyBySeason?: SavedDeadMoney;
}

export function serialize(league: League, options: SerializeOptions): SaveDocument {
  const fronts: Record<string, TeamFront> = {};
  for (const [id, front] of league.fronts) fronts[id] = front;

  const pipeline: Record<string, SavedProspect[]> = {};
  for (const [year, prospects] of league.pipeline) {
    pipeline[String(year)] = prospects.map(saveProspect);
  }

  // The current season's charges are folded into whatever history the caller
  // passed, rather than replacing it: a club can owe money from two seasons at
  // once, and dropping the older charge would quietly hand it cap space.
  const deadMoney: Record<string, Record<string, number>> = {};
  for (const [teamId, bySeason] of Object.entries(options.deadMoneyBySeason ?? {})) {
    deadMoney[teamId] = { ...bySeason };
  }
  for (const [teamId, amount] of league.deadMoney) {
    if (amount === 0) continue;
    const forTeam = deadMoney[teamId] ?? {};
    forTeam[String(league.season)] = amount;
    deadMoney[teamId] = forTeam;
  }

  return {
    version: SAVE_SCHEMA_VERSION,
    meta: options.meta,
    teamIds: [...league.teamIds],
    fronts,
    players: league.players.map(savePlayer),
    pipeline,
    deadMoney,
  };
}
