// The leaderboards.
//
// One board at a time, chosen with two chip rows: which side of the ball, then
// which statistic. Every row is a fact the league read returned; nothing here
// ranks anything, it renders the order the server already put the rows in.
//
// The rank column is set in the display face at a fixed width so the numbers
// stack, and the top three carry amber. On a board of twenty that is the
// difference between a list and a leaderboard.

import { COLOR, FONT, R, S, tint } from '../app/tokens';
import { ChipRow } from '../components/ChipRow';
import { EmptyState, Panel } from '../components/Surface';
import { ListRow } from '../components/ListRow';
import type { LeaderBoard } from '../../supabase/functions/_shared/api/reads/league';

/** Where a player sits on this board. The podium is amber; everyone else is
 *  a quiet grey, because twenty bright numbers rank nothing. */
function Rank({ n }: { readonly n: number }) {
  const podium = n <= 3;
  return (
    <span
      className="numeric"
      style={{
        width: 24, height: 24, flexShrink: 0, borderRadius: R.sm,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: FONT.display, fontSize: 13, fontWeight: 700,
        color: podium ? COLOR.amber : COLOR.dim,
        background: podium ? tint(COLOR.amber, 0.12) : 'transparent',
      }}
    >
      {n}
    </span>
  );
}

interface LeadersProps {
  readonly boards: readonly LeaderBoard[];
  /** The board being shown. An unknown key shows the first board there is. */
  readonly boardKey: string;
  readonly onBoard: (key: string) => void;
  readonly side: string;
  readonly onSide: (side: string) => void;
  readonly nameOf: (teamId: string) => string;
  readonly onSelect?: (playerId: string) => void;
}

export function LeadersPanel({
  boards, boardKey, onBoard, side, onSide, nameOf, onSelect,
}: LeadersProps) {
  const sides = [...new Set(boards.map((b) => b.side))];
  const shownSide = sides.includes(side as LeaderBoard['side']) ? side : sides[0];
  const inSide = boards.filter((b) => b.side === shownSide);
  const board = inSide.find((b) => b.key === boardKey) ?? inSide[0];

  if (board === undefined) {
    return <EmptyState title="No boards" detail="The league returned no leaderboards for this competition." />;
  }

  return (
    <>
      <div style={{ display: 'grid', gap: 6, marginBottom: S[2] }}>
        <ChipRow
          chips={sides.map((s) => ({ key: s, label: s }))}
          value={shownSide ?? ''}
          onChange={(next) => {
            onSide(next);
            const first = boards.find((b) => b.side === next);
            if (first !== undefined) onBoard(first.key);
          }}
          label="Side of the ball"
        />
        <ChipRow
          chips={inSide.map((b) => ({ key: b.key, label: b.label }))}
          value={board.key}
          onChange={onBoard}
          label="Leaderboard"
        />
      </div>
      <Panel padded={false}>
        <div style={{ padding: `0 ${String(S[3])}px` }} data-testid="leader-board">
          {board.rows.length === 0 ? (
            <EmptyState title={`No ${board.label.toLowerCase()} yet`} detail="Nobody has recorded one in this competition." />
          ) : board.rows.map((row, i) => (
            <ListRow
              key={row.playerId}
              leading={<Rank n={i + 1} />}
              title={row.name}
              subtitle={`${row.group} · ${nameOf(row.teamId)} · ${String(row.games)} gp`}
              trailing={(
                <span style={{ flexShrink: 0, textAlign: 'right' }}>
                  <span
                    className="numeric"
                    style={{ fontFamily: FONT.display, fontSize: 18, fontWeight: 600, color: COLOR.tx }}
                  >
                    {row.value}
                  </span>
                  <span
                    style={{
                      fontFamily: FONT.display, fontSize: 10, letterSpacing: '0.09em',
                      textTransform: 'uppercase', color: COLOR.mut, marginLeft: 4,
                    }}
                  >
                    {board.unit}
                  </span>
                </span>
              )}
              navigable={onSelect !== undefined}
              {...(onSelect === undefined ? {} : { onSelect: () => { onSelect(row.playerId); } })}
            />
          ))}
        </div>
      </Panel>
    </>
  );
}
