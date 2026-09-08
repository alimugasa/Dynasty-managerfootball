// Staff: the people who coach the club you manage.
//
// Every number here is the engine's own: the play-calling that decides third
// and four, the development rating that decides how fast your young players
// grow, the evaluation that sets how well your club reads a draft class.

import { COLOR } from '../app/tokens';
import { useSave } from '../app/SaveProvider';
import { useQuery } from '../hooks/useQuery';
import { Caption, EmptyState, Panel, SectionHeader } from '../components/Surface';
import { ListRow } from '../components/ListRow';
import { StatTiles } from '../components/StatTiles';
import { Loading, NoDynasty, QueryError } from '../components/QueryState';
import { Screen } from './Screen';
import type { CoachOut, StaffOut } from '../../supabase/functions/_shared/api/reads/staff';

const ordinal = (n: number): string => {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${String(n)}th`;
  return `${String(n)}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
};

/** What a rating means, in words, so the number is not the only signal. */
const band = (value: number | null): string => {
  if (value === null) return 'not rated';
  if (value >= 85) return 'elite';
  if (value >= 72) return 'strong';
  if (value >= 58) return 'solid';
  if (value >= 45) return 'limited';
  return 'poor';
};

const SEAT = (hotSeat: number | null): string | null => {
  if (hotSeat === null) return null;
  if (hotSeat >= 70) return 'On the hot seat';
  if (hotSeat >= 45) return 'Under pressure';
  return null;
};

export function StaffScreen() {
  const { save, loaded, loadError, clubsById, version } = useSave();
  const q = useQuery<StaffOut>('staff', { saveId: save?.saveId ?? '' }, version, save !== null);
  const club = save === null ? undefined : clubsById.get(save.userTeamId);

  return (
    <Screen title="Staff" subtitle={club?.name ?? ''} screen="staff">
      {loadError !== null && <QueryError error={loadError} />}
      {loaded && save === null && <NoDynasty />}
      {save !== null && q.status === 'error' && <QueryError error={q.error} />}
      {save !== null && q.status === 'loading' && <Loading label="Loading the staff" rows={6} />}
      {q.status === 'ready' && q.data.coaches.length === 0 && (
        <EmptyState
          title="No staff on record"
          detail="This dynasty was started before coaching staffs existed. The next offseason hires one."
        />
      )}
      {q.status === 'ready' && q.data.coaches.length > 0 && (
        <>
          <StatTiles
            stats={[
              { label: 'Staff rating', value: q.data.rating === null ? '—' : String(q.data.rating) },
              {
                label: 'In the league',
                value: q.data.rank === null ? '—' : `${ordinal(q.data.rank)} of ${String(q.data.clubs)}`,
                ...(q.data.rank !== null && q.data.rank <= 10 ? { tone: 'positive' as const } : {}),
                ...(q.data.rank !== null && q.data.rank > 22 ? { tone: 'negative' as const } : {}),
              },
              { label: 'Coaches', value: String(q.data.coaches.length) },
            ]}
          />

          <SectionHeader title="The room" />
          <Panel padded={false}>
            <div style={{ padding: '0 12px' }} data-testid="staff-list">
              {q.data.coaches.slice(0, 4).map((c) => <CoachRow key={c.coachId} coach={c} />)}
            </div>
          </Panel>

          {q.data.coaches.length > 4 && (
            <>
              <SectionHeader title="Position coaches" />
              <Panel padded={false}>
                <div style={{ padding: '0 12px' }}>
                  {q.data.coaches.slice(4).map((c) => (
                    <ListRow
                      key={c.coachId}
                      title={c.name}
                      subtitle={`${c.role}${c.age === null ? '' : ` · age ${String(c.age)}`}`}
                      trailing={<Caption>{c.overall === null ? '—' : String(c.overall)}</Caption>}
                    />
                  ))}
                </div>
              </Panel>
            </>
          )}
        </>
      )}
    </Screen>
  );
}

function CoachRow({ coach }: { readonly coach: CoachOut }) {
  const seat = SEAT(coach.hotSeat);
  const detail = coach.role === 'Head Coach'
    ? `Game management ${band(coach.playCalling)} · develops ${band(coach.development)}`
    : coach.role === 'Offensive Coordinator'
      ? `Calls the plays · ${band(coach.playCalling)}`
      : `Develops ${band(coach.development)} · evaluates ${band(coach.evaluation)}`;
  return (
    <ListRow
      title={
        <span>
          {coach.name}
          {seat !== null && (
            <span style={{ color: COLOR.red, fontSize: 11, marginLeft: 8 }}>{seat.toUpperCase()}</span>
          )}
        </span>
      }
      subtitle={`${coach.role} · ${coach.yearsWithTeam === null ? 'first year' : `${String(coach.yearsWithTeam)} yr${coach.yearsWithTeam === 1 ? '' : 's'} here`}${coach.experience === null ? '' : ` · ${String(coach.experience)} coaching`}`}
      trailing={
        <span style={{ textAlign: 'right' }}>
          <span style={{ color: COLOR.tx, fontSize: 14, display: 'block' }}>
            {coach.overall === null ? '—' : coach.overall}
          </span>
          <span style={{ color: COLOR.mut, fontSize: 10 }}>{detail.split(' · ')[0]}</span>
        </span>
      }
    />
  );
}
