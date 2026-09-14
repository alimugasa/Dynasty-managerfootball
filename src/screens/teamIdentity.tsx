// The club, as its own front door.
//
// The one place on the screen where a franchise gets to look like a franchise:
// its two kit colours washed across the card, its badge at a size you can see,
// and an accent rule drawn from the same two colours along the top edge. Thirty
// two clubs ship two colours each, and a card that used them only in a 40px
// badge would be thirty-two identical cards.
//
// The difficulty sits under the name at a size that can be read across a room,
// because it is the single fact this whole screen exists to deliver: before a
// manager reads a rating, he wants to know whether he is being handed a
// contender or a wreck.

import { COLOR, ELEV, FONT, R, S, TYPE, colourWash, tint } from '../app/tokens';
import { SkeletonCircle, SkeletonLine } from '../components/Skeleton';
import { TeamMark } from '../components/TeamMark';
import { divisionFull } from '../../supabase/functions/_shared/api/leaguePlacing';
import type { TeamProfile } from '../../supabase/functions/_shared/api/reads/teamProfiles';

/** Difficulty coloured by what it is telling you to expect. Amber is this
 *  app's "look here", so it marks the club that is ready to win now. */
export const DIFFICULTY_TONE: Readonly<Record<string, string>> = {
  'Dynasty Ready': COLOR.amber,
  'Playoff Push': COLOR.teal,
  'Middle Class': COLOR.mut,
  Rebuild: COLOR.blue,
  'Hard Rebuild': COLOR.blue,
  'Cap Hell': COLOR.red,
};

export const difficultyTone = (difficulty: string | null): string =>
  (difficulty === null ? COLOR.dim : DIFFICULTY_TONE[difficulty] ?? COLOR.mut);

/** The shell both the card and its skeleton sit in, so the screen does not
 *  change shape when the data lands. */
function Card({ children, accent }: {
  readonly children: React.ReactNode;
  readonly accent?: string;
}) {
  return (
    <section
      style={{
        position: 'relative', overflow: 'hidden',
        background: COLOR.panel,
        backgroundImage: accent,
        border: `1px solid ${COLOR.line2}`,
        borderRadius: R.lg,
        boxShadow: ELEV.high,
        padding: `${String(S[5])}px ${String(S[4])}px ${String(S[4])}px`,
        marginTop: S[1], minWidth: 0,
      }}
    >
      {children}
    </section>
  );
}

/** The club's two colours as a rule along the top edge. Three pixels, and the
 *  only place on the screen where a kit colour is used at full strength. */
function AccentLine({ primary, secondary }: {
  readonly primary: string;
  readonly secondary: string;
}) {
  return (
    <span
      aria-hidden="true"
      style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 3,
        background: `linear-gradient(90deg, ${primary} 0%, ${secondary} 62%, transparent 100%)`,
      }}
    />
  );
}

export function TeamIdentity({ team }: { readonly team: TeamProfile }) {
  const tone = difficultyTone(team.difficulty);
  return (
    <Card
      accent={`${colourWash(team.primary, team.secondary)}, linear-gradient(180deg, ${tint(COLOR.raise, 0.9)} 0%, ${COLOR.panel} 100%)`}
    >
      <AccentLine primary={team.primary} secondary={team.secondary} />

      <div style={{ display: 'flex', alignItems: 'center', gap: S[4], minWidth: 0 }}>
        <TeamMark
          abbreviation={team.abbreviation}
          primary={team.primary}
          secondary={team.secondary}
          size={62}
        />
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ ...TYPE.micro, margin: 0, color: COLOR.mut, fontSize: 10.5 }}>
            {team.city} · {team.abbreviation}
          </p>
          <h2
            data-testid="preview-name"
            style={{
              margin: '2px 0 0', fontFamily: FONT.display, fontSize: 28, fontWeight: 700,
              letterSpacing: '0.01em', lineHeight: 1.05, color: COLOR.tx,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          >
            {team.teamName}
          </h2>
          <p style={{ ...TYPE.prose, margin: '3px 0 0', color: COLOR.mut, fontSize: 11.5 }}>
            {divisionFull(team)}
          </p>
        </div>
      </div>

      <div
        style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: S[2],
          marginTop: S[4], paddingTop: S[3],
          borderTop: `1px solid ${tint(COLOR.line2, 0.7)}`,
        }}
      >
        {team.difficulty !== null && (
          <span
            data-testid="preview-difficulty"
            style={{
              ...TYPE.heading, fontSize: 14, color: tone,
              background: tint(tone, 0.13),
              border: `1px solid ${tint(tone, 0.5)}`,
              borderRadius: R.pill, padding: `5px ${String(S[3])}px`,
              whiteSpace: 'nowrap',
            }}
          >
            {team.difficulty}
          </span>
        )}
        {team.rosterTimeline !== null && (
          <span
            data-testid="preview-timeline"
            style={{
              ...TYPE.micro, fontSize: 10, color: COLOR.mut,
              background: 'rgba(0,0,0,0.22)',
              border: `1px solid ${COLOR.line2}`,
              borderRadius: R.pill, padding: `5px ${String(S[3])}px`,
              whiteSpace: 'nowrap',
            }}
          >
            {team.rosterTimeline}
          </span>
        )}
        {team.archetype !== null && (
          <span
            style={{
              ...TYPE.micro, fontSize: 10, color: COLOR.mut,
              background: 'rgba(0,0,0,0.22)',
              border: `1px solid ${COLOR.line2}`,
              borderRadius: R.pill, padding: `5px ${String(S[3])}px`,
              whiteSpace: 'nowrap',
            }}
          >
            {team.archetype}
          </span>
        )}
      </div>
    </Card>
  );
}

export function TeamIdentitySkeleton() {
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: S[4] }}>
        <SkeletonCircle size={62} />
        <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: 8 }}>
          <SkeletonLine width="38%" height={9} />
          <SkeletonLine width="66%" height={24} />
          <SkeletonLine width="52%" height={10} />
        </div>
      </div>
      <div
        style={{
          display: 'flex', gap: S[2], marginTop: S[4], paddingTop: S[3],
          borderTop: `1px solid ${tint(COLOR.line2, 0.7)}`,
        }}
      >
        <SkeletonLine width={112} height={26} radius={999} />
        <SkeletonLine width={84} height={26} radius={999} />
      </div>
    </Card>
  );
}
