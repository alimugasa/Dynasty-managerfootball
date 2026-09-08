// The two screens a season ends on: the awards, and then the year.
//
// Both read the recap the server wrote when the season was closed. Neither
// decides anything: the vote was taken by the engine, the book was written by
// the final, and this is the ceremony they never had.

import { COLOR } from '../app/tokens';
import { EmptyState, Panel, SectionHeader } from '../components/Surface';
import { ListRow } from '../components/ListRow';
import { TeamMark } from '../components/TeamMark';
import type { AwardOut, RecapOut } from '../../supabase/functions/_shared/api/reads/recap';

const RESULT: Readonly<Record<string, string>> = {
  MISSED: 'Missed the playoffs',
  OPENING: 'Out in the opening round',
  QUARTERFINAL: 'Out in the quarterfinals',
  CONFERENCE_FINAL: 'Lost the conference final',
  RUNNER_UP: 'Lost the league final',
  CHAMPION: 'Champions',
};

interface Props {
  readonly data: RecapOut;
  readonly nickname: (id: string | null) => string;
  readonly clubName: (id: string | null) => string;
  readonly colours: (id: string | null) => { readonly primary: string; readonly secondary: string };
  readonly open: (screen: string, params?: Record<string, string>) => void;
}

/**
 * The awards night.
 *
 * One card per award, because a list of five names in a row reads as data and
 * this is the one moment in a season that is not. The margin is on the card:
 * a winner who took 61% of the vote had a different year from one who scraped
 * 26%, and the ballot is what says so.
 */
export function AwardsPanel({ data, nickname, colours, open }: Props) {
  if (data.awards.length === 0) {
    return <EmptyState title="No awards were voted this season" />;
  }
  return (
    <>
      <SectionHeader title={`${String(data.season)} awards`} />
      <div style={{ display: 'grid', gap: 8 }} data-testid="awards-night">
        {data.awards.map((a) => <AwardCard key={a.code} award={a} nickname={nickname} colours={colours} open={open} />)}
      </div>

      <SectionHeader title="All-league first team" />
      <Panel padded={false}>
        <div style={{ padding: '0 12px' }}>
          {data.honours.filter((h) => h.team === 'ALL_LEAGUE_FIRST').map((h) => (
            <ListRow
              key={`${h.position}-${String(h.slot)}`}
              title={h.name}
              subtitle={`${h.position} · ${nickname(h.teamId)}`}
              navigable={h.playerId !== null}
              {...(h.playerId === null ? {} : {
                onSelect: () => { open('player', { id: h.playerId ?? '' }); },
              })}
            />
          ))}
        </div>
      </Panel>
    </>
  );
}

function AwardCard(
  { award, nickname, colours, open }:
  { readonly award: AwardOut } & Pick<Props, 'nickname' | 'colours' | 'open'>,
) {
  const second = award.ballot[1];
  const share = (value: number | null): string =>
    (value === null ? '' : `${String(Math.round(value * 100))}%`);
  const mark = colours(award.teamId);
  return (
    <Panel>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <TeamMark
          abbreviation={award.teamId ?? '—'}
          primary={mark.primary}
          secondary={mark.secondary}
          size={40}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: COLOR.amber, fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase' }}>
            {award.name}
          </div>
          <button
            type="button"
            onClick={() => { if (award.playerId !== null) open('player', { id: award.playerId }); }}
            disabled={award.playerId === null}
            style={{
              display: 'block', padding: 0, border: 0, background: 'none', textAlign: 'left',
              color: COLOR.tx, fontSize: 17, fontWeight: 600, minWidth: 0,
              cursor: award.playerId === null ? 'default' : 'pointer',
            }}
          >
            {award.winner}
          </button>
          <div style={{ color: COLOR.mut, fontSize: 12 }}>
            {nickname(award.teamId)}
            {award.voteShare === null ? '' : ` · ${share(award.voteShare)} of the vote`}
          </div>
        </div>
      </div>
      {second !== undefined && (
        <div style={{ marginTop: 8, color: COLOR.dim, fontSize: 12 }}>
          ahead of {second.name}, {nickname(second.teamId)} ({share(second.voteShare)})
        </div>
      )}
    </Panel>
  );
}

/** The year: who took it, what your club did, and what fell. */
export function YearPanel({ data, nickname, clubName, colours, open }: Props) {
  const fresh = data.records.filter((r) => r.setThisSeason);
  return (
    <>
      {data.championTeamId !== null && (
        <Panel>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <TeamMark
              abbreviation={data.championTeamId}
              primary={colours(data.championTeamId).primary}
              secondary={colours(data.championTeamId).secondary}
              size={44}
            />
            <div style={{ minWidth: 0 }}>
              <div style={{ color: COLOR.amber, fontSize: 11, letterSpacing: 0.6 }}>
                {String(data.season)} CHAMPIONS
              </div>
              <div style={{ color: COLOR.tx, fontSize: 16, fontWeight: 600 }}>
                {clubName(data.championTeamId)}
              </div>
              {data.runnerUpTeamId !== null && (
                <div style={{ color: COLOR.mut, fontSize: 12 }}>
                  beat {nickname(data.runnerUpTeamId)} in the League Final
                </div>
              )}
            </div>
          </div>
        </Panel>
      )}

      {data.you !== null && (
        <>
          <SectionHeader title="Your season" />
          <Panel padded={false}>
            <div style={{ padding: '0 12px' }}>
              <ListRow
                title={`${String(data.you.wins)}-${String(data.you.losses)}${data.you.ties > 0 ? `-${String(data.you.ties)}` : ''}`}
                subtitle={`${RESULT[data.you.playoffResult ?? 'MISSED'] ?? 'Season complete'}${data.you.seed === null ? '' : ` · seed ${String(data.you.seed)}`}`}
              />
            </div>
          </Panel>
        </>
      )}

      <SectionHeader title={fresh.length === 0 ? 'The record book' : 'Records set this season'} />
      {data.records.length === 0 ? (
        <EmptyState title="No records yet" detail="They are set as seasons are played." />
      ) : (
        <Panel padded={false}>
          <div style={{ padding: '0 12px' }}>
            {(fresh.length === 0 ? data.records.slice(0, 6) : fresh).map((r) => (
              <ListRow
                key={`${r.code}-${r.scope}`}
                title={`${r.name} · ${r.scope === 'CAREER' ? 'career' : 'season'}`}
                subtitle={`${r.holder}${r.season === null ? '' : `, ${String(r.season)}`}`}
                trailing={
                  <span style={{ color: r.setThisSeason ? COLOR.amber : COLOR.tx, fontSize: 13 }}>
                    {r.value}
                  </span>
                }
              />
            ))}
          </div>
        </Panel>
      )}

      <SectionHeader title="Every season" />
      <Panel padded={false}>
        <div style={{ padding: '0 12px' }}>
          <ListRow
            title="The full record"
            subtitle="Champions, awards and all-league, year by year"
            navigable
            onSelect={() => { open('recap'); }}
          />
        </div>
      </Panel>
    </>
  );
}
