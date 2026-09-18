// The coaching staff, in the play-test build.
//
// The same numbers the engine reads on a Sunday: the play-caller's rating, the
// staff's development, how the room ranks against the other thirty-one.

import { COLOR } from '../../src/app/tokens';
import { Caption, EmptyState, Panel, SectionHeader } from '../../src/components/Surface';
import { ListRow } from '../../src/components/ListRow';
import { StatTiles } from '../../src/components/StatTiles';
import {
  ROLE_LABEL, staffOf, staffRating, type CareerCoach,
} from '../../supabase/functions/_shared/engine/offseason/coaches';
import { ordinal, type ScreenProps as Props } from './common';

const ORDER: readonly string[] = [
  'HEAD_COACH', 'OFFENSIVE_COORDINATOR', 'DEFENSIVE_COORDINATOR', 'SPECIAL_TEAMS',
];

const band = (value: number): string => {
  if (value >= 85) return 'elite';
  if (value >= 72) return 'strong';
  if (value >= 58) return 'solid';
  if (value >= 45) return 'limited';
  return 'poor';
};

export function StaffScreen({ game }: Props) {
  const staff = staffOf(game.league.coaches, game.userTeamId);
  if (staff.length === 0) {
    return (
      <EmptyState
        title="No staff on record"
        detail="This dynasty was started before coaching staffs existed."
      />
    );
  }
  const ranked = [...game.league.teamIds]
    .map((id) => ({ id, rating: staffRating(game.league.coaches, id) }))
    .sort((a, b) => b.rating - a.rating);
  const place = ranked.findIndex((r) => r.id === game.userTeamId) + 1;
  const rating = staffRating(game.league.coaches, game.userTeamId);
  const room = [...staff].sort((a, b) => {
    const at = (c: CareerCoach): number => {
      const i = ORDER.indexOf(c.role ?? '');
      return i === -1 ? ORDER.length : i;
    };
    return at(a) - at(b) || b.ability - a.ability;
  });

  return (
    <>
      <StatTiles stats={[
        { label: 'Staff rating', value: rating.toFixed(1) },
        { label: 'In the league', value: `${ordinal(place)} of ${String(ranked.length)}` },
        { label: 'Coaches', value: String(staff.length) },
      ]}
      />

      <SectionHeader title="The room" />
      <Panel padded={false}>
        <div style={{ padding: '0 12px' }}>
          {room.slice(0, 4).map((c) => (
            <ListRow
              key={c.id}
              title={
                <span>
                  {c.name}
                  {c.hotSeat >= 70 && (
                    <span style={{ color: COLOR.red, fontSize: 11, marginLeft: 8 }}>HOT SEAT</span>
                  )}
                </span>
              }
              subtitle={`${ROLE_LABEL[c.role ?? 'POSITION_COACH']} · ${String(Math.round(c.yearsWithTeam))} yr here · ${String(Math.round(c.experience))} coaching`}
              trailing={
                <span style={{ textAlign: 'right' }}>
                  <span style={{ color: COLOR.tx, fontSize: 14, display: 'block' }}>
                    {Math.round(c.ability)}
                  </span>
                  <span style={{ color: COLOR.mut, fontSize: 10 }}>
                    {c.role === 'OFFENSIVE_COORDINATOR' ? `calls ${band(c.playCalling)}` : `develops ${band(c.development)}`}
                  </span>
                </span>
              }
            />
          ))}
        </div>
      </Panel>

      <SectionHeader title="Position coaches" />
      <Panel padded={false}>
        <div style={{ padding: '0 12px' }}>
          {room.slice(4).map((c) => (
            <ListRow
              key={c.id}
              title={c.name}
              subtitle={`Position coach · age ${String(Math.round(c.age))}`}
              trailing={<Caption>{String(Math.round(c.ability))}</Caption>}
            />
          ))}
        </div>
      </Panel>
    </>
  );
}
