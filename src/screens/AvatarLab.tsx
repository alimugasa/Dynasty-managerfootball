// The Avatar Lab.
//
// A development surface outside the navigation stack: it reads no save and
// writes nothing. Its job is to make a claim falsifiable -- that the generator
// produces people rather than one template with the dials moved -- by putting
// the hard cases next to each other where a person can look at them.
//
// The last section is the one that decides it. Strip the hair, the beard, the
// accessories and the shirt, light everybody identically, and put twenty faces
// in a row. If those twenty still look like one man, nothing above it matters.

import { useMemo, useState } from 'react';
import { COLOR, FONT, R, S, TYPE } from '../app/tokens';
import { Portrait, Row, Section, Traits, find, seedAt, spread, type Subject } from './labParts';
import { generateAvatar } from '../../supabase/functions/_shared/avatar/generate';
import { distance, signature } from '../../supabase/functions/_shared/avatar/unique';

const field: React.CSSProperties = {
  background: COLOR.panel, color: COLOR.tx, border: `1px solid ${COLOR.line}`,
  borderRadius: R.sm, padding: '6px 9px', fontSize: 13, fontFamily: FONT.ui,
  width: '100%', boxSizing: 'border-box',
};

const label: React.CSSProperties = {
  ...TYPE.micro, color: COLOR.mut, display: 'block', marginBottom: 4,
  textTransform: 'uppercase', letterSpacing: '.06em',
};

export function AvatarLab() {
  const [batch, setBatch] = useState('dynasty');
  const [traits, setTraits] = useState(true);

  /* Every section is derived once per batch. Generation is cheap; rasterising
     is not, and the Portrait component caches on the profile. */
  const league = useMemo(() => find(batch, 54, () => true, spread), [batch]);

  const deep = useMemo(
    () => find(`${batch}-deep`, 8, (s) => s.profile.identity.skinStep >= 4 && s.profile.identity.skinStep <= 10, spread),
    [batch],
  );
  const light = useMemo(
    () => find(`${batch}-light`, 8, (s) => s.profile.identity.skinStep >= 27 && s.profile.identity.skinStep <= 33, spread),
    [batch],
  );
  const mid = useMemo(
    () => find(`${batch}-mid`, 8, (s) => s.profile.identity.skinStep >= 15 && s.profile.identity.skinStep <= 20, spread),
    [batch],
  );
  const sameCut = useMemo(
    () => find(`${batch}-cut`, 8, (s) => s.profile.appearance.hairstyle.startsWith('fade'), spread),
    [batch],
  );
  const oneAncestry = useMemo(
    () => find(`${batch}-anc`, 8, (s) => s.profile.identity.ancestry.length === 1
      && s.profile.identity.ancestry[0] === 'african-american', spread),
    [batch],
  );
  const euro = useMemo(
    () => find(`${batch}-eu`, 8, (s) => s.profile.identity.ancestry.length === 1
      && s.profile.identity.ancestry[0] === 'western-european', spread),
    [batch],
  );
  const mixed = useMemo(
    () => find(`${batch}-mix`, 8, (s) => s.profile.identity.ancestry.length === 2, spread),
    [batch],
  );
  const builds = useMemo(() => {
    const want = ['CB', 'WR', 'QB', 'S', 'LB', 'TE', 'EDGE', 'C', 'DT', 'OG', 'OT', 'K'];
    return want.map((position, k) => {
      const seed = seedAt(`${batch}-build`, k * 13 + 3);
      return { profile: generateAvatar({ seed, position, age: 26 }), position, age: 26 };
    });
  }, [batch]);
  const career = useMemo(() => {
    const seed = seedAt(`${batch}-career`, 7);
    return [21, 25, 29, 33, 37].map((age) => ({
      profile: generateAvatar({ seed, position: 'LB', age }), position: 'LB', age,
    }));
  }, [batch]);

  /* The face-only test. */
  const bare = useMemo(() => find(`${batch}-bare`, 20, () => true, spread), [batch]);
  const bareStats = useMemo(() => {
    let closest = Number.POSITIVE_INFINITY;
    for (let a = 0; a < bare.length; a += 1) {
      for (let b = a + 1; b < bare.length; b += 1) {
        const d = distance(
          (bare[a] as Subject).profile.identity, (bare[b] as Subject).profile.identity,
        );
        if (d < closest) closest = d;
      }
    }
    return {
      distinct: new Set(bare.map((s) => signature(s.profile.identity))).size,
      closest: closest === Number.POSITIVE_INFINITY ? 0 : closest,
    };
  }, [bare]);

  return (
    <div style={{ padding: S[4], maxWidth: 1180, margin: '0 auto' }}>
      <h1 style={{
        fontFamily: FONT.display, color: COLOR.tx, fontSize: 28, margin: 0,
        textTransform: 'uppercase', letterSpacing: '.04em',
      }}
      >
        Avatar Lab
      </h1>
      <p style={{ ...TYPE.micro, color: COLOR.mut, marginTop: 6, maxWidth: 700 }}>
        Every face is painted from its seed by the raster renderer. Nothing here is read
        from a save, nothing is written to one, and no screen in the game uses this
        renderer yet.
      </p>

      <div style={{
        display: 'grid', gap: S[3], marginTop: S[4],
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', maxWidth: 520,
      }}
      >
        <div>
          <span style={label}>Batch seed</span>
          <input style={field} value={batch} aria-label="Batch seed"
            onChange={(e) => { setBatch(e.target.value); }}
          />
        </div>
        <div>
          <span style={label}>Trait readout</span>
          <button type="button" style={{ ...field, cursor: 'pointer', textAlign: 'left' }}
            onClick={() => { setTraits((t) => !t); }}
          >
            {traits ? 'Shown' : 'Hidden'}
          </button>
        </div>
      </div>

      <Section
        title="The league"
        note="Fifty-four players, every position, ages 21 to 38, drawn from one batch with no filtering."
      >
        <Row subjects={league} size={128} bare={false} traits={false} shirt="#2C4A6E" />
      </Section>

      <Section
        title="Same pigment, different men"
        note="Three bands of the melanin scale. Within a band every player shares a skin tone to within a few steps, so anything that separates them is bone: skull width, cheekbone height, jaw angle, brow, nose, mouth."
      >
        <div style={{ display: 'grid', gap: 14 }}>
          <Row subjects={deep} size={150} bare={false} traits={traits} shirt="#1F3A2E" />
          <Row subjects={mid} size={150} bare={false} traits={traits} shirt="#3A2E4A" />
          <Row subjects={light} size={150} bare={false} traits={traits} shirt="#4A3324" />
        </div>
      </Section>

      <Section
        title="Same haircut, different men"
        note="Eight players who all happened to draw a fade. If hair were carrying the identity, this row would be the failure case."
      >
        <Row subjects={sameCut} size={150} bare={false} traits={traits} shirt="#243B52" />
      </Section>

      <Section
        title="One ancestry, many faces"
        note="Ancestry multiplies trait weights; it never selects a trait. Two rows, one influence each, and the people in them are not related."
      >
        <div style={{ display: 'grid', gap: 14 }}>
          <Row subjects={oneAncestry} size={150} bare={false} traits={traits} shirt="#2C4A6E" />
          <Row subjects={euro} size={150} bare={false} traits={traits} shirt="#52302A" />
        </div>
      </Section>

      <Section
        title="Mixed heritage"
        note="Two influences each. Weights are merged by maximum rather than averaged, so these take after one side, the other, or neither -- what they do not do is converge on a midpoint."
      >
        <Row subjects={mixed} size={150} bare={false} traits={traits} shirt="#3E4230" />
      </Section>

      <Section
        title="One man, one career"
        note="The same seed at 21, 25, 29, 33 and 37. The bones do not move: cheeks hollow, lids grow heavier, the nose and ears lengthen, the hairline goes. It has to be recognisably the same person at both ends."
      >
        <Row subjects={career} size={168} bare={false} traits={false} shirt="#2C4A6E" />
      </Section>

      <Section
        title="Built for the job"
        note="Corner through left tackle. The head is the same height in every frame; the neck, the trapezius and the shoulders are not."
      >
        <Row subjects={builds} size={150} bare={false} traits={traits} shirt="#1D2833" />
      </Section>

      <section style={{ marginTop: 44, paddingTop: 20, borderTop: `2px solid ${COLOR.amber}` }}>
        <h2 style={{
          fontFamily: FONT.display, color: COLOR.amber, fontSize: 20, margin: 0,
          textTransform: 'uppercase', letterSpacing: '.05em',
        }}
        >
          Face-only test
        </h2>
        <p style={{ ...TYPE.micro, color: COLOR.mut, margin: '4px 0 6px', maxWidth: 700 }}>
          Twenty players with the hair, the facial hair and the accessories removed, in the
          same shirt under the same light. This is the test that decides whether facial
          geometry is carrying the identity. If these twenty read as one template, nothing
          above this line counts.
        </p>
        <p style={{ ...TYPE.micro, color: COLOR.dim, margin: '0 0 12px' }}>
          {`${String(bareStats.distinct)} distinct structural signatures · closest pair ${String(bareStats.closest)} of 47`}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }} data-testid="face-only">
          {bare.map((s) => (
            <div key={s.profile.seed} style={{ width: 168 }}>
              <Portrait subject={s} size={168} bare shirt="#232B33" />
              {traits && <Traits subject={s} />}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
