// A club on the scouting board.
//
// Bigger than a list row because this is the one screen where the club is the
// decision rather than a link to somewhere else. The name is the size of a
// heading, the market sits above it where an eye lands first, and the league
// placing is spelled out -- "Atlas North", not "AC · AC-N",
// which is two ids pretending to be a label.
//
// The right-hand side carries what a manager would ask next: how good the
// roster is, and what kind of job the club is. Both are measured on the server
// from the rows of the template world; a club whose measurements did not load
// shows a dash, never a zero.

import { useState } from 'react';
import { COLOR, FONT, MOTION, R, S, TYPE, tint } from '../app/tokens';
import { ChevronRightIcon } from '../components/icons';
import { TeamMark } from '../components/TeamMark';
import { divisionShort } from '../../supabase/functions/_shared/api/leaguePlacing';
import type { TeamProfile } from '../../supabase/functions/_shared/api/reads/teamProfiles';

/** Difficulty coloured by what it is telling you to expect. Amber is this
 *  app's "look here", so it marks the club that is ready to win now. */
const DIFFICULTY_TONE: Readonly<Record<string, string>> = {
  'Dynasty Ready': COLOR.amber,
  'Playoff Push': COLOR.teal,
  'Middle Class': COLOR.mut,
  Rebuild: COLOR.blue,
  'Hard Rebuild': COLOR.blue,
  'Cap Hell': COLOR.red,
};

export function TeamRow({ team, onSelect, last = false }: {
  readonly team: TeamProfile;
  readonly onSelect: () => void;
  /** The last row of the list drops its divider, so the panel does not end on
   *  a line that separates nothing from nothing. */
  readonly last?: boolean;
}) {
  const [held, setHeld] = useState(false);
  const tone = team.difficulty === null ? COLOR.dim : DIFFICULTY_TONE[team.difficulty] ?? COLOR.mut;

  return (
    <button
      type="button"
      onClick={onSelect}
      data-testid={`team-${team.teamId}`}
      onPointerDown={() => { setHeld(true); }}
      onPointerUp={() => { setHeld(false); }}
      onPointerLeave={() => { setHeld(false); }}
      onPointerCancel={() => { setHeld(false); }}
      style={{
        display: 'flex', alignItems: 'center', gap: S[3],
        width: '100%', minWidth: 0, boxSizing: 'border-box', textAlign: 'left',
        padding: `${String(S[3])}px 0`,
        background: held ? 'rgba(255,255,255,0.045)' : 'transparent',
        border: 0,
        borderBottom: last ? 'none' : `1px solid ${COLOR.line}`,
        borderRadius: held ? R.sm : 0,
        cursor: 'pointer',
        transition: `background-color ${MOTION.fast} ${MOTION.ease}`,
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <TeamMark
        abbreviation={team.abbreviation}
        primary={team.primary}
        secondary={team.secondary}
        size={40}
      />

      <span style={{ flex: 1, minWidth: 0, display: 'grid', gap: 1 }}>
        <span style={{ ...TYPE.micro, color: COLOR.dim, fontSize: 11 }}>
          {team.city}
        </span>
        {/* 17px, not 18: "Windjammers" is the longest nickname in the league
            and needs three more pixels than an 18px line has at 320, which is
            the width this shell promises to survive. A clipped club name on
            the screen where you pick a club is not a rounding error. */}
        <span
          style={{
            fontFamily: FONT.display, fontSize: 17, fontWeight: 600,
            letterSpacing: '0.01em', color: COLOR.tx,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >
          {team.teamName}
        </span>
        {/* The placing and the difficulty share the third line rather than
            standing in a right-hand column. The column cost this line about
            eighty pixels, and the full "Atlas Conference East" needs a hundred
            and sixty: a readable label that ellipsizes on twenty-seven of
            thirty-two rows is not a readable label. So this is the short form
            -- two words, no abbreviation to decode, and it fits. */}
        <span
          style={{
            display: 'flex', alignItems: 'center', flexWrap: 'wrap',
            gap: `2px ${String(S[2])}px`, marginTop: 2, minWidth: 0,
          }}
        >
          <span style={{ ...TYPE.prose, fontSize: 12, color: COLOR.mut, minWidth: 0 }}>
            {divisionShort(team)}
          </span>
          {team.difficulty !== null && (
            <span
              style={{
                ...TYPE.micro, fontSize: 10, color: tone,
                background: tint(tone, 0.12),
                border: `1px solid ${tint(tone, 0.4)}`,
                borderRadius: R.pill, padding: '2px 7px',
                whiteSpace: 'nowrap', flexShrink: 0,
              }}
            >
              {team.difficulty}
            </span>
          )}
        </span>
      </span>

      {/* The rating alone on the right: one figure, and the row's only reason
          to keep a fixed column. */}
      <span
        className="numeric"
        style={{
          flexShrink: 0,
          fontFamily: FONT.display, fontSize: 21, fontWeight: 600,
          lineHeight: 1, color: team.overall === null ? COLOR.dim : COLOR.tx,
        }}
      >
        {team.overall ?? '—'}
      </span>

      <span
        style={{
          color: held ? COLOR.mut : COLOR.dim, display: 'flex', flexShrink: 0,
          transition: `color ${MOTION.fast} ${MOTION.ease}`,
        }}
      >
        <ChevronRightIcon />
      </span>
    </button>
  );
}
