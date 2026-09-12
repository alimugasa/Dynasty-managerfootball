// Who the league honoured: two all-league teams and two all-star rosters.
//
// One panel, rendered identically by the awards ceremony and by the year in
// review, because they are the same list read at two moments and a reader who
// saw one and then the other would notice if they disagreed.
//
// Three selections, three different questions. The all-league first team is
// the best season at each position in the whole league; the second team is the
// next best. An all-star roster is picked inside a conference and is deeper --
// it is a roster for an exhibition rather than a team sheet -- so a player can
// be on one and on neither all-league team.

import { useState } from 'react';
import { COLOR, FONT, R, S, TYPE } from '../app/tokens';
import { ChipRow, type Chip } from '../components/ChipRow';
import { EmptyState, Panel, SectionHeader } from '../components/Surface';
import { ListRow } from '../components/ListRow';
import type { HonourOut } from '../../supabase/functions/_shared/api/reads/recap';

/** The roster every all-league team is picked by: the league, as one. */
const LEAGUE_WIDE = 'LEAGUE';

interface Props {
  readonly honours: readonly HonourOut[];
  /** A team id to a name the reader recognises. */
  readonly nickname: (teamId: string | null) => string;
  /** A conference id to its name, where the screen knows one. */
  readonly conferenceName?: (id: string) => string;
  readonly open: (screen: string, params: Record<string, string>) => void;
}

/** The position, set as a plate rather than as the front of a subtitle. A
 *  roster is read down the position column first and by name second, which is
 *  what an actual team sheet looks like. */
function Position({ code }: { readonly code: string }) {
  return (
    <span
      style={{
        minWidth: 34, flexShrink: 0, borderRadius: R.sm,
        padding: `3px ${String(S[1])}px`, textAlign: 'center',
        background: 'rgba(0,0,0,0.22)', border: `1px solid ${COLOR.line}`,
        ...TYPE.micro, fontSize: 10.5, color: COLOR.mut,
      }}
    >
      {code}
    </span>
  );
}

function Roster({
  rows, nickname, open, testId,
}: {
  readonly rows: readonly HonourOut[];
  readonly nickname: (teamId: string | null) => string;
  readonly open: (screen: string, params: Record<string, string>) => void;
  readonly testId: string;
}) {
  return (
    <Panel padded={false}>
      <div style={{ padding: '0 12px' }} data-testid={testId}>
        {rows.map((h) => (
          <ListRow
            key={`${h.unit}-${h.position}-${String(h.slot)}`}
            leading={<Position code={h.position} />}
            title={h.name}
            {...(h.teamId === null ? {} : { subtitle: nickname(h.teamId) })}
            navigable={h.playerId !== null}
            {...(h.playerId === null ? {} : {
              onSelect: () => { open('player', { id: h.playerId ?? '' }); },
            })}
          />
        ))}
      </div>
    </Panel>
  );
}

export function HonoursPanel({ honours, nickname, conferenceName, open }: Props) {
  const stars = honours.filter((h) => h.team === 'ALL_STAR');
  // The conferences in the order the league sent them, so the chips do not
  // reshuffle between seasons.
  const conferences = [...new Set(stars.map((h) => h.unit))];
  const [shown, setShown] = useState<string>('');
  const conference = conferences.includes(shown) ? shown : conferences[0] ?? '';
  const chips: readonly Chip[] = conferences.map((id) => ({
    key: id, label: conferenceName === undefined ? id : conferenceName(id),
  }));

  const team = (name: HonourOut['team']): readonly HonourOut[] =>
    honours.filter((h) => h.team === name && h.unit === LEAGUE_WIDE);
  const first = team('ALL_LEAGUE_FIRST');
  const second = team('ALL_LEAGUE_SECOND');

  return (
    <>
      <SectionHeader title="All-stars" />
      {stars.length === 0 ? (
        <EmptyState
          title="No all-stars this season"
          detail="The rosters are picked when the season is closed."
        />
      ) : (
        <>
          <p style={{ margin: '0 0 8px', color: COLOR.mut, fontSize: 12, lineHeight: 1.5 }}>
            Each conference picks its own roster for the all-star game.
          </p>
          {chips.length > 1 && (
            <div style={{ marginBottom: 8 }}>
              <ChipRow chips={chips} value={conference} onChange={setShown} label="Conference" />
            </div>
          )}
          <Roster
            rows={stars.filter((h) => h.unit === conference)}
            nickname={nickname}
            open={open}
            testId="all-stars"
          />
          <p style={{ margin: '6px 2px 0', color: COLOR.dim, fontSize: 11 }}>
            {`${String(stars.filter((h) => h.unit === conference).length)} selected`}
          </p>
        </>
      )}

      <SectionHeader title="All-league first team" />
      {first.length === 0 ? (
        <EmptyState title="No all-league team this season" />
      ) : (
        <Roster rows={first} nickname={nickname} open={open} testId="all-league-first" />
      )}

      <SectionHeader title="All-league second team" />
      {second.length === 0 ? (
        <EmptyState
          title="No second team this season"
          detail="Seasons played before the second team was shown still have one on record."
        />
      ) : (
        <Roster rows={second} nickname={nickname} open={open} testId="all-league-second" />
      )}
      <p style={{ margin: '6px 2px 0', color: COLOR.dim, fontSize: 11, lineHeight: 1.5 }}>
        <span style={{ fontFamily: FONT.display, letterSpacing: '0.05em' }}>
          The all-league teams are the best season at each position in the league.
        </span>
        {' '}
        An all-star roster is picked inside a conference and carries substitutes, so the
        two lists are not the same list.
      </p>
    </>
  );
}
