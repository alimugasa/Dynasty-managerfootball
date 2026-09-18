// /dev/portraits -- what twelve players would load.
//
// The brief asked for twelve demonstration portraits in the lab. There is no
// artwork to draw them with, and the instruction on that case was explicit:
// say so, and do not substitute generated geometry to produce visible output.
// So this screen shows the half of the system that does exist -- the
// deterministic mapping from a seed to a set of asset requirements -- as data
// rather than as a picture.
//
// It is a falsifiable claim rather than a status page: two players with the
// same structure family and pigment anchor are shown next to each other, so
// the coverage argument in docs/AVATAR-ASSET-SPEC.md §5.4 can be checked
// against real seeds before anybody is paid to paint anything.

import { useMemo } from 'react';
import { COLOR, FONT, R, S, TYPE } from '../app/tokens';
import { find, spread, type Subject } from './labParts';
import { describe } from '../avatar/v2/descriptor';
import { selectLayers, type PortraitSelection } from '../avatar/hybrid/select';
import { planPortrait, type MissingAsset } from '../avatar/hybrid/plan';
import { MANIFEST_URL } from '../avatar/hybrid/library';
import { useHybridLibrary } from '../avatar/hybrid/useHybridLibrary';
import { skinBand } from '../../supabase/functions/_shared/avatar/skin';

const card: React.CSSProperties = {
  background: COLOR.panel, border: `1px solid ${COLOR.line}`,
  borderRadius: R.md, padding: S[3],
};

const key: React.CSSProperties = {
  ...TYPE.micro, color: COLOR.dim, letterSpacing: '.08em',
};

const val: React.CSSProperties = {
  fontFamily: FONT.ui, fontSize: 12, color: COLOR.tx, fontVariantNumeric: 'tabular-nums',
};

function Field({ name, children }: { readonly name: string; readonly children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: S[2], padding: '3px 0' }}>
      <span style={key}>{name}</span>
      <span style={val}>{children}</span>
    </div>
  );
}

function Banner({ tone, title, children }: {
  readonly tone: string; readonly title: string; readonly children: React.ReactNode;
}) {
  return (
    <div style={{ ...card, borderColor: tone, borderLeft: `3px solid ${tone}`, marginBottom: S[3] }}>
      <div style={{ ...TYPE.heading, color: tone, marginBottom: S[1] }}>{title}</div>
      <div style={{ ...TYPE.prose, color: COLOR.mut }}>{children}</div>
    </div>
  );
}

function LibraryState() {
  const state = useHybridLibrary();
  if (state.status === 'loading') {
    return <Banner tone={COLOR.dim} title="Library">Reading {MANIFEST_URL}.</Banner>;
  }
  if (state.status === 'absent') {
    return (
      <Banner tone={COLOR.red} title="No manifest">
        Nothing answered at <code>{state.url}</code>. The renderer draws nothing and every
        portrait falls back to initials.
      </Banner>
    );
  }
  if (state.status === 'invalid') {
    return (
      <Banner tone={COLOR.red} title={`Manifest rejected (${String(state.problems.length)})`}>
        <ul style={{ margin: `${String(S[1])}px 0 0`, paddingLeft: 18 }}>
          {state.problems.map((p) => <li key={p}>{p}</li>)}
        </ul>
      </Banner>
    );
  }
  if (state.status === 'empty') {
    return (
      <Banner tone={COLOR.amber} title="Library empty — this is expected">
        The manifest is valid and declares the canvas, the anchors and the three pigment
        anchors, but no artwork has been delivered. This repository contains no portrait
        assets and cannot produce any at the required quality; see
        docs/AVATAR-ASSET-SPEC.md §2 and §6 for what has to be commissioned. Selection
        below is real and deterministic — only the pixels are missing.
      </Banner>
    );
  }
  return (
    <Banner tone={COLOR.teal} title="Library ready">
      {String(state.manifest.baseFaces.length)} base sets, {String(state.manifest.hair.length)} hair
      layers, {String(state.manifest.facialHair.length)} facial-hair layers.
    </Banner>
  );
}

/* ------------------------------------------------------------- subject -- */

function Needs({ missing }: { readonly missing: readonly MissingAsset[] }) {
  if (missing.length === 0) return null;
  return (
    <div style={{ marginTop: S[2], paddingTop: S[2], borderTop: `1px solid ${COLOR.line}` }}>
      <div style={{ ...key, color: COLOR.amber, marginBottom: 4 }}>
        Missing ({String(missing.length)})
      </div>
      {missing.map((m) => (
        <div key={`${m.kind}:${m.need}`} style={{ ...TYPE.prose, fontSize: 12, color: COLOR.mut }}>
          <span style={{ color: COLOR.dim }}>{m.kind}</span> — {m.need}
        </div>
      ))}
    </div>
  );
}

function Player({ subject, selection, missing }: {
  readonly subject: Subject;
  readonly selection: PortraitSelection;
  readonly missing: readonly MissingAsset[];
}) {
  const { profile, position, age } = subject;
  const off = selection.warp.reduce((m, [dx, dy]) => Math.max(m, Math.abs(dx), Math.abs(dy)), 0);
  return (
    <div style={card}>
      <div style={{ ...TYPE.heading, color: COLOR.tx }}>
        {selection.structure} · {selection.ageBand}
      </div>
      <div style={{ ...TYPE.prose, fontSize: 12, color: COLOR.dim, marginBottom: S[2] }}>
        {position} · age {String(age)} · seed {profile.seed.slice(0, 8)}
      </div>
      <Field name="Pigment">
        step {String(selection.pigment.targetStep)} · {skinBand(profile.identity.skinStep)}
        {' · '}{selection.pigment.undertone}
      </Field>
      <Field name="Skin">
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            width: 10, height: 10, borderRadius: 2, background: selection.pigment.hex,
            border: `1px solid ${COLOR.line}`,
          }}
          />
          {selection.pigment.hex}
        </span>
      </Field>
      <Field name="Hair">{selection.hairStyleId ?? '—'} · {selection.hairFamily}</Field>
      <Field name="Facial hair">{selection.facialHairId ?? '—'}</Field>
      <Field name="Complexion">{selection.complexionId ?? '—'}</Field>
      <Field name="Accessory">{selection.accessoryId ?? '—'}</Field>
      <Field name="Build">{selection.buildId}</Field>
      <Field name="Warp">max {(off * 100).toFixed(2)}% of head width</Field>
      <Needs missing={missing} />
    </div>
  );
}

/* -------------------------------------------------------------- screen -- */

export function PortraitPlanScreen() {
  const state = useHybridLibrary();
  const subjects = useMemo(() => find('portrait-plan', 12, () => true, spread), []);

  const rows = useMemo(() => subjects.map((subject) => {
    const descriptor = describe(subject.profile);
    const selection = selectLayers(descriptor);
    const result = state.status === 'ready' || state.status === 'empty'
      ? planPortrait(state.manifest, selection, descriptor.key)
      : null;
    return {
      subject,
      selection,
      missing: result !== null && !result.ok ? result.missing : [],
    };
  }), [subjects, state]);

  const families = new Set(rows.map((r) => r.selection.structure));

  return (
    <div style={{ padding: S[3], background: COLOR.ink, minHeight: '100vh' }}>
      <div style={{ ...TYPE.display, color: COLOR.tx }}>Portrait plan</div>
      <div style={{ ...TYPE.prose, color: COLOR.mut, marginBottom: S[3], maxWidth: 560 }}>
        Twelve players, resolved against the asset library. Every value below comes from the
        seed and nothing else, so it is identical on every load and on every device — which
        is the property the artwork will inherit.
      </div>

      <LibraryState />

      <div style={{ ...card, marginBottom: S[3] }}>
        <Field name="Structure families hit">
          {String(families.size)} of 12 across these twelve players
        </Field>
        <Field name="Base sets for full coverage">12 structures × 3 pigments × 2 age bands = 72</Field>
        <Field name="Evaluation tier">12 base sets, 4 hair, 2 facial hair, 1 clothing, 1 background</Field>
      </div>

      <div style={{ display: 'grid', gap: S[2], gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }} data-testid="portrait-plan-grid">
        {rows.map((r) => (
          <Player
            key={r.subject.profile.seed}
            subject={r.subject}
            selection={r.selection}
            missing={r.missing}
          />
        ))}
      </div>
    </div>
  );
}
