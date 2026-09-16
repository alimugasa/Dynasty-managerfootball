// /dev/bare -- the face-only test, on its own page.
//
// Twenty players, bald, clean-shaven, in one shirt under one light. It is the
// test that decides the whole system, because everything else a portrait shows
// -- a hairline, a beard, a collar -- is a costume. Strip the costumes and
// either twenty different men are left or one man is, and no amount of hair
// will fix the second case.
//
// It already existed at the bottom of the Avatar Lab. It is here on its own so
// it can be looked at at a size where the answer is actually legible, and so
// the numbers underneath each face make the claim falsifiable rather than a
// matter of taste.

import { useMemo } from 'react';
import { COLOR, FONT, R, TYPE } from '../app/tokens';
import { Portrait, find, spread, type Subject } from './labParts';
import {
  MAX_DISTANCE, NEAR_DUPLICATE, distance, signature,
} from '../../supabase/functions/_shared/avatar/unique';
import { skinBand } from '../../supabase/functions/_shared/avatar/skin';
import { structureFamily } from '../avatar/hybrid/select';
import { describe } from '../avatar/v2/descriptor';

const SIZE = 230;
const SHIRT = '#232B33';

interface Scored {
  readonly subject: Subject;
  readonly family: string;
  readonly nearest: number;
}

export function BareTwenty() {
  const men = useMemo(() => find('bare-twenty', 20, () => true, spread), []);

  const scored = useMemo<readonly Scored[]>(() => men.map((subject, i) => {
    let nearest = MAX_DISTANCE;
    for (let k = 0; k < men.length; k += 1) {
      if (k === i) continue;
      const other = men[k] as Subject;
      nearest = Math.min(nearest, distance(subject.profile.identity, other.profile.identity));
    }
    return {
      subject,
      family: structureFamily(describe(subject.profile).geometry),
      nearest,
    };
  }), [men]);

  const distinct = new Set(men.map((s) => signature(s.profile.identity))).size;
  const families = new Set(scored.map((s) => s.family)).size;
  const closest = scored.reduce((m, s) => Math.min(m, s.nearest), MAX_DISTANCE);

  return (
    /* Out of the app shell's 520px column on purpose. The test is a
       side-by-side, and twenty faces two to a row is twenty faces you cannot
       actually compare. Breaking out with a negative margin rather than fixed
       positioning keeps the page in normal flow, so it still scrolls and still
       captures whole. */
    <div style={{
      width: '100vw', marginLeft: 'calc(50% - 50vw)',
      padding: 20, background: COLOR.ink, minHeight: '100vh', boxSizing: 'border-box',
    }}
    >
      <h1 style={{ ...TYPE.display, color: COLOR.tx, margin: 0 }}>Twenty bald men</h1>
      <p style={{ ...TYPE.prose, color: COLOR.mut, maxWidth: 680, margin: '8px 0 0' }}>
        No hair, no facial hair, no accessories, one shirt, one light. Nothing here is
        carrying identity except the face itself.
      </p>
      <p style={{ ...TYPE.prose, color: COLOR.mut, maxWidth: 680, margin: '8px 0 14px' }}>
        Drawn by the renderer currently wired into the game. That renderer&rsquo;s art style
        has already been rejected, and this page does not change it &mdash; it exists to
        separate the two questions the test actually asks. <b style={{ color: COLOR.tx }}>Are
        these twenty different people?</b> is answered by the numbers below and by the
        generator. <b style={{ color: COLOR.tx }}>Do they look like people?</b> is answered by
        the pictures, and the answer is still no until there is artwork.
      </p>

      <div
        style={{
          display: 'flex', gap: 18, flexWrap: 'wrap', padding: '10px 14px',
          background: COLOR.panel, border: `1px solid ${COLOR.line}`, borderRadius: R.md,
          marginBottom: 18, ...TYPE.micro, color: COLOR.mut,
        }}
        data-testid="bare-stats"
      >
        <span>{`${String(distinct)} of 20 distinct structural signatures`}</span>
        <span>{`${String(families)} of 12 structure families`}</span>
        <span style={{ color: closest < NEAR_DUPLICATE ? COLOR.red : COLOR.teal }}>
          {`closest pair ${String(closest)} of ${String(MAX_DISTANCE)} (near-duplicate below ${String(NEAR_DUPLICATE)})`}
        </span>
      </div>

      <div
        style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}
        data-testid="bare-twenty"
      >
        {scored.map(({ subject, family, nearest }, i) => (
          <figure key={subject.profile.seed} style={{ width: SIZE, margin: 0 }}>
            <Portrait subject={subject} size={SIZE} bare shirt={SHIRT} />
            <figcaption style={{
              ...TYPE.micro, color: COLOR.dim, marginTop: 6, lineHeight: 1.5,
              fontFamily: FONT.display,
            }}
            >
              <div style={{ color: COLOR.mut }}>
                {`${String(i + 1).padStart(2, '0')} · ${subject.position} · ${String(subject.age)}`}
              </div>
              <div>
                {`${family} · ${skinBand(subject.profile.identity.skinStep)} `}
                {String(subject.profile.identity.skinStep)}
              </div>
              <div style={{ color: nearest < NEAR_DUPLICATE ? COLOR.red : COLOR.dim }}>
                {`nearest ${String(nearest)}`}
              </div>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
