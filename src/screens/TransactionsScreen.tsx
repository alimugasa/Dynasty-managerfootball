// The league's transaction history.
//
// It was a placeholder: a skeleton that loaded forever, registered only so
// that nothing could navigate into a hole. Now it reads the record every move
// in this game writes -- a release, a waiver claim, a signing -- and shows it
// newest first, for the whole league or for one club.
//
// The reason this is a screen rather than a section of the news feed is that
// the two answer different questions. The feed says what was worth reporting;
// this says what happened. A depth signing by a club in another conference is
// not news and is absolutely a transaction, and a manager checking whether a
// rival filled its hole at cornerback needs the second list, not the first.

import { useState } from 'react';
import { COLOR, FONT, S, TYPE } from '../app/tokens';
import { useSave } from '../app/SaveProvider';
import { useQuery } from '../hooks/useQuery';
import { useNavigator } from '../app/navigation';
import { Caption, EmptyState, Panel, SectionHeader } from '../components/Surface';
import { ChipRow, type Chip } from '../components/ChipRow';
import { ListRow } from '../components/ListRow';
import { PlayerFace } from '../avatar/PlayerFace';
import { useAvatars, type AvatarMap } from '../hooks/useAvatars';
import { Loading, NoDynasty, QueryError } from '../components/QueryState';
import { Pill, money } from './marketRows';
import { Screen } from './Screen';
import type {
  TransactionRow, TransactionsOut,
} from '../../supabase/functions/_shared/api/reads/transactions';

const KINDS: readonly Chip[] = [
  { key: '', label: 'Everything' },
  { key: 'FREE_AGENT_SIGNING', label: 'Signings' },
  { key: 'WAIVER_CLAIM', label: 'Claims' },
  { key: 'RELEASE', label: 'Releases' },
  { key: 'TRADE', label: 'Trades' },
  { key: 'DRAFT_SELECTION', label: 'Draft' },
];

/** What a move is called where a manager can read it. The database's own names
 *  are shouted constants; these are the words a transaction wire uses. */
const KIND_LABEL: Readonly<Record<string, string>> = {
  DRAFT_SELECTION: 'Drafted',
  ROOKIE_SIGNING: 'Rookie deal',
  FREE_AGENT_SIGNING: 'Signed',
  RE_SIGNING: 'Re-signed',
  RELEASE: 'Released',
  TRADE: 'Traded',
  WAIVER_CLAIM: 'Claimed',
  IR_PLACEMENT: 'To injured list',
  IR_RETURN: 'Activated',
  PRACTICE_SQUAD_SIGNING: 'Practice squad',
  RETIREMENT: 'Retired',
  CONTRACT_EXPIRY: 'Contract expired',
  CONTRACT_EXTENSION: 'Extended',
  WASHOUT: 'Released',
  COACH_HIRE: 'Coach hired',
  COACH_FIRE: 'Coach dismissed',
  COACH_RETIRE: 'Coach retired',
  COACH_PROMOTE: 'Coach promoted',
};

const toneFor = (kind: string): 'quiet' | 'good' | 'bad' | 'warn' => {
  if (kind === 'RELEASE' || kind === 'WASHOUT' || kind === 'COACH_FIRE') return 'bad';
  if (kind === 'WAIVER_CLAIM') return 'warn';
  if (kind.includes('SIGNING') || kind === 'RE_SIGNING') return 'good';
  return 'quiet';
};

/** Stable across renders, so the face read does not re-key while the history
 *  is in flight. */
const NO_IDS: readonly string[] = [];

export function TransactionsScreen() {
  const nav = useNavigator();
  const { save, loaded, loadError, version } = useSave();
  const [kind, setKind] = useState('');
  const [mine, setMine] = useState(false);

  const q = useQuery<TransactionsOut>('transactions', {
    saveId: save?.saveId ?? '',
    ...(kind === '' ? {} : { kind }),
    ...(mine && save !== null ? { teamId: save.userTeamId } : {}),
    limit: 150,
  }, version, save !== null);
  // Above the early returns. A transaction whose player is no longer on record
  // has a null id and simply gets no face.
  const faces = useAvatars(
    q.status === 'ready'
      ? q.data.rows.flatMap((r) => (r.playerId === null ? [] : [r.playerId]))
      : NO_IDS,
  );

  if (loadError !== null) {
    return <Screen title="Transactions" screen="transactions"><QueryError error={loadError} /></Screen>;
  }
  if (!loaded) {
    return <Screen title="Transactions" screen="transactions"><Loading label="Loading dynasty" /></Screen>;
  }
  if (save === null) return <Screen title="Transactions" screen="transactions"><NoDynasty /></Screen>;

  const d = q.status === 'ready' ? q.data : null;

  return (
    <Screen
      title="Transactions"
      {...(d === null ? {} : { subtitle: `${String(d.season)} season` })}
      screen="transactions"
    >
      <div style={{ display: 'grid', gap: S[2], marginBottom: S[3] }}>
        <ChipRow chips={KINDS} value={kind} onChange={setKind} label="Kind of move" />
        <ChipRow
          chips={[{ key: 'ALL', label: 'Whole league' }, { key: 'MINE', label: 'My club' }]}
          value={mine ? 'MINE' : 'ALL'}
          onChange={(k) => { setMine(k === 'MINE'); }}
          label="Whose moves"
        />
      </div>

      {q.status === 'error' && <QueryError error={q.error} onRetry={q.retry} />}
      {q.status === 'loading' && <Loading label="Reading the record" rows={10} />}
      {d !== null && (
        <>
          <SectionHeader title="Every move" />
          <Panel>
            {d.rows.length === 0 ? (
              <EmptyState
                title="Nothing here yet"
                detail={kind === ''
                  ? 'No club has moved a player this season. The first cut, claim or signing '
                    + 'shows up here the moment it happens.'
                  : `No ${(KIND_LABEL[kind] ?? kind).toLowerCase()} moves this season.`}
              />
            ) : (
              <div data-testid="transaction-list">
                {d.rows.map((r) => <Row key={r.id} r={r} onPlayer={nav.push} avatars={faces} />)}
              </div>
            )}
          </Panel>
          <Caption>
            {'Newest first. This is the record rather than the news: every move is here, '
              + 'whether or not anybody wrote about it.'}
          </Caption>
        </>
      )}
    </Screen>
  );
}

function Row({ r, onPlayer, avatars }: {
  readonly r: TransactionRow;
  readonly onPlayer: (screen: string, params: Record<string, string>) => void;
  readonly avatars: AvatarMap;
}) {
  const where = r.week === null ? r.phase.replace(/_/g, ' ').toLowerCase() : `Week ${String(r.week)}`;
  return (
    <ListRow
      navigable={r.playerId !== null}
      {...(r.playerId === null
        ? {}
        : { onSelect: () => { onPlayer('player', { id: r.playerId ?? '' }); } })}
      leading={(
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {r.playerId !== null && (
            <PlayerFace
              avatars={avatars} playerId={r.playerId}
              name={r.playerName ?? ''} size="thumb"
            />
          )}
          <span style={{ width: 62, flexShrink: 0 }}>
            <Pill text={KIND_LABEL[r.kind] ?? r.kind} tone={toneFor(r.kind)} />
          </span>
        </span>
      )}
      title={r.playerName ?? 'Player not on record'}
      subtitle={[
        where,
        r.teamName ?? r.teamId ?? 'Club not on record',
        r.detail,
      ].filter((s): s is string => s !== null && s !== '').join(' · ')}
      trailing={(
        <span
          style={{
            ...TYPE.micro, color: r.mine ? COLOR.amber : COLOR.dim,
            fontFamily: FONT.display, fontVariantNumeric: 'tabular-nums',
            whiteSpace: 'nowrap',
          }}
        >
          {r.capImpact === null || r.capImpact === 0 ? '' : money(r.capImpact)}
        </span>
      )}
    />
  );
}
