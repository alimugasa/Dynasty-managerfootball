// The standings table, and the sorting and grouping both league panels use.
//
// Both are driven entirely by data handed to them -- the rows the league read
// returned, and the conference and division names the league itself carries.
// Nothing here decides an outcome: sorting reorders rows that are already
// facts, and splitting groups them by the group each row states it is in. A
// club's league position is the order the server sent, which is why "League
// order" is a sort field the reader can always come back to.
//
// Sorting is driven by the shared SortControl rather than by tappable column
// headers: the reason is in that component, and it applies to a standings table
// on a phone more than anywhere else.
//
// The play-test rig renders these same two panels from its in-page engine, so
// there is one implementation of the control, not two that drift.

import { useEffect, useRef, type ReactNode } from 'react';
import { COLOR, FONT, tint } from '../app/tokens';
import { type Chip } from '../components/ChipRow';
import { TableScroll } from '../components/TableScroll';
import { Caption, Panel } from '../components/Surface';
import { SortControl, type SortField } from '../components/SortControl';
import type { LeagueGroup, TableRow } from '../../supabase/functions/_shared/api/reads/league';

/** How the table is cut up. LEAGUE is one table of everyone. */
export const SPLITS = ['LEAGUE', 'CONFERENCE', 'DIVISION'] as const;
export type Split = (typeof SPLITS)[number];

export const SPLIT_CHIPS: readonly Chip[] = [
  { key: 'LEAGUE', label: 'League' },
  { key: 'CONFERENCE', label: 'Conference' },
  { key: 'DIVISION', label: 'Division' },
];

export type SortKey = 'TEAM' | 'PCT' | 'PLAYED' | 'FOR' | 'AGAINST' | 'DIFF' | 'STREAK' | 'SEED';

/** The league's own order: win percentage, then points difference. That is the
 *  standing; every other order is a view of it, which is why it is a field of
 *  its own rather than a hidden default. */
export const LEAGUE_ORDER = 'LEAGUE_ORDER';

export interface Sort {
  readonly key: SortKey | typeof LEAGUE_ORDER;
  readonly dir: 'asc' | 'desc';
}

export const DEFAULT_SORT: Sort = { key: LEAGUE_ORDER, dir: 'desc' };

const winPct = (r: TableRow): number =>
  r.played === 0 ? 0 : (r.wins + r.ties / 2) / r.played;

const diff = (r: TableRow): number => r.pointsFor - r.pointsAgainst;

/** The columns, in the order they are shown. `sortBy` returns the value the
 *  column is ordered on; a null seed sorts below every real seed either way.
 *
 *  The widths are fixed rather than content-driven because a split draws eight
 *  small tables, and eight tables that each size their own columns do not line
 *  up with one another. Fixed columns cost a little horizontal scroll on a
 *  narrow phone, which TableScroll absorbs; a ragged table cannot be read. */
const COLUMNS: readonly {
  readonly key: SortKey; readonly head: string; readonly title: string;
  readonly width: number;
  readonly sortBy: (r: TableRow) => number | string;
  readonly cell: (r: TableRow) => ReactNode;
  readonly tone?: (r: TableRow) => string;
}[] = [
  {
    key: 'TEAM', head: 'Team', title: 'Team', width: 98,
    sortBy: (r) => r.teamId, cell: () => null,
  },
  {
    key: 'PCT', head: 'W-L', title: 'Record', width: 40,
    sortBy: winPct,
    cell: (r) => `${String(r.wins)}-${String(r.losses)}${r.ties > 0 ? `-${String(r.ties)}` : ''}`,
  },
  { key: 'PLAYED', head: 'GP', title: 'Games played', width: 26, sortBy: (r) => r.played, cell: (r) => r.played },
  { key: 'FOR', head: 'PF', title: 'Points for', width: 34, sortBy: (r) => r.pointsFor, cell: (r) => r.pointsFor },
  { key: 'AGAINST', head: 'PA', title: 'Points against', width: 34, sortBy: (r) => r.pointsAgainst, cell: (r) => r.pointsAgainst },
  {
    key: 'DIFF', head: 'Diff', title: 'Points difference', width: 46,
    sortBy: diff,
    cell: (r) => (diff(r) > 0 ? `+${String(diff(r))}` : String(diff(r))),
    tone: (r) => (diff(r) > 0 ? COLOR.teal : diff(r) < 0 ? COLOR.red : COLOR.mut),
  },
  {
    key: 'STREAK', head: 'Strk', title: 'Current streak', width: 40,
    sortBy: (r) => r.streak,
    cell: (r) => (r.streak === 0 ? '—' : `${r.streak > 0 ? 'W' : 'L'}${String(Math.abs(r.streak))}`),
    tone: (r) => (r.streak > 0 ? COLOR.teal : r.streak < 0 ? COLOR.red : COLOR.dim),
  },
  {
    key: 'SEED', head: 'Sd', title: 'Playoff seed', width: 24,
    sortBy: (r) => r.seed ?? Number.NEGATIVE_INFINITY,
    cell: (r) => r.seed ?? '—',
    tone: (r) => (r.seed === null ? COLOR.dim : COLOR.amber),
  },
];

/** What the table needs to draw every column at its width. */
const TABLE_WIDTH = COLUMNS.reduce((total, c) => total + c.width, 0);

/** The fields the control offers, in the order it offers them. */
export const SORT_FIELDS: readonly SortField[] = [
  { key: LEAGUE_ORDER, label: 'League order', fixed: true },
  ...COLUMNS.map((c) => ({ key: c.key, label: c.title })),
];

/** Which way a field starts when it is chosen: a name reads A to Z, a number
 *  reads best first. Reversing is then one tap either way. */
export function sortFor(key: string): Sort {
  if (key === LEAGUE_ORDER) return DEFAULT_SORT;
  const column = COLUMNS.find((c) => c.key === key);
  if (column === undefined) return DEFAULT_SORT;
  return { key: column.key, dir: column.key === 'TEAM' ? 'asc' : 'desc' };
}

export const reverse = (sort: Sort): Sort =>
  (sort.key === LEAGUE_ORDER ? sort : { key: sort.key, dir: sort.dir === 'desc' ? 'asc' : 'desc' });

/** Stable: equal values keep the league's order between them, so applying the
 *  same sort twice gives the same rows in the same places. */
export function sortRows(rows: readonly TableRow[], sort: Sort): readonly TableRow[] {
  if (sort.key === LEAGUE_ORDER) return rows;
  const column = COLUMNS.find((c) => c.key === sort.key);
  if (column === undefined) return rows;
  const sign = sort.dir === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    const x = column.sortBy(a);
    const y = column.sortBy(b);
    if (typeof x === 'string' || typeof y === 'string') {
      const order = String(x).localeCompare(String(y));
      return order === 0 ? rows.indexOf(a) - rows.indexOf(b) : sign * order;
    }
    return x === y ? rows.indexOf(a) - rows.indexOf(b) : sign * (x - y);
  });
}

/** The groups a split cuts the table into, each with its rows in order. */
export function groupRows(
  rows: readonly TableRow[], split: Split,
  conferences: readonly LeagueGroup[], divisions: readonly LeagueGroup[],
): readonly { readonly id: string; readonly name: string; readonly rows: readonly TableRow[] }[] {
  if (split === 'LEAGUE') return [{ id: 'LEAGUE', name: '', rows }];
  const groups = split === 'CONFERENCE' ? conferences : divisions;
  const idOf = (r: TableRow): string => (split === 'CONFERENCE' ? r.conferenceId : r.divisionId);
  const named = groups.map((g) => ({ id: g.id, name: g.name, rows: rows.filter((r) => idOf(r) === g.id) }));
  // A row whose group the league did not name is shown under its own id rather
  // than dropped: a missing name is reported, not a reason to hide a club.
  const known = new Set(groups.map((g) => g.id));
  const orphans = [...new Set(rows.map(idOf))].filter((id) => !known.has(id))
    .map((id) => ({ id, name: id, rows: rows.filter((r) => idOf(r) === id) }));
  return [...named, ...orphans].filter((g) => g.rows.length > 0);
}

// box-sizing matters here: a table cell is content-box by default, so a width
// without this is a width plus padding, and eight of those overflow a phone.
const th = {
  textAlign: 'left' as const, color: COLOR.mut, fontSize: 11,
  whiteSpace: 'nowrap' as const, fontWeight: 500, boxSizing: 'border-box' as const,
};
const td = {
  color: COLOR.tx, fontSize: 13, padding: '6px 4px', boxSizing: 'border-box' as const,
  fontVariantNumeric: 'tabular-nums' as const,
  whiteSpace: 'nowrap' as const, overflow: 'hidden' as const, textOverflow: 'ellipsis' as const,
};

/** The team column stays put while the rest of the table scrolls under it. A
 *  row of numbers with no name against it is not a standing. */
const PINNED = {
  position: 'sticky' as const, left: 0, zIndex: 1,
  background: COLOR.panel, boxShadow: `1px 0 0 ${COLOR.line}`,
};

/** A column head. Not a control: the sort is the SortControl above the table.
 *  The active column is lit amber so the header and the control agree on
 *  screen; the direction is on the control, which has room for it. */
function Head({ label, title, width, active, dir, pinned = false }: {
  readonly label: string; readonly title: string; readonly width: number;
  readonly active: boolean; readonly dir: 'asc' | 'desc'; readonly pinned?: boolean;
}) {
  return (
    <th
      data-active-column={active ? 'true' : undefined}
      style={{
        ...th, ...(pinned ? PINNED : {}), width, padding: '6px 4px',
        letterSpacing: '0.05em', textTransform: 'uppercase', fontFamily: FONT.display,
        color: active ? COLOR.amber : COLOR.mut,
      }}
      scope="col"
      title={title}
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      {label}
    </th>
  );
}

interface StandingsProps {
  readonly rows: readonly TableRow[];
  readonly conferences: readonly LeagueGroup[];
  readonly divisions: readonly LeagueGroup[];
  readonly split: Split;
  readonly sort: Sort;
  readonly onSort: (sort: Sort) => void;
  readonly userTeamId: string;
  readonly nameOf: (teamId: string) => string;
  readonly onSelect?: (teamId: string) => void;
}

export function StandingsPanel({
  rows, conferences, divisions, split, sort, onSort, userTeamId, nameOf, onSelect,
}: StandingsProps) {
  const groups = groupRows(rows, split, conferences, divisions);
  const panel = useRef<HTMLDivElement>(null);

  // A table wider than a phone scrolls inside itself, so the column just sorted
  // on can be off the right edge -- which makes a sort look like it did
  // nothing. Bring it into view in each group's scroller when it changes.
  useEffect(() => {
    for (const head of panel.current?.querySelectorAll('[data-active-column]') ?? []) {
      const scroller = head.closest('.tscroll');
      if (scroller === null) continue;
      const cell = head.getBoundingClientRect();
      const box = scroller.getBoundingClientRect();
      if (cell.right > box.right) scroller.scrollLeft += cell.right - box.right + 8;
      else if (cell.left < box.left) scroller.scrollLeft -= box.left - cell.left + 8;
    }
  }, [sort.key, split, groups.length]);

  return (
    <>
      <div style={{ marginBottom: 8 }}>
        <SortControl
          fields={SORT_FIELDS}
          value={sort.key}
          direction={sort.dir}
          onField={(key) => { onSort(sortFor(key)); }}
          onReverse={() => { onSort(reverse(sort)); }}
          label="Sort the standings"
        />
      </div>
      <Panel padded={false}>
        {/* 8 rather than 12: the eight columns are sized so the whole table
            fits a 390px phone without scrolling, and the last four pixels of
            that come from here. */}
        <div ref={panel} style={{ padding: 8, display: 'grid', gap: 14 }}>
          {groups.map((group) => (
            <div key={group.id} style={{ minWidth: 0 }}>
              {group.name !== '' && (
                <div style={{ marginBottom: 4 }}><Caption>{group.name}</Caption></div>
              )}
              <TableScroll>
                <table
                  style={{
                    borderCollapse: 'collapse', tableLayout: 'fixed',
                    width: '100%', minWidth: TABLE_WIDTH,
                  }}
                >
                  <thead>
                    <tr>
                      {COLUMNS.map((c, i) => (
                        <Head
                          key={c.key}
                          label={c.head}
                          title={c.title}
                          width={c.width}
                          active={sort.key === c.key}
                          dir={sort.dir}
                          pinned={i === 0}
                        />
                      ))}
                    </tr>
                  </thead>
                  <tbody data-testid="standings-body">
                    {sortRows(group.rows, sort).map((r) => {
                      const mine = r.teamId === userTeamId;
                      return (
                      <tr
                        key={r.teamId}
                        style={{
                          borderTop: `1px solid ${COLOR.line}`,
                          // Your own row is lit rather than merely coloured.
                          // Finding yourself in a thirty-two row table is the
                          // one thing this screen is opened to do.
                          background: mine ? tint(COLOR.amber, 0.07) : 'transparent',
                        }}
                      >
                        <td
                          style={{
                            ...td, ...PINNED, width: COLUMNS[0]?.width,
                            color: mine ? COLOR.amber : COLOR.tx,
                            // The pinned cell has to be opaque or the columns
                            // scroll through it, so the row tint is painted
                            // into it rather than inherited.
                            ...(mine
                              ? {
                                background: `linear-gradient(${tint(COLOR.amber, 0.07)},`
                                  + ` ${tint(COLOR.amber, 0.07)}), ${COLOR.panel}`,
                                boxShadow: `inset 2px 0 0 ${COLOR.amber}, 1px 0 0 ${COLOR.line}`,
                              }
                              : {}),
                          }}
                        >
                          {onSelect === undefined ? nameOf(r.teamId) : (
                            <button
                              type="button"
                              onClick={() => { onSelect(r.teamId); }}
                              style={{
                                background: 'none', border: 0, padding: 0, font: 'inherit',
                                color: 'inherit', cursor: 'pointer', textAlign: 'left',
                              }}
                            >
                              {nameOf(r.teamId)}
                            </button>
                          )}
                          {r.divisionWinner && (
                            <span aria-label="division winner" title="Division winner" style={{ color: COLOR.amber }}> ★</span>
                          )}
                        </td>
                        {COLUMNS.slice(1).map((c) => (
                          <td key={c.key} style={{ ...td, width: c.width, color: c.tone === undefined ? COLOR.tx : c.tone(r) }}>
                            {c.cell(r)}
                          </td>
                        ))}
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </TableScroll>
            </div>
          ))}
        </div>
      </Panel>
    </>
  );
}

// The leaderboards live next door; re-exported so the league screen, the
// play-test rig and the tests keep one import for both panels.
export { LeadersPanel } from './leadersPanel';
