// The waiver wire.
//
// The header answers the four questions a manager has before reading a single
// name: where am I in the queue, how long have I got, can I fit anybody, and
// what have I already put a claim in for. Without those the list underneath is
// just names -- a claim is only a decision if you know what it costs and where
// you stand.
//
// Tapping a player opens the panel that turns him into a decision: the deal
// that comes with him, what it does to the cap, whether there is a roster
// place, and the priority the claim would be settled from. One of three things
// can be done there and all three are real -- claim, withdraw, or leave him --
// because a panel with a dead button on it is worse than a panel with two.

import { useState } from 'react';
import { COLOR, S, TYPE } from '../app/tokens';
import { useSave } from '../app/SaveProvider';
import { useQuery } from '../hooks/useQuery';
import { Caption, EmptyState, Panel, SectionHeader } from '../components/Surface';
import { StatTiles, type Stat } from '../components/StatTiles';
import { ActionButton } from '../components/ActionButton';
import { Sheet } from '../components/Sheet';
import { Loading, NoDynasty, QueryError } from '../components/QueryState';
import { MarketRow, Pill, TermLine, money } from './marketRows';
import { Screen } from './Screen';
import { useNavigator } from '../app/navigation';
import type { WaiverRow, WaiverWireOut } from '../../supabase/functions/_shared/api/reads/waiverWire';

const ordinal = (n: number): string => {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${String(n)}th`;
  return `${String(n)}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
};

export function WaiverWireScreen() {
  const nav = useNavigator();
  const { save, loaded, loadError, version, busy, notice, marketMove } = useSave();
  const [open, setOpen] = useState<WaiverRow | null>(null);
  const q = useQuery<WaiverWireOut>(
    'waiver-wire', { saveId: save?.saveId ?? '' }, version, save !== null);

  if (loadError !== null) {
    return <Screen title="Waiver Wire" screen="waivers"><QueryError error={loadError} /></Screen>;
  }
  if (!loaded) {
    return <Screen title="Waiver Wire" screen="waivers"><Loading label="Loading dynasty" /></Screen>;
  }
  if (save === null) return <Screen title="Waiver Wire" screen="waivers"><NoDynasty /></Screen>;

  const d = q.status === 'ready' ? q.data : null;

  // Where this club sits, and what it can do about it. Priority is null before
  // the season's first ordering, and says so rather than showing a 1 nobody
  // earned.
  const tiles: readonly Stat[] = d === null ? [] : [
    {
      label: 'Priority',
      value: d.priority === null ? null : `${ordinal(d.priority)} of ${String(d.clubs)}`,
      tone: d.priority !== null && d.priority <= 8 ? 'positive' : 'default',
    },
    { label: 'Claims in', value: String(d.claimsSubmitted) },
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
    { label: 'Available', value: String(d.available) },
    {
      label: 'Window shuts',
      value: d.closesWeek === null ? null : `Week ${String(d.closesWeek)}`,
      tone: 'accent',
    },
  ];

  const act = async (route: string, playerId: string): Promise<void> => {
    await marketMove(route, { playerId });
    setOpen(null);
  };

  return (
    <Screen
      title="Waiver Wire"
      {...(d === null
        ? {}
        : { subtitle: `Week ${String(d.week)} · ${String(d.available)} available` })}
      screen="waivers"
    >
      {notice !== null && (
        <p
          data-testid="notice"
          style={{ ...TYPE.prose, margin: `0 0 ${String(S[2])}px`, color: COLOR.red }}
        >
          {notice}
        </p>
      )}

      {q.status === 'error' && <QueryError error={q.error} onRetry={q.retry} />}
      {q.status === 'loading' && <Loading label="Loading the wire" rows={6} />}
      {d !== null && (
        <>
          <div style={{ marginBottom: S[3] }} data-testid="waiver-header">
            <StatTiles stats={tiles.slice(0, 3)} />
            <div style={{ marginTop: S[2] }}>
              <StatTiles stats={tiles.slice(3)} />
            </div>
          </div>

          <SectionHeader title="On waivers" />
          <Panel>
            {d.players.length === 0 ? (
              <EmptyState
                title="Nobody is on waivers"
                detail={'A released player with fewer than four seasons passes through here '
                  + `for ${String(d.windowWeeks)} week${d.windowWeeks === 1 ? '' : 's'} `
                  + 'before anybody can sign him. Nothing is on the wire this week.'}
              />
            ) : (
              <div data-testid="waiver-list">
                {d.players.map((p) => (
                  <MarketRow
                    key={p.playerId}
                    testId={`waiver-${p.playerId}`}
                    p={{ ...p, previousTeamName: p.fromTeamName }}
                    onSelect={() => { setOpen(p); }}
                    trailing={(
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {p.claimed && <Pill text="Claimed" tone="good" />}
                        <Pill
                          text={`WK ${String(p.deadlineWeek)}`}
                          tone={p.deadlineWeek <= d.week + 1 ? 'warn' : 'quiet'}
                        />
                        <Pill text={`${String(p.claims)} in`} />
                      </span>
                    )}
                  />
                ))}
              </div>
            )}
          </Panel>
          <Caption>
            {`A claim is settled at the top of week ${String(d.closesWeek ?? d.week + 1)}, `
              + 'and goes to the best waiver priority among the clubs that can take him. '
              + 'Losing clubs are told.'}
          </Caption>
        </>
      )}

      {open !== null && d !== null && (
        <WaiverPanel
          p={open}
          out={d}
          busy={busy !== null}
          onClose={() => { setOpen(null); }}
          onProfile={() => { nav.push('player', { id: open.playerId }); }}
          onClaim={() => { void act('claim-player', open.playerId); }}
          onWithdraw={() => { void act('withdraw-claim', open.playerId); }}
        />
      )}
    </Screen>
  );
}

/**
 * The claim panel: what taking him would actually mean.
 *
 * The inherited contract is the point. A claim is not a signing -- the club
 * takes the deal as it stands, which is exactly why a good player on a bad
 * contract goes unclaimed and a fringe player on a rookie deal does not.
 */
function WaiverPanel({ p, out, busy, onClose, onProfile, onClaim, onWithdraw }: {
  readonly p: WaiverRow;
  readonly out: WaiverWireOut;
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onProfile: () => void;
  readonly onClaim: () => void;
  readonly onWithdraw: () => void;
}) {
  const room = out.rosterCount < out.rosterLimit;
  const affordable = p.inheritedAav === null || out.capSpace >= p.inheritedAav;
  const canClaim = room && affordable && out.priority !== null;

  return (
    <Sheet
      title={`${p.position} ${p.name}`}
      detail={`Released by ${p.fromTeamName ?? 'a club no longer on record'} in week ${String(p.postedWeek)}`}
      testId="waiver-panel"
      onClose={onClose}
    >
      <div style={{ display: 'grid', gap: S[1], marginBottom: S[3] }}>
        <TermLine label="Age" value={`${String(p.age)}`} />
        <TermLine label="Overall / potential" value={`${String(p.overall)} / ${String(p.potential)}`} />
        <TermLine
          label="Experience"
          value={p.experienceYears === 0 ? 'Rookie' : `${String(p.experienceYears)} seasons`}
        />
        <TermLine
          label="Contract inherited"
          value={p.inheritedAav === null
            ? 'None on record'
            : `${money(p.inheritedAav)} a year · ${String(p.inheritedYears ?? 1)} yr`}
        />
        <TermLine
          label="Cap space after"
          value={p.inheritedAav === null ? '—' : money(out.capSpace - p.inheritedAav)}
          tone={affordable ? 'default' : 'bad'}
        />
        <TermLine
          label="Roster after"
          value={`${String(out.rosterCount + 1)}/${String(out.rosterLimit)}`}
          tone={room ? 'default' : 'bad'}
        />
        <TermLine
          label="Your priority"
          value={out.priority === null ? 'Not set' : `${ordinal(out.priority)} of ${String(out.clubs)}`}
        />
        <TermLine label="Claims in" value={String(p.claims)} />
        <TermLine label="Settled" value={`Top of week ${String(p.deadlineWeek)}`} tone="warn" />
      </div>

      {/* Why the button is off, where it is off. A disabled control with no
          sentence beside it is a shrug. */}
      {!canClaim && (
        <p
          data-testid="claim-blocked"
          style={{ ...TYPE.prose, margin: `0 0 ${String(S[2])}px`, color: COLOR.amber }}
        >
          {!room
            ? `The roster is full at ${String(out.rosterLimit)}. Release a player and the claim is yours to make.`
            : !affordable
              ? `His deal is ${money(p.inheritedAav)} a year and there is ${money(out.capSpace)} of room.`
              : 'This club has no waiver priority set for the season.'}
        </p>
      )}

      <div style={{ display: 'grid', gap: S[2] }}>
        {p.claimed ? (
          <ActionButton
            tone="danger"
            disabled={busy}
            testId="withdraw-claim"
            onClick={onWithdraw}
          >
            Withdraw claim
          </ActionButton>
        ) : (
          <ActionButton disabled={busy || !canClaim} testId="submit-claim" onClick={onClaim}>
            Submit claim
          </ActionButton>
        )}
        <ActionButton tone="quiet" testId="waiver-profile" onClick={onProfile}>
          Full profile
        </ActionButton>
        {/* Passing is a real answer and is named as one, rather than being
            left as the thing that happens when you close the sheet. */}
        <ActionButton tone="quiet" testId="waiver-pass" onClick={onClose}>
          Pass for now
        </ActionButton>
      </div>
      {/* How many clubs are in, and not a chance of winning. Whether a claim
          wins turns on the other clubs' priorities, which this club has no way
          of knowing -- a percentage here would be a number invented to fill a
          space, and a manager would quite reasonably plan around it. */}
      <div style={{ marginTop: S[3] }}>
        <Caption>
          {p.claims === 0
            ? 'No club has claimed him yet.'
            : `${String(p.claims)} club${p.claims === 1 ? '' : 's'} in for him. `
              + 'The best waiver priority among them takes him; the rest are told.'}
        </Caption>
      </div>
    </Sheet>
  );
}
