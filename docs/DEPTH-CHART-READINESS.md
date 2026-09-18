# Depth chart and Week 1 readiness

The dedicated Depth Chart screen consumes server-authoritative position groups,
effective ordering, injuries and readiness. It is reachable from Roster, the
Team checklist, Play and Training Camp's Final Roster Review.

## Persisted model

The inherited depth-chart JSON document and set-depth-chart route remain the
model. Reads preserve valid stored order and append currently rostered additions
using the existing server default order, matching the week runner. Missing,
removed or invalid entries are explicitly described; a read never writes.

Every new UI mutation sends a revision of the current chart, roster, injuries,
calendar and effective ordering. The server locks the save, rejects stale
revisions with a conflict and verifies an exact eligible group permutation.
Existing callers without a revision remain compatible. A successful write
refreshes the chart; failed writes show the refusal and re-read authoritative
state rather than leaving an optimistic order displayed.

Move up/down controls are 44px keyboard-operable buttons. The server names
Starter, Backup, Reserve and Specialist roles from the actual STARTERS model,
including multiple starting slots within groups. Position eligibility is the
existing canonical group membership; this adds no position conversions.
The read accepts both the seed's OT/OG/C labels and generated players' OL label.
A browser test exposed the missing generated-label case; a shared API mapper
and a regression fixture now cover it without changing stored player positions.

Auto-order requires confirmation and reuses defaultDepthChart. It does not add
an AI ordering algorithm. The existing algorithm can include injured players;
warnings leave that decision with the manager rather than silently overriding it.

## Readiness and advancement

The server reuses rosterLimits and rosterFault. During final cuts, the existing
roster-count rule blocks entry unless the established commissioner exception
applies. Finalize calls the existing finalize-roster handler, which rechecks
legality. It does not simulate a game.

Unfilled starter places, no available cover, injured starters and an unpersisted
default chart are warnings. They are not newly invented advancement bans.
Regular-season roster-count mismatches are also advisory: the inherited
play-week route does not enforce the camp count gate.

Next game comes from the actual schedule. No fixture is explicitly reported,
not replaced by an invented opponent. Injury duration comes from existing
server injury data. Player rows use current production avatars, AbilityDial and
EntityLink; no duplicate player profile exists.

## Player flow

Training Camp -> Final Roster Review -> Set depth chart -> inspect readiness ->
order starters and cover -> explicitly finalize when the server allows ->
Week 1 Play preview. The existing Camp finalize path also remains available.
Returning from a player profile or roster view preserves the navigation frame.

## Tests and limits

Focused coverage verifies canonical groups, persisted order, stale roster
conflicts, invalid permutations, auto-order, injuries, confirmations, failure
refresh, navigation, missing data and finalization. The existing camp browser
journey now continues through blocked final review, roster cuts, Week 1 depth
ordering, reload persistence and a return to Play without advancing the week.

CPU starting charts were checked for group eligibility, duplicate entries and
required starting places. No CPU roster or ordering AI was changed.

Deferred: flexible position placement, specialized formation packages, manual
slot assignment across position groups and changes to inherited injury/auto-order
policy. The scalar group model and existing engine behavior are preserved.

Out-of-scope discovery: the older Camp read/evaluation paths still use a
seed-only lookup with an LS fallback for unknown labels. Their treatment of
generated OL players needs a separate correction; the new Depth/League reads
use the strict shared mapper and do not inherit that fallback.
