// What the three quiet actions on the main menu open.
//
// Presentational only, and shared with the play-test rig, because the menu is
// shared: a button that goes somewhere in one build and nowhere in the other
// is the drift this file exists to prevent.
//
// Two of these are honest placeholders. Settings has nothing to set yet and
// says so; it does not show switches that do nothing, because a control that
// lies about being a control is worse than an empty screen (ARCHITECTURE.md
// rule 3 applies to function as much as to data). Database Tools shows only
// what the build actually knows -- the caller passes the facts in.

import type { ReactNode } from 'react';
import { COLOR, FONT, R, S, TYPE } from '../app/tokens';
import { Caption, EmptyState, Panel, SectionHeader } from '../components/Surface';
import { APP_VERSION } from '../app/version';

/** A line of small print under a heading. */
function Note({ children }: { readonly children: ReactNode }) {
  return (
    <p style={{ ...TYPE.prose, margin: `${String(S[1])}px 0 ${String(S[3])}px`, color: COLOR.mut }}>
      {children}
    </p>
  );
}

/** label: value, for facts rather than for controls. */
export interface Fact {
  readonly label: string;
  /** Null is rendered as a dash. A fact the build does not know is never
   *  filled in with a plausible one. */
  readonly value: string | null;
}

function FactRows({ facts }: { readonly facts: readonly Fact[] }) {
  return (
    <Panel padded={false}>
      <div style={{ padding: `${String(S[1])}px ${String(S[3])}px` }}>
        {facts.map((f, i) => (
          <div
            key={f.label}
            style={{
              display: 'flex', alignItems: 'baseline', gap: S[3],
              minHeight: 40, minWidth: 0,
              borderTop: i === 0 ? 'none' : `1px solid ${COLOR.line}`,
            }}
          >
            <span style={{ ...TYPE.micro, color: COLOR.mut, flexShrink: 0 }}>{f.label}</span>
            <span
              className="numeric"
              style={{
                // Capped so a long value ellipsizes instead of squeezing its own
                // label off the left of the row.
                marginLeft: 'auto', textAlign: 'right', minWidth: 0, maxWidth: '68%',
                fontFamily: FONT.display, fontSize: 14, fontWeight: 600,
                color: f.value === null ? COLOR.dim : COLOR.tx,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {f.value ?? '—'}
            </span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/**
 * Settings.
 *
 * There are none. Rather than ship a screen of switches that do nothing, this
 * says what is not built and what will live here, so the button is not a dead
 * end and the absence is not mistaken for a bug.
 */
export function SettingsPanel() {
  return (
    <>
      <Note>Nothing here is configurable yet.</Note>
      <EmptyState
        title="No settings in this build"
        detail="This screen is reachable so the menu has no dead ends, and empty because
          nothing has been made adjustable. A switch that does nothing would be worse."
      />
      <SectionHeader title="What will live here" />
      <Panel>
        <ul
          style={{
            ...TYPE.prose, margin: 0, paddingLeft: S[5], color: COLOR.mut,
            display: 'grid', gap: S[2],
          }}
        >
          <li>Simulation speed, and whether a week stops on your own result.</li>
          <li>Which figures the team screen leads with.</li>
          <li>Reduced motion, already honoured from the system setting.</li>
        </ul>
      </Panel>
    </>
  );
}

/**
 * Database tools.
 *
 * Whatever the build can truthfully say about where its dynasty is kept. The
 * app knows about a server and a save document; the play-test rig knows about
 * this browser's storage. Neither is described by this component -- both hand
 * it their own facts.
 */
export function DatabaseToolsPanel({
  facts, children,
}: {
  readonly facts: readonly Fact[];
  /** Anything the build can actually do here, rather than describe. */
  readonly children?: ReactNode;
}) {
  return (
    <>
      <Note>Where this dynasty is kept, and what state it is in.</Note>
      <SectionHeader title="Storage" />
      {facts.length === 0
        ? <EmptyState title="Nothing to report" detail="No dynasty is open." />
        : <FactRows facts={facts} />}
      {children}
    </>
  );
}

/**
 * Credits.
 *
 * Everything here is a fact about how the game was built, and the licence line
 * is the one that matters: the two typefaces are the only third-party assets
 * that ship, and both permit commercial embedding (docs/IP-POLICY.md).
 */
export function CreditsPanel() {
  return (
    <>
      <Note>Dynasty Manager Pro, build {APP_VERSION}.</Note>

      <SectionHeader title="The league" />
      <Panel>
        <p style={{ ...TYPE.prose, margin: 0, color: COLOR.mut }}>
          Every team, badge, player and coach in this game is invented. Names come from
          generators written for the project, badges are drawn in code from two colours
          and an abbreviation, and no real team, league, competition or honour is named
          anywhere in it. The rule is written down in <Mark>docs/IP-POLICY.md</Mark> and
          enforced by a denylist the build runs over every file.
        </p>
      </Panel>

      <SectionHeader title="Typefaces" />
      <Panel>
        <p style={{ ...TYPE.prose, margin: 0, color: COLOR.mut }}>
          <Mark>Barlow Condensed</Mark> carries headings and every figure;{' '}
          <Mark>Inter</Mark> carries body copy. Both are licensed under the SIL Open
          Font License, which permits commercial embedding.
        </p>
      </Panel>

      <SectionHeader title="Icons and art" />
      <Panel>
        <p style={{ ...TYPE.prose, margin: 0, color: COLOR.mut }}>
          Original, drawn in code on a 24-unit grid. No icon set is bundled and no
          artwork ships: the crests, the grade ramp and the field behind the main menu
          are all geometry.
        </p>
      </Panel>

      <SectionHeader title="The simulation" />
      <Panel>
        <p style={{ ...TYPE.prose, margin: 0, color: COLOR.mut }}>
          A pure, seeded engine: the same seed plays the same season every time, which
          is what makes a save file reopen into the game you left rather than a game
          that resembles it.
        </p>
        <div style={{ marginTop: S[3] }}>
          <Caption>Version {APP_VERSION}</Caption>
        </div>
      </Panel>
    </>
  );
}

/** A file name or a proper noun, set apart without shouting. */
function Mark({ children }: { readonly children: ReactNode }) {
  return (
    <span
      style={{
        color: COLOR.tx, background: 'rgba(255,255,255,0.04)',
        borderRadius: R.sm, padding: '1px 5px',
      }}
    >
      {children}
    </span>
  );
}
