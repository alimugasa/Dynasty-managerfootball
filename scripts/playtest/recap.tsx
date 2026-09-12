// Season recap, in the play-test build: how the year ended and who it
// belonged to. The engine voted; this draws the ballot.

import { COLOR } from '../../src/app/tokens';
import { Caption, EmptyState, Panel, SectionHeader } from '../../src/components/Surface';
import { ListRow } from '../../src/components/ListRow';
import { TeamMark } from '../../src/components/TeamMark';
import { HonoursPanel } from '../../src/screens/honoursPanel';
import { playoffOutcomes } from './postseason';
import { conferences } from './world';
import { asHonourRows, record, type ScreenProps as Props } from './common';

const RESULT: Readonly<Record<string, string>> = {
  MISSED: 'Missed the playoffs',
  OPENING: 'Out in the opening round',
  QUARTERFINAL: 'Out in the quarterfinals',
  CONFERENCE_FINAL: 'Lost the conference final',
  RUNNER_UP: 'Lost the league final',
  CHAMPION: 'Champions',
};

export function RecapScreen({ game, open }: Props) {
  // The season just closed, or the one being played if it is over.
  const latest = game.awards[game.awards.length - 1];
  const live = game.phase === 'OFFSEASON' && game.seeds.length > 0;
  const outcomes = live ? playoffOutcomes(game) : new Map<string, string>();
  const champion = live
    ? [...outcomes.entries()].find(([, o]) => o === 'CHAMPION')?.[0] ?? null
    : game.history[game.history.length - 1]?.championId ?? null;
  const nick = (id: string): string => game.clubs.get(id)?.nickname ?? id;

  if (latest === undefined && !live) {
    return (
      <EmptyState
        title="No season has finished yet"
        detail="The recap is written when the final has been played."
      />
    );
  }

  const yourResult = live
    ? outcomes.get(game.userTeamId) ?? 'MISSED'
    : game.history[game.history.length - 1]?.playoffResult ?? 'MISSED';

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
                {String(latest?.season ?? game.season)} CHAMPIONS
              </div>
              <div style={{ color: COLOR.tx, fontSize: 16, fontWeight: 600 }}>
                {game.clubs.get(champion)?.name ?? champion}
              </div>
            </div>
          </div>
        </Panel>
      )}

      <SectionHeader title="Your season" />
      <Panel padded={false}>
        <div style={{ padding: '0 12px' }}>
          <ListRow
            title={record(game.standings.get(game.userTeamId))}
            subtitle={RESULT[yourResult] ?? 'Season complete'}
            trailing={<Caption>{game.clubs.get(game.userTeamId)?.nickname ?? game.userTeamId}</Caption>}
          />
        </div>
      </Panel>

      {latest !== undefined && (
        <>
          <SectionHeader title={`Awards · ${String(latest.season)}`} />
          <Panel padded={false}>
            <div style={{ padding: '0 12px' }}>
              {latest.awards.map((a) => (
                <ListRow
                  key={a.code}
                  title={a.winner.name}
                  subtitle={`${a.name} · ${nick(a.winner.teamId)} · ${String(Math.round(a.winner.voteShare * 100))}% of the vote`}
                  navigable={a.winner.playerId !== null}
                  {...(a.winner.playerId === null ? {} : {
                    onSelect: () => { open('player', a.winner.playerId ?? ''); },
                  })}
                />
              ))}
            </div>
          </Panel>

          <HonoursPanel
            honours={asHonourRows(latest.honours)}
            nickname={(id) => nick(id ?? '')}
            conferenceName={(id) => conferences().find((c) => c.id === id)?.name ?? id}
            open={(screen, params) => { open(screen, params['id'] ?? ''); }}
          />
        </>
      )}
    </>
  );
}
