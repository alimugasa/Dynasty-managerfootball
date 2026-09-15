// Making a free agent an offer.
//
// The sheet opens on terms he would actually take, because the alternative is
// a manager guessing at three numbers and being told no three times. From
// there every control moves one term, and the likelihood under them moves with
// it -- so the relationship between money, years, role and the answer is
// something you can feel rather than something you have to be told.
//
// He can accept, refuse or counter. A counter is not a softer refusal: it
// names the salary that closes the deal, and taking it closes the deal. The
// button that appears when he counters therefore does exactly one thing --
// offers what he asked for -- and it works.

import { useEffect, useState } from 'react';
import { COLOR, S, TYPE } from '../app/tokens';
import { useSave } from '../app/SaveProvider';
import { useQuery } from '../hooks/useQuery';
import { ActionButton } from '../components/ActionButton';
import { ChipRow, type Chip } from '../components/ChipRow';
import { Sheet } from '../components/Sheet';
import { Caption } from '../components/Surface';
import { Likelihood, TermLine, money } from './marketRows';
import type { FreeAgentsOut, PoolPlayer } from '../../supabase/functions/_shared/api/reads/freeAgents';
import type { OfferOut } from '../../supabase/functions/_shared/api/handlers/marketMoves';

const ROLES: readonly Chip[] = [
  { key: 'STARTER', label: 'Starter' },
  { key: 'ROTATION', label: 'Rotation' },
  { key: 'DEPTH', label: 'Depth' },
];

const YEARS: readonly Chip[] = [1, 2, 3, 4, 5].map((n) => ({
  key: String(n), label: `${String(n)} yr`,
}));

/** The steps a manager actually moves an offer in. Five per cent is fiddly on
 *  a phone and a flat million is meaningless on a minimum deal, so the step is
 *  a share of what he is asking. */
const STEPS = [-0.2, -0.1, 0.1, 0.25] as const;

export function OfferSheet({ player, pool, onClose, onProfile }: {
  readonly player: PoolPlayer;
  readonly pool: FreeAgentsOut;
  readonly onClose: () => void;
  readonly onProfile: () => void;
}) {
  const { save, busy, version, marketMove } = useSave();
  const [aav, setAav] = useState(player.inSeasonAsk);
  const [years, setYears] = useState(player.expectedYears ?? 2);
  const [role, setRole] = useState<string>(player.desiredRole ?? 'ROTATION');
  const [seeded, setSeeded] = useState(false);
  const [answer, setAnswer] = useState<OfferOut | null>(null);

  /**
   * What he makes of the terms currently on screen.
   *
   * A read, not a write: `offer-contract` without `commit` works the numbers
   * out and touches nothing, so this goes through useQuery and the likelihood
   * moves as the manager moves the salary.
   *
   * It was a write at first -- the same call through marketMove -- and that
   * was an infinite loop rather than a quote. Every write bumps the save's
   * version so the screens re-read; the version bump changed the identity of
   * the function the effect depended on; the effect fired again; and the sheet
   * re-rendered itself forever with its own button disabled. It looked like a
   * dead button, which is how it was found.
   */
  const quote = useQuery<OfferOut>('offer-contract', {
    saveId: save?.saveId ?? '',
    playerId: player.playerId,
    aav, years, role,
  }, version, save !== null);

  // The opening terms: what he would actually take, worked out by the server
  // rather than guessed at here, and applied once. A sheet that opened on
  // zeroes would make the manager do the market's arithmetic for it.
  useEffect(() => {
    if (seeded || quote.status !== 'ready') return;
    setAav(quote.data.suggested.aav);
    setYears(quote.data.suggested.years);
    setRole(quote.data.suggested.role);
    setSeeded(true);
  }, [seeded, quote.status, quote.data]);

  const put = async (terms?: { aav: number; years: number; role: string }): Promise<void> => {
    const out = await marketMove<OfferOut>('offer-contract', {
      playerId: player.playerId,
      aav: terms?.aav ?? aav,
      years: terms?.years ?? years,
      role: terms?.role ?? role,
      commit: true,
    });
    if (out !== null) setAnswer(out);
  };

  const verdict = answer?.outcome?.verdict ?? null;
  const signed = verdict?.kind === 'ACCEPTED';
  const room = pool.rosterCount < pool.rosterLimit;
  const affordable = pool.capSpace >= aav;
  const live = quote.status === 'ready' ? quote.data : null;

  return (
    <Sheet
      title={`${player.position} ${player.name}`}
      detail={`${String(player.age)} · ${String(player.overall)} overall · `
        + `${player.previousTeamName ?? 'No club on record'}`}
      testId="offer-sheet"
      onClose={onClose}
    >
      {signed ? (
        <div data-testid="offer-signed">
          <p style={{ ...TYPE.prose, margin: `0 0 ${String(S[3])}px`, color: COLOR.teal }}>
            {`${player.name} has signed for ${String(answer?.outcome?.years ?? years)} `
              + `year${(answer?.outcome?.years ?? years) === 1 ? '' : 's'} `
              + `at ${money(answer?.outcome?.aav ?? aav)} a year.`}
          </p>
          <ActionButton testId="offer-done" onClick={onClose}>Done</ActionButton>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gap: S[1], marginBottom: S[3] }}>
            <TermLine label="He is asking" value={`${money(player.inSeasonAsk)} for the rest of this season`} />
            <TermLine label="Wants" value={player.desiredRole ?? 'Role not on record'} />
            <TermLine label="Your offer" value={`${money(aav)} a year · ${String(years)} yr`} />
            <TermLine label="Cap hit" value={money(aav)} />
            <TermLine
              label="Cap space after"
              value={money(pool.capSpace - aav)}
              tone={affordable ? 'default' : 'bad'}
            />
            <TermLine
              label="Roster after"
              value={`${String(pool.rosterCount + 1)}/${String(pool.rosterLimit)}`}
              tone={room ? 'default' : 'bad'}
            />
          </div>

          <div style={{ display: 'grid', gap: S[2], marginBottom: S[3] }}>
            <div>
              <span style={{ ...TYPE.micro, color: COLOR.mut }}>Salary</span>
              <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                {STEPS.map((step) => (
                  <ActionButton
                    key={String(step)}
                    tone="quiet"
                    compact
                    testId={`offer-step-${String(step)}`}
                    onClick={() => {
                      setAav((n: number) => Math.max(1, Math.round(n + player.inSeasonAsk * step)));
                      setAnswer(null);
                    }}
                  >
                    {`${step > 0 ? '+' : '−'}${String(Math.round(Math.abs(step) * 100))}%`}
                  </ActionButton>
                ))}
              </div>
            </div>
            <ChipRow
              chips={YEARS}
              value={String(years)}
              label="Contract length"
              onChange={(k) => { setYears(Number(k)); setAnswer(null); }}
            />
            <ChipRow
              chips={ROLES}
              value={role}
              label="Role offered"
              onChange={(k) => { setRole(k); setAnswer(null); }}
            />
          </div>

          {/* The likelihood for the terms on screen right now, re-read as they
              move. A figure computed for one salary and left on screen under
              another would be a stale number presented as a live one. */}
          {live !== null && <Likelihood p={live.quote.probability} />}
          {live === null && (
            <Caption>Working out what he makes of these terms…</Caption>
          )}

          {verdict?.kind === 'REJECTED' && (
            <p
              data-testid="offer-rejected"
              style={{ ...TYPE.prose, margin: `${String(S[2])}px 0 0`, color: COLOR.red }}
            >
              {`He says no. ${verdict.reason}.`}
            </p>
          )}
          {verdict?.kind === 'COUNTERED' && (
            <div data-testid="offer-countered" style={{ marginTop: S[2] }}>
              <p style={{ ...TYPE.prose, margin: 0, color: COLOR.amber }}>
                {`He counters: ${money(verdict.aav)} a year over `
                  + `${String(verdict.years)} year${verdict.years === 1 ? '' : 's'}.`}
              </p>
            </div>
          )}

          <div style={{ display: 'grid', gap: S[2], marginTop: S[3] }}>
            {verdict?.kind === 'COUNTERED' && (
              <ActionButton
                disabled={busy !== null || pool.capSpace < verdict.aav}
                testId="offer-accept-counter"
                onClick={() => {
                  setAav(verdict.aav);
                  setYears(verdict.years);
                  void put({ aav: verdict.aav, years: verdict.years, role });
                }}
              >
                {`Meet his number · ${money(verdict.aav)}`}
              </ActionButton>
            )}
            <ActionButton
              tone={verdict?.kind === 'COUNTERED' ? 'quiet' : 'primary'}
              disabled={busy !== null || !room}
              testId="offer-submit"
              onClick={() => { void put(); }}
            >
              {verdict === null ? 'Offer this deal' : 'Offer again'}
            </ActionButton>
            <ActionButton tone="quiet" testId="offer-profile" onClick={onProfile}>
              Full profile
            </ActionButton>
          </div>

          {!room && (
            <p
              data-testid="offer-blocked"
              style={{ ...TYPE.prose, margin: `${String(S[2])}px 0 0`, color: COLOR.amber }}
            >
              {`The roster is full at ${String(pool.rosterLimit)}. Release a player first and `
                + 'the space is his.'}
            </p>
          )}
        </>
      )}
    </Sheet>
  );
}
