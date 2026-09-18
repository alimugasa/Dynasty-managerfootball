import { COLOR, S, TYPE } from '../../app/tokens';
import { EntityLink } from '../../components/EntityLink';
import { Panel, EmptyState } from '../../components/Surface';
import { ChipRow } from '../../components/ChipRow';
import { useUiState } from '../../app/useUiState';
import { useSave } from '../../app/SaveProvider';
import type { LeagueIntelligenceOut } from '../../../supabase/functions/_shared/api/reads/leagueIntelligence';

export function PicturePanel({ data: d }: { readonly data: LeagueIntelligenceOut }) {
  const [selected, setSelected] = useUiState('pictureConference', '');
  if (d.picture === null) return null;
  const conferences = d.picture.conferences;
  const chosen = conferences.find((c) => c.id === selected)
    ?? conferences.find((c) => c.teams.some((t) => t.teamId === d.userTeamId)) ?? conferences[0];
  const own = conferences.flatMap((c) => c.teams).find((t) => t.teamId === d.userTeamId);
  if (chosen === undefined) return <EmptyState title="Conference data unavailable" />;
  return <>
    <p style={copy}>If the season ended now · {d.picture.qualifiers} places per conference.
      Current positions are not clinching or elimination declarations.</p>
    {own !== undefined && <Panel>
      <div style={{ ...TYPE.micro, color: COLOR.amber }}>Your franchise · {own.name}</div>
      <strong style={TYPE.prose}>{own.seed === null ? 'Chasing a postseason place' : 'Current seed ' + String(own.seed)}</strong>
      <p style={copy}>{own.wins}–{own.losses}–{own.ties} · Division #{own.divisionRank}
        {own.gamesBack !== null && ' · ' + String(own.gamesBack) + ' games behind current cutoff (record only)'}</p>
    </Panel>}
    <ChipRow label="Picture conference" value={chosen.id} onChange={setSelected}
      chips={conferences.map((c) => ({ key: c.id, label: c.name }))} />
    <h2 style={TYPE.heading}>{chosen.name}</h2>
    <div style={stack}>{chosen.teams.map((t) => <Panel key={t.teamId}>
      <div data-testid={'picture-team-' + t.teamId}>
        <div style={{ ...TYPE.micro, color: COLOR.amber }}>{t.seed === null ? 'Chasing' : 'Seed ' + String(t.seed)}
          {t.teamId === d.userTeamId && ' · YOUR FRANCHISE'}</div>
        <div style={TYPE.heading}><EntityLink to={{ kind: 'team', id: t.teamId }}>{t.name}</EntityLink></div>
        <p style={copy}>{t.wins}–{t.losses}–{t.ties} · {t.division}<br />{t.status} · {t.remaining} games remaining</p>
        <p style={copy}>Division #{t.divisionRank} · Conference record #{t.conferenceRank}
          {t.gamesBack !== null && ' · ' + String(t.gamesBack) + ' games behind current cutoff (record only)'}</p>
      </div>
    </Panel>)}</div>
    <details><summary style={summary}>How seeds are decided</summary>
      <p style={copy}>Division winners lead the field, followed by the remaining qualifiers. Order: {d.picture.tiebreakers.join(' → ')}.</p>
      <p style={copy}>This is the same seeding routine used to create the actual postseason. Conference record rank can differ from seed because division winners take priority.</p>
    </details>
  </>;
}

export function RacesPanel({ data: d }: { readonly data: LeagueIntelligenceOut }) {
  const [code, setCode] = useUiState('awardRace', 'PLAYER_OF_THE_YEAR');
  const { clubsById } = useSave();
  if (d.races === null) return null;
  const race = d.races.find((r) => r.code === code) ?? d.races[0];
  if (race === undefined) return <EmptyState title="No award candidates yet" />;
  return <>
    <p style={copy}>Regular-season performance watchlists, not final votes. Newcomer side lists are views of the existing newcomer race.</p>
    <label style={copy}>Award race<select aria-label="Award race" value={race.code} onChange={(e) => { setCode(e.target.value); }} style={select}>
      {d.races.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
    </select></label>
    <h2 style={TYPE.heading}>{race.name}</h2>
    {race.candidates.length === 0 ? <EmptyState title="No eligible candidates" detail="Candidates need recorded production and participation in at least half their team's games." />
      : <div style={stack} data-testid="award-candidates">{race.candidates.map((p) => <Panel key={p.playerId}>
        <div style={{ ...TYPE.micro, color: COLOR.amber }}>#{p.rank} · {p.position}
          {p.movement !== null && ' · ' + p.movement + (p.places === null || p.places === 0 ? '' : ' ' + String(p.places))}</div>
        <div style={TYPE.heading}><EntityLink to={{ kind: 'player', id: p.playerId }}>{p.name}</EntityLink></div>
        <div style={copy}><EntityLink to={{ kind: 'team', id: p.teamId }}>{clubsById.get(p.teamId)?.name ?? p.teamId}</EntityLink> · {p.games} games</div>
        <p style={copy}>{p.evidence}</p>
        <p style={copy}>Performance index {p.index.toFixed(2)} · {p.experience === 0 ? 'Rookie' : 'Veteran'}</p>
      </Panel>)}</div>}
    <details><summary style={summary}>Method and limits</summary>
      <p style={copy}>Production is compared with players at the same position. Passing weighs yards, touchdowns and interceptions; skill players use scrimmage yards and touchdowns; defenders use tackles, sacks and interceptions. Offensive efficiency and participation refine the index.</p>
      <p style={copy}>The overall and combined newcomer races also use the final awards' positional-value weights. Equal indices share a rank. Movement compares recorded game lines through the previous completed week; NEW means new to that shortlist. This is not a predicted vote share or a season grade.</p>
      <p style={copy}>Blocking production and live season grades are not recorded. Linemen and specialists are outside these performance watchlists. Final awards use the existing season grades and voter model and can differ. Coaching and improvement races are not available.</p>
    </details>
  </>;
}
export function RankingsPanel({ data: d }: { readonly data: LeagueIntelligenceOut }) {
  const [key, setKey] = useUiState('teamRankMetric', 'offense');
  const board = d.rankings.find((b) => b.key === key);
  if (board === undefined) return <EmptyState title="Ranking metric unavailable" />;
  return <>
    <label style={copy}>Rank teams by<select aria-label="Ranking metric" value={key} onChange={(e) => { setKey(e.target.value); }} style={select}>
      {d.rankings.map((b) => <option value={b.key} key={b.key}>{b.label}</option>)}
    </select></label>
    <p style={copy}>{board.detail} Equal unrounded values share a rank. Only regular-season games count.</p>
    <div style={stack} data-testid="ranking-rows">{board.rows.map((t) => <Panel key={t.teamId}>
      <div data-testid={'rank-team-' + t.teamId} style={{ display: 'flex', gap: S[3], alignItems: 'center' }}>
        <strong style={{ ...TYPE.heading, minWidth: 30 }}>{t.rank === null ? 'Unranked' : '#' + String(t.rank)}</strong>
        <div style={{ minWidth: 0, ...TYPE.prose }}>
          {t.teamId === d.userTeamId && <div style={{ ...TYPE.micro, color: COLOR.amber }}>Your franchise</div>}
          <EntityLink to={{ kind: 'team', id: t.teamId }}>{t.name}</EntityLink>
          <div style={{ fontSize: 12, color: COLOR.mut }}>{t.value === null ? 'No games recorded' : String(t.value) + ' ' + board.unit} · {t.games} games</div>
        </div>
      </div>
    </Panel>)}</div>
  </>;
}
const copy = { ...TYPE.prose, fontSize: 12, color: COLOR.mut };
const stack = { display: 'grid', gap: S[2], marginBlock: S[3] };
const summary = { ...TYPE.prose, minHeight: 44, cursor: 'pointer', paddingBlock: S[3] };
const select = { width: '100%', minHeight: 44, marginTop: S[2], background: COLOR.panel,
  border: '1px solid ' + COLOR.line2, borderRadius: 10, padding: S[2], color: COLOR.tx };
