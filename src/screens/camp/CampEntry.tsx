import { COLOR, S, TYPE } from '../../app/tokens';
import { useNavigator } from '../../app/navigation';
import { Panel } from '../../components/Surface';
import { ActionButton } from '../../components/ActionButton';
import { PHASE_LABEL } from '../../domain/phase';

export function CampEntry({ phase }: { readonly phase: string }) {
  const nav = useNavigator();
  return (
    <div style={{ marginBlock: S[3] }}>
      <Panel>
        <h2 style={{ ...TYPE.heading, marginTop: 0 }}>Training Camp</h2>
        <p style={{ ...TYPE.micro, color: COLOR.amber }}>{PHASE_LABEL[phase]}</p>
        <p style={{ ...TYPE.prose, color: COLOR.mut }}>Compare position battles, follow preseason performance and decide who makes your opening roster.</p>
        <ActionButton onClick={() => { nav.push('camp'); }} testId="to-camp">Open Training Camp</ActionButton>
      </Panel>
    </div>
  );
}
