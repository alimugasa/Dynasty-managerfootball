// Office: the executive job.
//
// Not the football -- that is Team -- and not the week, which is Play. This is
// the desk the owner rings: what the club is spending, who is on staff, what
// this dynasty has done so far, and the rules it is played under.
//
// The news feed used to live here as a band halfway down the screen. It moved
// to its own tab, because it is the one part of the product that changes every
// week and it was competing with the cap sheet for the same eye.
//
// Four of this tab's jobs -- owner goals, job security, facilities, direction
// -- do not exist in the simulation. They are named and marked rather than
// mocked up: see the note on NotBuilt in hubCards.tsx.

import { COLOR, S, TYPE } from '../app/tokens';
import { useNavigator } from '../app/navigation';
import { useSave } from '../app/SaveProvider';
import { useQuery } from '../hooks/useQuery';
import { Caption, EmptyState, Panel, SectionHeader } from '../components/Surface';
import { ListRow } from '../components/ListRow';
import { StatTiles } from '../components/StatTiles';
import { ActionButton } from '../components/ActionButton';
import { Loading, NoDynasty, QueryError } from '../components/QueryState';
import { HubCard, HubStack, NotBuilt } from './hubCards';
import { Screen } from './Screen';
import type { OfficeOut } from '../../supabase/functions/_shared/api/reads/office';

const money = (n: number) => `${(n / 1e6).toFixed(1)}M`;

export function OfficeScreen() {
  const nav = useNavigator();
  const { save, loaded, loadError, clubsById, version, leaveSave } = useSave();
  const q = useQuery<OfficeOut>('office', { saveId: save?.saveId ?? '' }, version, save !== null);

  return (
    <Screen
      title="Office"
      subtitle={save === null ? '' : `${save.gmName ?? 'General manager'} · ${String(save.season)}`}
      screen="office"
    >
      {loadError !== null && <QueryError error={loadError} />}
      {loaded && save === null && <NoDynasty />}
      {save !== null && q.status === 'error' && <QueryError error={q.error} onRetry={q.retry} />}
      {save !== null && q.status === 'loading' && <Loading label="Loading office" rows={8} />}
      {save !== null && q.status === 'ready' && (
        <>
          <SectionHeader title="Finances" />
          {q.data.cap === null ? (
            <EmptyState title="No cap sheet for this season" />
          ) : (
            <StatTiles
              stats={[
                { label: 'Cap', value: money(q.data.cap.capLimit) },
                {
                  label: 'Committed',
                  value: money(q.data.cap.committed),
                  // How much of the cap is spent is the actual question; the
                  // meter answers it without arithmetic. Guarded because a cap
                  // of zero would be a divide by zero, not a full bar.
                  ...(q.data.cap.capLimit > 0
                    ? { fill: q.data.cap.committed / q.data.cap.capLimit }
                    : {}),
                },
                {
                  label: 'Space',
                  value: money(q.data.cap.available),
                  tone: q.data.cap.available < 0 ? 'negative' : 'positive',
                },
              ]}
            />
          )}

          <SectionHeader title="The front office" />
          <HubStack>
            <HubCard
              title="Coaching staff"
              detail="Who calls the plays and develops your players"
              onSelect={() => { nav.push('staff'); }}
              testId="to-staff"
            />
            <HubCard
              title="Season recap"
              detail="Champions, awards, all-league, the record book"
              onSelect={() => { nav.push('recap'); }}
              testId="to-recap"
            />
            <HubCard
              title="Franchise rules"
              detail="The difficulty and the eight settings this save is played under"
              onSelect={() => { nav.push('rules'); }}
              testId="to-rules"
            />
            <NotBuilt
              title="Owner goals"
              detail="What the owner has asked of you this season, and where you stand
                against it."
              testId="soon-goals"
            />
            <NotBuilt
              title="Job security"
              detail="How safe the chair is, and what would change that."
              testId="soon-job"
            />
            <NotBuilt
              title="Facilities"
              detail="The stadium, the training ground, and what investing in either buys."
              testId="soon-facilities"
            />
            <NotBuilt
              title="Franchise direction"
              detail="Whether this club is building, competing or rebuilding, and who is
                told about it."
              testId="soon-direction"
            />
          </HubStack>

          <SectionHeader title="Dynasty history" />
          {q.data.history.length === 0 ? (
            <EmptyState title="No completed seasons yet" />
          ) : (
            <Panel padded={false}>
              <div style={{ padding: `0 ${String(S[3])}px` }} data-testid="history-list">
                {q.data.history.map((h) => (
                  <ListRow
                    key={h.season}
                    title={String(h.season)}
                    subtitle={clubsById.get(save.userTeamId)?.name ?? save.userTeamId}
                    trailing={<Caption>{`${String(h.wins)}-${String(h.losses)}${h.ties > 0 ? `-${String(h.ties)}` : ''}`}</Caption>}
                  />
                ))}
              </div>
            </Panel>
          )}

          <div style={{ marginTop: S[5] }}>
            <ActionButton
              onClick={() => { leaveSave(); }}
              tone="quiet"
              testId="to-menu"
            >
              Main menu
            </ActionButton>
            <p style={{ ...TYPE.prose, margin: `${String(S[2])}px 0 0`, color: COLOR.dim, fontSize: 12 }}>
              Closes this dynasty and returns to the save files. Nothing is deleted; the
              server keeps it exactly where you left it.
            </p>
          </div>
        </>
      )}
    </Screen>
  );
}
