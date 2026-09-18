import { COLOR, S, TYPE } from '../../app/tokens';
import { EntityLink } from '../../components/EntityLink';
import { AbilityDial } from '../../components/AbilityDial';
import { PerformanceChip } from '../../components/PerformanceChip';
import { ActionButton } from '../../components/ActionButton';
import { Panel } from '../../components/Surface';
import { PlayerFace } from '../../avatar/PlayerFace';
import type { AvatarMap } from '../../hooks/useAvatars';
import { money, Pill, TermLine } from '../marketRows';
import type { CampPlayerOut } from '../../../supabase/functions/_shared/api/reads/camp';

const TREND = { RISER: 'Rising', FALLER: 'Falling', STEADY: 'Steady', UNSEEN: 'Not seen in preseason' } as const;

export function CampPlayer({ p, avatars, onCut, busy }: {
  readonly p: CampPlayerOut; readonly avatars: AvatarMap;
  readonly onCut?: (player: CampPlayerOut) => void; readonly busy: boolean;
}) {
  return (
    <article data-testid={`camp-player-${p.playerId}`} aria-label={`${p.name} camp evaluation`}>
      <Panel>
        <div style={{ display: 'flex', alignItems: 'center', gap: S[2], minWidth: 0 }}>
          <PlayerFace avatars={avatars} playerId={p.playerId} name={p.name} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <EntityLink to={{ kind: 'player', id: p.playerId }} block>
              <span style={{ display: 'block', fontWeight: 600, overflowWrap: 'anywhere' }}>{p.name}</span>
              <span style={{ ...TYPE.micro, color: COLOR.mut, display: 'block' }}>
                {p.position} · Age {p.age} · {p.rookie ? 'Rookie' : `${String(p.experienceYears)} years`}
              </span>
            </EntityLink>
          </div>
          <div style={{ textAlign: 'center' }}>
            <AbilityDial value={p.overall} label="Ability" size={40} />
            <span style={{ ...TYPE.micro, color: COLOR.mut }}>Ability</span>
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: S[2], marginBlock: S[2] }}>
          <Pill text={p.statusLabel === null ? 'Outlook unavailable' : p.statusLabel} />
          <Pill text={TREND[p.trend]} tone={p.trend === 'RISER' ? 'good' : p.trend === 'FALLER' ? 'warn' : 'quiet'} />
          {p.weeksOut !== null && <Pill text={`Out ${String(p.weeksOut)}w`} tone="bad" />}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: S[2] }}>
          <div>
            <div style={{ ...TYPE.micro, color: COLOR.mut, marginBottom: S[1] }}>Practice estimate</div>
            <PerformanceChip value={p.practiceGrade} label="Practice estimate" />
          </div>
          <div>
            <div style={{ ...TYPE.micro, color: COLOR.mut, marginBottom: S[1] }}>Preseason grade</div>
            <PerformanceChip value={p.preseasonGrade} label="Preseason grade" />
          </div>
        </div>
        <p style={{ ...TYPE.prose, fontSize: 12, color: COLOR.mut, marginBlock: S[2] }}>
          {p.preseasonGrade === null ? 'No preseason grade yet.'
            : `${String(p.preseasonGames)} appearances · ${p.preseasonBasis === 'AVAILABILITY'
              ? 'Availability-based grade; individual production is not measured.'
              : 'Grade from preseason production.'}`}
          {p.practiceSource === 'INITIAL_ESTIMATE' && ' Opening staff estimate; no evaluation recorded yet.'}
        </p>
        <details>
          <summary style={{ ...TYPE.micro, color: COLOR.mut, cursor: 'pointer', minHeight: 44, alignContent: 'center' }}>
            Contract & roster detail
          </summary>
          <TermLine label="Potential ability" value={String(p.potential)} />
          <TermLine label="Depth order" value={p.depthOrder === null ? 'Not set' : String(p.depthOrder)} />
          <TermLine label="Contract remaining" value={p.contractYears === null ? 'Unavailable' : `${String(p.contractYears)} years`} />
          <TermLine label="Staff roster estimate" value={p.probability === null ? 'Unavailable' : `${String(p.probability)}% · not a guarantee`} />
          <p style={{ ...TYPE.prose, fontSize: 12, color: COLOR.mut }}>Roster outlook is the staff’s assessment. You decide who stays.</p>
        </details>
        <TermLine label="Cap charge" value={p.capHit === null ? 'Unavailable' : money(p.capHit)} />
        <TermLine label="Dead money if cut" value={p.deadMoney === null ? 'Unavailable' : money(p.deadMoney)} />
        {onCut !== undefined && (
          <div style={{ marginTop: S[2] }}>
            <ActionButton tone="quiet" disabled={busy} onClick={() => { onCut(p); }} testId={`camp-cut-${p.playerId}`}>
              Review cut
            </ActionButton>
          </div>
        )}
      </Panel>
    </article>
  );
}
