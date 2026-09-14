// The free-agent pool.
//
// It stays open all season, which is the whole point of it: a manager who
// loses a starter in week 9 should be able to do something about it that
// afternoon. So this is a working list rather than a scouting exercise --
// filters along the top, the money in the row, and an offer two taps away.
//
// The filters are the ones the request names, and every one of them is applied
// by the server rather than here. The pool is over a thousand players deep; a
// screen that fetched all of them and hid most would be slower every week of
// the season, and would page through the wrong list.

import { useState } from 'react';
import { COLOR, S, TYPE } from '../app/tokens';
import { useSave } from '../app/SaveProvider';
import { useQuery } from '../hooks/useQuery';
import { useNavigator } from '../app/navigation';
import { Caption, EmptyState, Panel, SectionHeader } from '../components/Surface';
import { ChipRow, type Chip } from '../components/ChipRow';
import { StatTiles, type Stat } from '../components/StatTiles';
import { Loading, NoDynasty, QueryError } from '../components/QueryState';
import { SearchField } from './searchField';
import { MarketRow, Pill, money } from './marketRows';
import { OfferSheet } from './offerSheet';
import { Screen } from './Screen';
import type { FreeAgentsOut, PoolPlayer } from '../../supabase/functions/_shared/api/reads/freeAgents';

/** The position groups a manager actually shops by. Engine groups rather than
 *  the seed's display labels, because the server filters on the engine's. */
const GROUPS: readonly Chip[] = [
  { key: '', label: 'All' },
  { key: 'QB', label: 'QB' }, { key: 'RB', label: 'RB' }, { key: 'WR', label: 'WR' },
  { key: 'TE', label: 'TE' }, { key: 'OL', label: 'OL' }, { key: 'EDGE', label: 'EDGE' },
  { key: 'DT', label: 'DT' }, { key: 'LB', label: 'LB' }, { key: 'CB', label: 'CB' },
  { key: 'S', label: 'S' }, { key: 'K', label: 'K' }, { key: 'P', label: 'P' },
];

const SORTS: readonly Chip[] = [
  { key: 'OVERALL', label: 'Overall' },
  { key: 'POTENTIAL', label: 'Upside' },
  { key: 'ASK', label: 'Price' },
  { key: 'AGE', label: 'Youngest' },
  { key: 'NAME', label: 'Name' },
];

/** The shortcuts a manager reaches for, rather than nine numeric fields on a
 *  phone. Each maps onto the server's own filters. */
const LENSES: readonly Chip[] = [
  { key: 'ALL', label: 'Everyone' },
  { key: 'STARTERS', label: 'Starter grade' },
  { key: 'UPSIDE', label: 'Young upside' },
  { key: 'VETERANS', label: 'Experienced' },
  { key: 'CHEAP', label: 'Minimum deals' },
  { key: 'HEALTHY', label: 'Fit only' },
];

interface Lens {
  readonly minOverall?: number;
  readonly minPotential?: number;
  readonly maxAge?: number;
  readonly minExperience?: number;
  readonly maxAsk?: number;
  readonly health?: string;
}

const LENS_FILTER: Readonly<Record<string, Lens>> = {
  ALL: {},
  STARTERS: { minOverall: 72 },
  UPSIDE: { maxAge: 25, minPotential: 74 },
  VETERANS: { minExperience: 6 },
  CHEAP: { maxAsk: 2_000_000 },
  HEALTHY: { health: 'HEALTHY' },
};

export function FreeAgentsScreen() {
  const nav = useNavigator();
  const { save, loaded, loadError, version, notice } = useSave();
  const [group, setGroup] = useState('');
  const [sort, setSort] = useState('OVERALL');
  const [lens, setLens] = useState('ALL');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<PoolPlayer | null>(null);

  const filter = LENS_FILTER[lens] ?? {};
  const input = {
    saveId: save?.saveId ?? '',
    ...(group === '' ? {} : { group }),
    ...(search.trim() === '' ? {} : { search: search.trim() }),
    ...filter,
    sort,
    limit: 60,
  };
  // useQuery keys on the input as well as the version, so changing a filter
  // re-reads without any help from here.
  const q = useQuery<FreeAgentsOut>('free-agents', input, version, save !== null);

  if (loadError !== null) {
    return <Screen title="Free Agents" screen="freeAgents"><QueryError error={loadError} /></Screen>;
  }
  if (!loaded) {
    return <Screen title="Free Agents" screen="freeAgents"><Loading label="Loading dynasty" /></Screen>;
  }
  if (save === null) return <Screen title="Free Agents" screen="freeAgents"><NoDynasty /></Screen>;

  const d = q.status === 'ready' ? q.data : null;
  const tiles: readonly Stat[] = d === null ? [] : [
    { label: 'Available', value: String(d.poolSize) },
    {
      label: 'Roster',
      value: `${String(d.rosterCount)}/${String(d.rosterLimit)}`,
      tone: d.rosterCount >= d.rosterLimit ? 'negative' : 'default',
    },
    {
      label: 'Cap space',
      value: money(d.capSpace),
      tone: d.capSpace < 0 ? 'negative' : 'default',
    },
  ];

  return (
    <Screen
      title="Free Agents"
      {...(d === null ? {} : { subtitle: `Week ${String(d.week)} · ${String(d.poolSize)} unsigned` })}
      screen="freeAgents"
    >
      {notice !== null && (
        <p
          data-testid="notice"
          style={{ ...TYPE.prose, margin: `0 0 ${String(S[2])}px`, color: COLOR.red }}
        >
          {notice}
        </p>
      )}

      {d !== null && (
        <div style={{ marginBottom: S[3] }}>
          <StatTiles stats={tiles} />
        </div>
      )}

      <div style={{ display: 'grid', gap: S[2], marginBottom: S[3] }}>
        <SearchField
          value={search}
          onChange={setSearch}
          label="Search free agents"
          placeholder="Search by name"
          testId="fa-search"
        />
        <ChipRow chips={GROUPS} value={group} onChange={setGroup} label="Position" />
        <ChipRow chips={LENSES} value={lens} onChange={setLens} label="Filter" />
        <ChipRow chips={SORTS} value={sort} onChange={setSort} label="Sort" />
      </div>

      {q.status === 'error' && <QueryError error={q.error} onRetry={q.retry} />}
      {q.status === 'loading' && <Loading label="Reading the market" rows={8} />}
      {d !== null && (
        <>
          <SectionHeader
            title="On the market"
            action={(
              <span style={{ ...TYPE.micro, color: COLOR.mut, flexShrink: 0 }}>
                {`${String(d.players.length)} of ${String(d.poolSize)}`}
              </span>
            )}
          />
          <Panel>
            {d.players.length === 0 ? (
              <EmptyState
                title="Nobody matches"
                detail={'No unsigned player fits these filters this week. Widen the position '
                  + 'or clear the filter and the rest of the market comes back.'}
              />
            ) : (
              <div data-testid="fa-list">
                {d.players.map((p) => (
                  <MarketRow
                    key={p.playerId}
                    testId={`fa-${p.playerId}`}
                    p={p}
                    onSelect={() => { setOpen(p); }}
                    trailing={(
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {p.desiredRole !== null && <Pill text={p.desiredRole} />}
                        <Pill text={money(p.inSeasonAsk)} tone="warn" />
                      </span>
                    )}
                  />
                ))}
              </div>
            )}
          </Panel>
          <Caption>
            {'What a player asks for falls as the season runs down: the figure on each row '
              + 'is what he wants for the rest of this year, not his annual price.'}
          </Caption>
        </>
      )}

      {open !== null && d !== null && (
        <OfferSheet
          player={open}
          pool={d}
          onClose={() => { setOpen(null); }}
          onProfile={() => { nav.push('player', { id: open.playerId }); }}
        />
      )}
    </Screen>
  );
}
