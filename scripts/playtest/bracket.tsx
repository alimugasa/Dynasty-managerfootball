// The bracket, in the play-test build.
//
// Draws what the engine's playoff module says: the seeds it drew, the rounds
// it paired, and the champion once the final has been played.

import { COLOR } from '../../src/app/tokens';
import { EmptyState, Panel, SectionHeader } from '../../src/components/Surface';
import { ListRow } from '../../src/components/ListRow';
import { TeamMark } from '../../src/components/TeamMark';
import { nextRound, ROUND_LABEL, type PlayoffGame, type PlayoffRound } from './postseason';
import { record, type ScreenProps as Props } from './common';

const ROUNDS: readonly PlayoffRound[] = ['OPENING', 'QUARTERFINAL', 'CONFERENCE_FINAL', 'LEAGUE_FINAL'];
const CONFERENCE_NAME: Readonly<Record<string, string>> = { AC: 'American', NC: 'National' };

export function BracketScreen({ game, open }: Props) {
  const nick = (id: string): string => game.clubs.get(id)?.nickname ?? id;
  const { champion } = nextRound(game);

  if (game.seeds.length === 0) {
    return (
      <EmptyState
        title="The field is not set"
        detail="Seeds are drawn when the regular season ends. Play it out to see the bracket."
      />
    );
  }

  return (
    <>
      {champion !== null && (
        <Panel>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <TeamMark
              abbreviation={champion}
              primary={game.clubs.get(champion)?.primary ?? COLOR.line}
              secondary={game.clubs.get(champion)?.secondary ?? COLOR.mut}
              size={44}
            />
            <div style={{ minWidth: 0 }}>
              <div style={{ color: COLOR.amber, fontSize: 11, letterSpacing: '0.06em' }}>
                {String(game.season)} CHAMPIONS
              </div>
              <div style={{ color: COLOR.tx, fontSize: 16, fontWeight: 600 }}>
                {game.clubs.get(champion)?.name ?? champion}
              </div>
            </div>
          </div>
        </Panel>
      )}

      {ROUNDS.map((round) => {
        const games = game.playoffs.filter((g) => g.round === round);
        if (games.length === 0) return null;
        return (
          <div key={round}>
            <SectionHeader title={ROUND_LABEL[round]} />
            <Panel padded={false}>
              <div style={{ padding: '0 12px' }}>
                {games.map((g) => (
                  <Tie
                    key={g.gameId}
                    game={g}
                    userTeamId={game.userTeamId}
                    nick={nick}
                    seed={(id) => game.seeds.find((s) => s.teamId === id)?.seed ?? 0}
                    open={open}
                  />
                ))}
              </div>
            </Panel>
          </div>
        );
      })}

      {(['AC', 'NC'] as const).map((conference) => {
        const seeds = game.seeds.filter((s) => s.conferenceId === conference);
        if (seeds.length === 0) return null;
        return (
          <div key={conference}>
            <SectionHeader title={`${CONFERENCE_NAME[conference] ?? conference} seeds`} />
            <Panel padded={false}>
              <div style={{ padding: '0 12px' }}>
                {seeds.map((s) => (
                  <ListRow
                    key={s.teamId}
                    leading={<SeedMark n={s.seed} />}
                    title={game.clubs.get(s.teamId)?.name ?? s.teamId}
                    subtitle={`${record(game.standings.get(s.teamId))} · ${s.divisionWinner ? 'Division winner' : 'Wild seed'}${s.seed === 1 ? ' · rests the opening round' : ''}`}
                    {...(s.teamId === game.userTeamId
                      ? { trailing: <span style={{ color: COLOR.amber, fontSize: 11 }}>YOUR CLUB</span> }
                      : {})}
                  />
                ))}
              </div>
            </Panel>
          </div>
        );
      })}
    </>
  );
}

function SeedMark({ n }: { readonly n: number }) {
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 22, height: 22, borderRadius: 6, background: COLOR.line,
        color: COLOR.tx, fontSize: 12, fontVariantNumeric: 'tabular-nums', flexShrink: 0,
      }}
    >
      {n}
    </span>
  );
}

function Tie(
  { game, userTeamId, nick, seed, open }: {
    readonly game: PlayoffGame; readonly userTeamId: string;
    readonly nick: (id: string) => string; readonly seed: (id: string) => number;
    readonly open: (screen: string, id: string) => void;
  },
) {
  const homeWon = game.homeScore > game.awayScore;
  const side = (id: string, score: number, won: boolean) => (
    <span style={{ color: id === userTeamId ? COLOR.amber : (won ? COLOR.tx : COLOR.mut) }}>
      {nick(id)} {String(score)}
    </span>
  );
  return (
    <ListRow
      title={
        <span style={{ fontSize: 13 }}>
          {side(game.awayTeamId, game.awayScore, !homeWon)}
          <span style={{ color: COLOR.dim }}>{game.neutralSite ? ' v ' : ' at '}</span>
          {side(game.homeTeamId, game.homeScore, homeWon)}
        </span>
      }
      subtitle={`${game.neutralSite ? 'Neutral ground · seeds' : 'Seeds'} ${String(seed(game.awayTeamId))} v ${String(seed(game.homeTeamId))}${game.overtime ? ' · OT' : ''}`}
      navigable
      onSelect={() => { open('game', game.gameId); }}
    />
  );
}
