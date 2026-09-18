import type { Handler } from '../context.ts';
import { ownedSave } from '../save.ts';
import { rawOf, requireString } from '../parse.ts';
import { intelligenceCalendar, type IntelligenceCalendar } from '../leagueIntelligence/calendar.ts';
import { readTeamRankings, type RankingBoard } from '../leagueIntelligence/teamRankings.ts';
import { readPlayoffPicture, type PlayoffPicture } from '../leagueIntelligence/playoffPicture.ts';
import { readAwardRaces } from '../leagueIntelligence/awardRead.ts';
import { withRaceMovement, type RaceBoard } from '../leagueIntelligence/awardModel.ts';
export interface LeagueIntelligenceOut {
  readonly calendar: IntelligenceCalendar; readonly userTeamId: string;
  readonly rankings: readonly RankingBoard[]; readonly picture: PlayoffPicture | null;
  readonly races: readonly RaceBoard[] | null;
}
export const leagueIntelligence: Handler<{ readonly saveId: string }, LeagueIntelligenceOut> = {
  auth: 'required',
  parse: (raw) => ({ saveId: requireString(rawOf(raw), 'saveId') }),
  // One read-only snapshot keeps the calendar, field and both leaderboards
  // coherent even if another tab advances the week while this request runs.
  run: ({ sql, userId }, { saveId }) => sql.begin('isolation level repeatable read read only', async (db) => {
    const save = await ownedSave(db, userId, saveId);
    const calendar = await intelligenceCalendar(db, save);
    const [rankings, picture, current, prior] = await Promise.all([
      readTeamRankings(db, saveId, save.season, calendar.throughWeek),
      calendar.pictureActive ? readPlayoffPicture(db, save) : null,
      calendar.awardsActive ? readAwardRaces(db, saveId, save.season, calendar.throughWeek) : null,
      calendar.awardsActive && calendar.throughWeek > calendar.awardFromWeek
        ? readAwardRaces(db, saveId, save.season, calendar.throughWeek - 1) : [],
    ]);
    return { calendar, userTeamId: save.user_team_id, rankings, picture,
      races: current === null ? null : withRaceMovement(current, prior) };
  }) as Promise<LeagueIntelligenceOut>,
};
