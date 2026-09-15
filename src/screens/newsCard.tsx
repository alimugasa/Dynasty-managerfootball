// A story, as a card.
//
// The feed used to be a list of one-line rows, which is the right shape for
// the six headlines the Office shows and the wrong one for a tab. A tab is
// read, not skimmed: it wants the category, the week, the headline, enough of
// the body to know whether to open it, and -- the one thing a list of rows
// could never carry -- an obvious difference between what you have read and
// what you have not.
//
// Three accents, and they encode something rather than decorating. A story
// about the club you manage is edged in your own primary colour, falling back
// to gold when the club has none. A league story big enough to lead with is
// edged in blue -- a different hue, not a different brightness, because the
// question a reader is answering at a glance is "is this mine" and two shades
// of the same warm colour cannot answer it. Everything else is edged in the
// blue-grey the rest of the interface is built from.
//
// The first draft used amber for both, and a screen of twenty stories came out
// almost entirely amber: the accent stopped saying anything at all.

import { useState } from 'react';
import { COLOR, ELEV, MOTION, R, S, TYPE, tint } from '../app/tokens';
import { ActionButton } from '../components/ActionButton';
import { ChevronRightIcon } from '../components/icons';
import { actionFor } from './newsAction';
import type { FeedItem } from '../../supabase/functions/_shared/api/reads/news';

/** The one gold in the product, reused here rather than re-picked. It marks
 *  your own club and the unread dot, and nothing else on this screen. */
const GOLD = COLOR.amber;

/** Sentence case from a SCREAMING_SNAKE category, for reading rather than
 *  parsing. Lived in a shared module while the Office also printed a feed; it
 *  moved here when the Office stopped and this became its only caller. */
export const kindLabel = (category: string): string => {
  const words = category.toLowerCase().split('_');
  const [first = '', ...rest] = words;
  return [first.charAt(0).toUpperCase() + first.slice(1), ...rest].join(' ');
};

/** A story big enough that the league would lead with it. */
const MAJOR = 4;

/**
 * How bright a colour reads, 0-255, on the scale the eye actually uses.
 *
 * Needed because a kit colour is chosen to shout on a helmet under floodlights
 * and says nothing at all as three pixels on near-black ink. The club this was
 * first tested against plays in a navy that measures 31 against a panel that
 * measures 29: the accent was there, correct, and completely invisible.
 */
function brightness(hex: string): number | null {
  const n = hex.replace('#', '');
  const full = n.length === 3 ? n.split('').map((c) => c + c).join('') : n;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  return 0.299 * (r ?? 0) + 0.587 * (g ?? 0) + 0.114 * (b ?? 0);
}

/** Below this a colour is not separable from the panel behind it. The panel
 *  itself measures 29, so this is roughly "twice the ink and then some". */
const LEGIBLE = 70;

export interface Accent {
  readonly colour: string;
  /** Whether the card is edged and washed, or merely edged. Reserved for the
   *  club being managed and for the league's biggest stories, so that "most
   *  cards are quiet" stays true and the loud ones keep meaning something. */
  readonly strong: boolean;
}

/**
 * The club's own colour, if it is one that can be seen here.
 *
 * Primary first, then secondary, then gold. Half the league plays in a navy or
 * a black that is darker than this interface's own panels, and using it neat
 * would draw an accent nobody can see -- which is worse than not drawing one,
 * because the card then silently loses the only mark that says it is yours.
 * Gold is not a guess at the club's colour; it is the product's own accent,
 * standing in where the club's cannot be used.
 */
export function clubAccent(primary: string | null, secondary: string | null): string {
  for (const colour of [primary, secondary]) {
    if (colour === null) continue;
    const b = brightness(colour);
    if (b !== null && b >= LEGIBLE) return colour;
  }
  return GOLD;
}

/**
 * The colour down the left of a card.
 *
 * `teamColour` is what clubAccent() settled on for the club the story is
 * about, already checked for legibility against this ink.
 */
export function accentFor(
  item: FeedItem, userTeamId: string | null, teamColour: string | null,
): Accent {
  if (userTeamId !== null && item.teamId === userTeamId) {
    return { colour: teamColour ?? GOLD, strong: true };
  }
  if (item.importance >= MAJOR) return { colour: COLOR.blue, strong: true };
  return { colour: COLOR.line2, strong: false };
}

/** "Week 3 · Injury", or just the category before a season has a week. */
export function stampFor(item: FeedItem): string {
  const kind = kindLabel(item.category);
  return item.week === null ? kind : `Week ${String(item.week)} · ${kind}`;
}

/** The first line or so of the body, for a card that is closed. */
export function preview(body: string | null, limit = 96): string | null {
  if (body === null || body.trim() === '') return null;
  const text = body.trim();
  if (text.length <= limit) return text;
  // Cut on a word rather than mid-syllable; a preview that ends "the Ironme…"
  // reads as a rendering fault rather than as a summary.
  const cut = text.slice(0, limit);
  const space = cut.lastIndexOf(' ');
  return `${(space > limit * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

export function UnreadDot() {
  return (
    <span
      role="img"
      aria-label="Unread"
      data-testid="news-unread"
      style={{
        width: 8, height: 8, flexShrink: 0, borderRadius: R.pill,
        background: GOLD, boxShadow: `0 0 0 3px ${tint(GOLD, 0.18)}`,
      }}
    />
  );
}

export interface CardProps {
  readonly item: FeedItem;
  readonly userTeamId: string | null;
  readonly teamColour: string | null;
  /** Whether the reader has yet to open it.
   *
   *  Passed in rather than read off `item.readAt`, because the screen knows
   *  one thing the response does not: which cards have been tapped since it
   *  was fetched. Faking a timestamp into the item to carry that would put a
   *  value in a field that is supposed to mean "the server recorded this at
   *  that moment". */
  readonly unread: boolean;
  readonly expanded: boolean;
  readonly onToggle: () => void;
  /** Opens the story's destination. Called only for a story that has one. */
  readonly onOpen: (screen: string, params: Record<string, string>, root: boolean) => void;
}

export function NewsCard({
  item, userTeamId, teamColour, unread, expanded, onToggle, onOpen,
}: CardProps) {
  const [held, setHeld] = useState(false);
  const accent = accentFor(item, userTeamId, teamColour);
  const action = actionFor(item, userTeamId);
  const body = preview(item.body);

  return (
    <article
      data-testid="news-card"
      data-category={item.category}
      data-unread={unread ? 'true' : 'false'}
      style={{
        position: 'relative',
        borderRadius: R.md,
        overflow: 'hidden',
        background: accent.strong
          ? `linear-gradient(100deg, ${tint(accent.colour, 0.09)} 0%, ${COLOR.panel} 58%)`
          : COLOR.panel,
        border: `1px solid ${accent.strong ? tint(accent.colour, 0.3) : COLOR.line}`,
        boxShadow: expanded ? ELEV.mid : ELEV.low,
        transition: `box-shadow ${MOTION.base} ${MOTION.ease}`,
      }}
    >
      {/* The edge. Three pixels of the only thing on the card that is colour. */}
      <span
        aria-hidden="true"
        style={{
          position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
          background: accent.colour,
          opacity: accent.strong ? 1 : 0.55,
        }}
      />
      <button
        type="button"
        onClick={onToggle}
        onPointerDown={() => { setHeld(true); }}
        onPointerUp={() => { setHeld(false); }}
        onPointerLeave={() => { setHeld(false); }}
        onPointerCancel={() => { setHeld(false); }}
        aria-expanded={expanded}
        data-testid="news-card-toggle"
        style={{
          display: 'block', width: '100%', textAlign: 'left',
          background: held ? 'rgba(255,255,255,0.03)' : 'transparent',
          border: 'none', cursor: 'pointer', color: 'inherit',
          padding: `${String(S[3])}px ${String(S[3])}px ${String(S[3])}px ${String(S[3] + 3)}px`,
          transition: `background ${MOTION.fast} ${MOTION.ease}`,
        }}
      >
        {/* No category dot here, though the Office's one-line rows carry one.
            A dot earns its place on a row with no room to name the category;
            on a card that prints the word, it is a second small circle beside
            the unread one, in a colour close enough to be mistaken for it. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: S[2], marginBottom: S[2] }}>
          <span style={{ ...TYPE.micro, color: COLOR.mut, flex: 1, minWidth: 0 }}>
            {stampFor(item)}
          </span>
          {/* Read state sits at the end of the stamp line rather than beside
              the headline, so a long headline never pushes it off the card. */}
          {unread && <UnreadDot />}
          <span
            aria-hidden="true"
            style={{
              display: 'flex', color: COLOR.dim,
              transform: expanded ? 'rotate(90deg)' : 'none',
              transition: `transform ${MOTION.base} ${MOTION.ease}`,
            }}
          >
            <ChevronRightIcon />
          </span>
        </div>

        <h3
          style={{
            ...TYPE.body,
            margin: 0,
            fontSize: 15,
            fontWeight: unread ? 650 : 500,
            color: COLOR.tx,
            textWrap: 'balance',
          }}
        >
          {item.headline}
        </h3>

        {body !== null && (
          <p
            data-testid={expanded ? 'news-body-full' : 'news-body-preview'}
            style={{ ...TYPE.prose, margin: `${String(S[2])}px 0 0`, color: COLOR.mut }}
          >
            {expanded ? item.body : body}
          </p>
        )}

        {/* Only once it is open: which club it is about, and who it named.
            On a closed card this is noise; open, it is the context the body
            assumes you have. */}
        {expanded && (item.teamName !== null || item.playerName !== null) && (
          <p style={{ ...TYPE.micro, margin: `${String(S[2])}px 0 0`, color: COLOR.dim }}>
            {[item.teamName, item.playerName].filter((v) => v !== null).join(' · ')}
          </p>
        )}
      </button>

      {/* No destination, no button. The one rule this feed is built on. */}
      {expanded && action !== null && (
        <div style={{ padding: `0 ${String(S[3])}px ${String(S[3])}px ${String(S[3] + 3)}px` }}>
          <ActionButton
            tone="quiet"
            compact
            testId="news-action"
            onClick={() => { onOpen(action.screen, action.params, action.root); }}
          >
            {action.label}
          </ActionButton>
        </div>
      )}
    </article>
  );
}
