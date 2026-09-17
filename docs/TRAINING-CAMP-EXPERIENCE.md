# Training Camp Experience — Phase 1

This milestone exposes the existing camp backend. It does not replace the camp,
preseason, roster, contract, or simulation systems.

## Player journey

During TRAINING_CAMP, PRESEASON, or FINAL_CUTS, Team and Play offer **Open Training
Camp**. The offseason screen also offers this entry after it hands over to camp.
New saves retain their existing starting phase; this milestone does not insert
camp into the new-game process.

The overview shows the current phase, actual roster count, camp capacity, final
target, required cuts, deadline, upcoming opponent, cap space, position groups,
staff-identified battles, notable evaluation movement, and preseason results.
The displayed numbers come from the camp read, including commissioner settings.

Selecting a position opens the server-selected battles and the full group.
Player links open the existing profile, and returning restores the camp view,
position, filter, and sort. Ability uses the existing circular dial; evaluations
use rectangular performance chips. Practice estimates, unseen preseason players,
and grades based only on availability are explicitly labelled.

Cut decisions support position, roster-outlook, injury and movement filters, with
explicit sorting by practice estimate, preseason grade, ability, age, cap charge
or dead money. Unknown values sort after known values in either direction.

Review cut reads the existing preview route before enabling confirmation.
The sheet shows the player, age, position, cap charge, dead money, cap savings,
waiver destination and before/after roster counts. Confirmation invokes the
existing cut route, which recalculates the terms. Success reloads authoritative
save and camp data; failure keeps the decision visible and reports the error.
No optimistic player removal or client-side financial calculation is used.

Camp advancement uses the existing advance route. After the last preseason
game, the view opens Final Roster Review. It shows the count gate, position
distribution, depth and injury-availability warnings, and injured players.
Signing off requires another explicit confirmation and the existing finalize
route. The server can refuse a request even if the displayed read looked legal.

## Reused authority and narrow extensions

- Existing routes: camp, advance-camp, preview-cut, cut-player, finalize-roster.
- Existing rules and mutations: preseason.ts, handlers/campMoves.ts,
  campBoard.ts, campEvaluation.ts, preseasonWeek.ts, cutPlayer.ts.
- Existing persistence includes camp_evaluations, season_schedule,
  game_results, roster/contract rows and the engine save document.
- Existing UI: Screen, Panel, StatTiles, EntityLink/resolveEntityRoute, ChipRow,
  SortControl, Modal, AbilityDial, PerformanceChip, PlayerFace, SaveProvider,
  useQuery, useUiState, loading and error primitives.
- The camp read now returns the complete board, position summaries, evaluation
  provenance/categories, current phase actions, finalization fault, depth and
  availability warnings, and preseason fixtures/results. campTypes.ts carries
  the read contract; campSummary.ts contains read-only summaries.
- The existing keep-line projection is exported for the group summary. Its
  formula, battle selection and roster probability model are unchanged.
- Cut previews include age. Missing contract inputs now remain unavailable in
  the board and prevent pricing or executing a cut, instead of becoming zero
  charges. No financial formula or CPU decision policy is changed.
- useCamp validates required read/preview fields through MissingData before
  offering actions. Screens do not import data access directly.

## Important existing behavior

- Ordinary finalization requires exactly the server's active-roster target.
  Commissioner mode can make that target advisory. The UI invents no minimums.
- Depth and availability warnings are advisory; the existing finalization gate
  validates roster count, not a new positional or salary-cap rule.
- The backend permits early finalization in all three camp phases. This is
  exposed only from Final Roster Review, with an explicit warning that remaining
  preseason games will be skipped.
- Group projected places describe the existing staff keep-line model, not
  mandatory positional quotas or a promise that every projected player stays.
- Practice grades are existing staff estimates; preseason grades use existing
  production or availability inputs. No detailed training activity, confidence
  model, snap counts, or new attributes are invented by the client.
- Existing raw grade movement uses the existing six-point threshold for notable
  risers/fallers. Smaller differences are displayed as steady.
- Preseason results and statistics remain distinct from regular and playoff
  competition data. The screen links to the existing game detail.
- The current rollover can enter camp with substantially fewer than 90 players.
  The UI renders that actual roster, rather than fabricating a full camp.
- The existing marketMoves.ts guard permits signings and waiver claims only in
  regular-season and playoff phases. Camp cannot currently replenish an
  over-cut roster. Confirmation displays the final target and this warning;
  Final Roster Review repeats it rather than offering a broken signing
  shortcut. Adding a camp replenishment path requires a separate backend scope.

## Verification

Focused UI tests cover authoritative rendering, comparisons, grades, filtering,
sorting, entity navigation, preview/cancel/confirm, cut success and failure,
refresh, final review, server refusal, advancement, loading, API retry and
missing reads/previews. Pure boundary tests cover phase alignment, rule
presentation, group availability and missing-value sorting.

The existing database-backed camp suite now also checks the full-board read,
group totals, fixtures/results, evaluation provenance and missing-contract
refusal. Its original complete-season, cut, cap, history and week-one assertions
are preserved.

tests/e2e/camp.spec.ts creates an isolated owner/save per browser, reaches camp
through real season and rollover routes, compares players, visits a profile,
plays preseason, cancels and confirms cuts, reviews the final roster and opens
regular-season play. It checks page overflow and saves screenshots at the
configured widths. DATABASE_URL must point to a disposable test database.

Run build, typecheck, lint, lint:arch, npm test, test:e2e and preflight using
the repository scripts. Environment-specific or inherited failures must be
reported separately; passing camp tests does not make the full baseline green.

## Preserved boundaries

No migration, package change, simulation-engine change, AI policy change,
avatar change, token change, global navigation redesign or unrelated screen
redesign is included. The server continues to own phase transitions, evaluations,
roster legality, finances, simulation and updates to both league representations.
All new production modules remain below the 400-line limit.
