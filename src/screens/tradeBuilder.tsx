// Building a package, and hearing what they make of it.
//
// Both sides on one screen, both the same shape, because a trade is
// symmetrical and a builder that looked different depending on which club's
// assets you were ticking would make a two-sided decision harder than it is.
//
// The meter re-reads on every change. That is the negotiation: a manager is
// searching for the package that crosses a line they cannot see directly, and
// the only way to search is to be told, immediately, whether the last thing
// they added helped. A builder that only answered on submit would be a form.

import { useState } from 'react';
import { COLOR, S, TYPE } from '../app/tokens';
import { useSave } from '../app/SaveProvider';
import { useQuery } from '../hooks/useQuery';
import { ActionButton } from '../components/ActionButton';
import { Caption, Panel, SectionHeader } from '../components/Surface';
import { Loading, QueryError } from '../components/QueryState';
import { AssetToggle, InterestMeter, type AssetChoice } from './tradeParts';
import { money } from './marketRows';
import type { TradeAssetsOut } from '../../supabase/functions/_shared/api/reads/tradeAssetsRead';
import type { TradeQuote } from '../../supabase/functions/_shared/api/tradeDeal';
import type { OwnedPick } from '../../supabase/functions/_shared/api/reads/tradeCenter';
import type { ProposeOut } from '../../supabase/functions/_shared/api/handlers/tradeMoves';

export function TradeBuilder({ teamId, ownPicks, onClose }: {
  readonly teamId: string;
  readonly ownPicks: readonly OwnedPick[];
  readonly onClose: () => void;
}) {
  const { save, version, busy, marketMove } = useSave();
  const [give, setGive] = useState<readonly string[]>([]);
  const [want, setWant] = useState<readonly string[]>([]);
  const [answer, setAnswer] = useState<ProposeOut | null>(null);

  const saveId = save?.saveId ?? '';
  const theirs = useQuery<TradeAssetsOut>('trade-assets', { saveId, teamId }, version, save !== null);
  const mine = useQuery<TradeAssetsOut>(
    'trade-assets', { saveId, teamId: save?.userTeamId ?? '' }, version, save !== null);

  // What they make of it, re-read on every change. A read: quoting writes
  // nothing, which is what lets it run on every tick of a checkbox.
  const quote = useQuery<TradeQuote>('quote-trade', {
    saveId, teamId, give: [...give], get: [...want],
  }, version, save !== null && give.length > 0 && want.length > 0);

  const toggle = (
    list: readonly string[], set: (next: readonly string[]) => void, key: string,
  ): void => {
    setAnswer(null);
    set(list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);
  };

  const propose = async (): Promise<void> => {
    const out = await marketMove<ProposeOut>('propose-trade', {
      teamId, give: [...give], get: [...want],
    });
    if (out !== null) {
      setAnswer(out);
      if (out.answer === 'ACCEPTED') { setGive([]); setWant([]); }
    }
  };

  const q = quote.status === 'ready' ? quote.data : null;
  const ready = give.length > 0 && want.length > 0;

  return (
    <div data-testid="trade-builder" style={{ display: 'grid', gap: S[3] }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: S[2] }}>
        <span style={{ ...TYPE.body, flex: 1, minWidth: 0, color: COLOR.tx }}>
          {theirs.status === 'ready' ? theirs.data.name : teamId}
        </span>
        <ActionButton tone="quiet" compact testId="builder-close" onClick={onClose}>
          Another club
        </ActionButton>
      </div>

      {theirs.status === 'error' && <QueryError error={theirs.error} onRetry={theirs.retry} />}
      {theirs.status === 'loading' && <Loading label="Reading their roster" rows={5} />}

      {theirs.status === 'ready' && (
        <>
          <SectionHeader title="What you want" />
          <Panel padded={false}>
            <div style={{ padding: S[3], display: 'grid', gap: 6 }} data-testid="their-assets">
              {choicesFrom(theirs.data).map((asset) => (
                <AssetToggle
                  key={asset.key}
                  asset={asset}
                  selected={want.includes(asset.key)}
                  onToggle={() => { toggle(want, setWant, asset.key); }}
                />
              ))}
            </div>
          </Panel>

          <SectionHeader title="What you send" />
          <Panel padded={false}>
            <div style={{ padding: S[3], display: 'grid', gap: 6 }} data-testid="my-assets">
              {mine.status === 'ready' && choicesFrom(mine.data, ownPicks).map((asset) => (
                <AssetToggle
                  key={asset.key}
                  asset={asset}
                  selected={give.includes(asset.key)}
                  onToggle={() => { toggle(give, setGive, asset.key); }}
                />
              ))}
            </div>
          </Panel>

          <Panel>
            {!ready && (
              <Caption>
                Pick at least one asset from each side and they will tell you what they think.
              </Caption>
            )}
            {ready && quote.status === 'loading' && <Caption>Working out what they think…</Caption>}
            {ready && quote.status === 'error' && (
              <QueryError error={quote.error} onRetry={quote.retry} />
            )}
            {q !== null && (
              <div style={{ display: 'grid', gap: S[3] }}>
                <InterestMeter
                  interest={q.interest}
                  fill={q.fill}
                  reasons={q.reasons}
                  blocked={q.blocked}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: S[2] }}>
                  <span style={{ ...TYPE.micro, color: COLOR.mut }}>
                    {`You send ${money(salaryOf(q.giving))}`}
                  </span>
                  <span style={{ ...TYPE.micro, color: COLOR.mut }}>
                    {`You take on ${money(salaryOf(q.getting))}`}
                  </span>
                </div>
                {/* What they would do instead. Shown as words rather than a
                    button that silently rebuilds the package: the manager
                    decides what to add, because they know what they can spare. */}
                {q.counter !== null && (
                  <p
                    data-testid="counter-hint"
                    style={{ ...TYPE.prose, margin: 0, color: COLOR.amber }}
                  >
                    {q.counter.ask}.
                  </p>
                )}
                <ActionButton
                  disabled={busy !== null || q.blocked !== null}
                  testId="propose-trade"
                  onClick={() => { void propose(); }}
                >
                  Offer this trade
                </ActionButton>
              </div>
            )}
            {answer !== null && (
              <p
                data-testid="trade-answer"
                style={{
                  ...TYPE.prose, margin: `${String(S[2])}px 0 0`,
                  color: answer.answer === 'ACCEPTED' ? COLOR.teal
                    : answer.answer === 'COUNTERED' ? COLOR.amber : COLOR.red,
                }}
              >
                {answer.summary}
              </p>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}

/** Every asset a club has, as something to tick. Own picks are passed in for
 *  the managed club because the Trade Center has already read them. */
function choicesFrom(
  data: TradeAssetsOut, ownPicks?: readonly OwnedPick[],
): readonly AssetChoice[] {
  const players: AssetChoice[] = data.players.map((p) => ({
    key: `PLAYER:${p.playerId}`,
    label: `${p.position} ${p.name}`,
    detail: [
      `${String(p.overall)} ovr`,
      `${String(p.age)}y`,
      p.salary > 0 ? money(p.salary) : 'no contract on record',
      p.yearsRemaining === null ? 'term unknown' : `${String(p.yearsRemaining)} yr left`,
    ].join(' · '),
    value: p.value,
    ...(p.untouchable
      ? { disabled: true, disabledReason: 'They will not trade him' }
      : {}),
  }));
  const picks: AssetChoice[] = (ownPicks ?? data.picks.map((p) => ({
    pickId: p.pickId, year: p.year, round: p.round,
    fromTeamName: p.fromTeamName, own: false,
  }))).map((p) => {
    const value = data.picks.find((x) => x.pickId === p.pickId)?.value ?? 0;
    return {
      key: `PICK:${p.pickId}`,
      label: `${String(p.year)} round ${String(p.round)}`,
      detail: p.fromTeamName === null ? 'own pick' : `via ${p.fromTeamName}`,
      value,
    };
  });
  return [...players, ...picks];
}

const salaryOf = (assets: TradeQuote['giving']): number =>
  assets.reduce((sum, a) => sum + a.salary, 0);
