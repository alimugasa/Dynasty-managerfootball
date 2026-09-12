// How a season ends in the play-test build: the awards, and then the year.
//
// Read from the vote the engine took when the season was closed, which lives
// on the game object because this build has no tables to read it from.

import { COLOR } from '../../src/app/tokens';
import { EmptyState, Panel, SectionHeader } from '../../src/components/Surface';
import { ListRow } from '../../src/components/ListRow';
import { TeamMark } from '../../src/components/TeamMark';
import { HonoursPanel } from '../../src/screens/honoursPanel';
import { conferences } from './world';
import { asHonourRows } from './common';
import type { Game, WinterPhase } from './host';

/** How a season ended, in the league's own words. */
const RESULT: Readonly<Record<string, string>> = {
  MISSED: 'Missed the playoffs',
  OPENING: 'Out in the opening round',
  QUARTERFINAL: 'Out in the quarterfinals',
  CONFERENCE_FINAL: 'Lost the conference final',
  RUNNER_UP: 'Lost the league final',
  CHAMPION: 'Champions',
};

/**
 * The awards, and then the year.
 *
 * Read from the vote the engine took when the season was closed, which is on
 * the game object rather than in a table because this build has no tables.
 */
export function SeasonSection(
  { game, phase, open }: {
    readonly game: Game; readonly phase: WinterPhase;
    readonly open: (screen: string, id: string) => void;
  },
) {
  const voted = game.awards[game.awards.length - 1];
  const last = game.history[game.history.length - 1];
  const nick = (id: string): string => game.clubs.get(id)?.nickname ?? id;
  const share = (value: number): string => `${String(Math.round(value * 100))}%`;

  if (phase === 'AWARDS') {
    if (voted === undefined) return <EmptyState title="No awards were voted this season" />;
    return (
      <>
        <SectionHeader title={`${String(voted.season)} awards`} />
        <div style={{ display: 'grid', gap: 8 }}>
          {voted.awards.map((a) => {
            const second = a.ballot[1];
            const club = game.clubs.get(a.winner.teamId);
            return (
              <Panel key={a.code}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                  <TeamMark
                    abbreviation={a.winner.teamId}
                    primary={club?.primary ?? COLOR.line}
                    secondary={club?.secondary ?? COLOR.mut}
                    size={40}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: COLOR.amber, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                      {a.name}
                    </div>
                    <div style={{ color: COLOR.tx, fontSize: 17, fontWeight: 600 }}>{a.winner.name}</div>
                    <div style={{ color: COLOR.mut, fontSize: 12 }}>
                      {nick(a.winner.teamId)} · {share(a.winner.voteShare)} of the vote
                    </div>
                  </div>
                </div>
                {second !== undefined && (
                  <div style={{ marginTop: 8, color: COLOR.dim, fontSize: 12 }}>
                    ahead of {second.name}, {nick(second.teamId)} ({share(second.voteShare)})
                  </div>
                )}
              </Panel>
            );
          })}
        </div>

        <HonoursPanel
          honours={asHonourRows(voted.honours)}
          nickname={(id) => nick(id ?? '')}
          conferenceName={(id) => conferences().find((c) => c.id === id)?.name ?? id}
          open={(screen, params) => { open(screen, params['id'] ?? ''); }}
        />
      </>
    );
  }

  const champion = last?.championId ?? '';
  return (
    <>
      {champion !== '' && (
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
                {String(last?.season ?? game.season)} CHAMPIONS
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
            title={last === undefined
              ? '—'
              : `${String(last.wins)}-${String(last.losses)}${last.ties > 0 ? `-${String(last.ties)}` : ''}`}
            subtitle={RESULT[last?.playoffResult ?? 'MISSED'] ?? 'Season complete'}
          />
          <ListRow
            title="The full record"
            subtitle="Champions, awards and all-league, year by year"
            navigable
            onSelect={() => { open('recap', ''); }}
          />
        </div>
      </Panel>
    </>
  );
}

