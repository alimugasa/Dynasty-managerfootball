// Phrasings.
//
// Two mechanisms keep a season of headlines from reading like one sentence
// repeated. Each story kind has a bank of templates dealt without replacement,
// so a phrasing cannot come round again until every other has been used. Inside
// a template, {@bank} slots pick from word lists, which multiplies each
// phrasing into many surface forms.
//
// The arithmetic matters: eight templates times four word banks of five entries
// is several hundred distinct sentences per kind before the teams and numbers
// are substituted at all.

export interface Template {
  /** Stable identity, so a deck can be dealt and a phrasing traced. */
  readonly id: string;
  readonly headline: string;
  readonly body: string;
}

/** Word banks, referenced as {@name}. */
export const BANKS: Readonly<Record<string, readonly string[]>> = {
  beat: ['beat', 'downed', 'saw off', 'got past', 'took down', 'upended'],
  stunned: ['stunned', 'shocked', 'ambushed', 'blindsided', 'floored'],
  surprise: ['surprise', 'shock', 'upset', 'turn-up'],
  run: ['run', 'streak', 'stretch', 'sequence', 'roll'],
  slide: ['slide', 'skid', 'rut', 'losing run', 'spiral'],
  rolling: ['rolling', 'humming', 'clicking', 'in gear', 'on song'],
  struggling: ['struggling', 'stuck', 'floundering', 'out of answers'],
  big: ['big', 'huge', 'enormous', 'monster', 'career'],
  /** Same idea without 'career', which only works about a performance. */
  sizeable: ['big', 'huge', 'thumping', 'sizeable'],
  posted: ['posted', 'put up', 'racked up', 'piled up', 'rolled up'],
  reached: ['reached', 'passed', 'crossed', 'hit', 'moved through'],
  blow: ['blow', 'setback', 'hit', 'knock'],
  pressure: ['pressure', 'heat', 'scrutiny', 'questions'],
  tight: ['tight', 'close', 'knife-edge', 'too close to call'],
  leads: ['leads', 'heads', 'tops', 'fronts'],
};

/**
 * Templates by kind.
 *
 * Slots in braces are filled from the fact; {@bank} slots are drawn from the
 * lists above. Every bank referenced here must exist -- a test walks every
 * template and fails on an unknown slot, because a missing bank would otherwise
 * ship as literal braces in a headline.
 */
export const TEMPLATES: Readonly<Record<string, readonly Template[]>> = {
  'upset.big': [
    { id: 'ub1', headline: '{winner} {@stunned} {loser} {winScore}-{loseScore}', body: '{loser} arrived as the stronger side on paper and left with nothing. {winner} led for most of the afternoon.' },
    { id: 'ub2', headline: '{@surprise} of the week as {winner} {@beat} {loser}', body: 'Few gave {winner} a chance. They won {winScore}-{loseScore} and were rarely troubled.' },
    { id: 'ub3', headline: '{winner} tear up the form book against {loser}', body: 'A {winScore}-{loseScore} win nobody forecast. {loser} had no answer after the interval.' },
    { id: 'ub4', headline: '{loser} come unstuck at {winner}', body: '{winner} won {winScore}-{loseScore}, and the margin flattered the visitors.' },
    { id: 'ub5', headline: 'No respect for reputation: {winner} {@beat} {loser}', body: '{winner} took the game to a far better-rated side and won {winScore}-{loseScore}.' },
    { id: 'ub6', headline: '{winner} {winScore}, {loser} {loseScore}', body: 'The scoreline reads like a misprint. It is not. {winner} were the better team throughout.' },
    { id: 'ub7', headline: '{loser} humbled by {winner}', body: 'A {@sizeable} {@surprise}. {winner} won {winScore}-{loseScore} and deserved more.' },
    { id: 'ub8', headline: '{winner} land the {@surprise} of the round', body: 'Down as heavy underdogs, {winner} beat {loser} {winScore}-{loseScore}.' },
  ],
  'upset.close': [
    { id: 'uc1', headline: '{winner} edge {loser} {winScore}-{loseScore}', body: 'A narrow win against a side rated well above them.' },
    { id: 'uc2', headline: '{winner} hold on against {loser}', body: 'It finished {winScore}-{loseScore}, and {loser} will feel they let one go.' },
    { id: 'uc3', headline: '{loser} slip up at {winner}', body: '{winner} did enough, winning {winScore}-{loseScore}.' },
    { id: 'uc4', headline: 'One score in it as {winner} {@beat} {loser}', body: 'A {winScore}-{loseScore} result that goes down as an {@surprise}.' },
    { id: 'uc5', headline: '{winner} find a way past {loser}', body: 'Not pretty, and not expected. {winScore}-{loseScore}.' },
    { id: 'uc6', headline: '{loser} undone late by {winner}', body: 'The visitors could not close it out. {winner} win {winScore}-{loseScore}.' },
  ],
  'streak.win': [
    { id: 'sw1', headline: '{team} make it {count} straight', body: '{team} are {@rolling} at {record}, and nobody in their division looks like stopping them.' },
    { id: 'sw2', headline: '{count}-game {@run} for {team}', body: 'The run has taken {team} to {record}.' },
    { id: 'sw3', headline: '{team} keep winning', body: 'A {count}th consecutive victory leaves them {record}.' },
    { id: 'sw4', headline: '{team} extend their {@run} to {count}', body: 'At {record}, {team} look {@rolling}.' },
    { id: 'sw5', headline: 'Nobody has an answer for {team}', body: '{count} wins on the spin, and a {record} record to show for it.' },
    { id: 'sw6', headline: '{team} roll on: {count} in a row', body: 'They sit {record} with the season half told.' },
  ],
  'streak.loss': [
    { id: 'sl1', headline: '{team} lose a {count}th straight', body: 'The {@slide} has left them {record} and asking hard questions.' },
    { id: 'sl2', headline: '{count}-game {@slide} for {team}', body: '{team} are {@struggling}, and {record} is the proof.' },
    { id: 'sl3', headline: 'No end in sight for {team}', body: 'A {count}th consecutive defeat drops them to {record}.' },
    { id: 'sl4', headline: '{team} cannot buy a win', body: '{count} straight losses. The record now reads {record}.' },
    { id: 'sl5', headline: 'The {@slide} continues at {team}', body: 'Beaten again, {team} fall to {record}.' },
    { id: 'sl6', headline: '{team} sink to {record}', body: 'That is {count} in a row, and the mood has turned.' },
  ],
  'milestone.game': [
    { id: 'mg1', headline: '{player} {@posted} {value} {statLabel}', body: 'A {@big} afternoon for the {team} {position}.' },
    { id: 'mg2', headline: '{@big} day for {player}: {value} {statLabel}', body: '{team} got exactly what they needed from their {position}.' },
    { id: 'mg3', headline: '{player} goes for {value} {statLabel}', body: 'One of the performances of the week from the {team} {position}.' },
    { id: 'mg4', headline: '{value} {statLabel} for {player}', body: 'The {team} {position} was unplayable.' },
    { id: 'mg5', headline: '{player} puts on a show', body: '{value} {statLabel} for the {team} {position}.' },
    { id: 'mg6', headline: '{team} ride {player} to {value} {statLabel}', body: 'The {position} carried them, and it was not close.' },
  ],
  'milestone.season': [
    { id: 'ms1', headline: '{player} {@reached} {value} {statLabel} for the season', body: 'The {team} {position} gets there in week {week}.' },
    { id: 'ms2', headline: '{value} {statLabel} and counting for {player}', body: 'A marker passed in week {week} by the {team} {position}.' },
    { id: 'ms3', headline: '{player} joins the {value} club', body: '{statLabel} for the season, with {remaining} games still to play.' },
    { id: 'ms4', headline: 'Milestone for {player}: {value} {statLabel}', body: 'The {team} {position} reached it in week {week}.' },
    { id: 'ms5', headline: '{player} moves through {value} {statLabel}', body: 'It has taken the {team} {position} {week} weeks.' },
    { id: 'ms6', headline: '{team} watch {player} pass {value} {statLabel}', body: 'A season that keeps building, with {remaining} to play.' },
  ],
  'injury.season': [
    { id: 'is1', headline: '{player} out for the season', body: 'A {@blow} for {team}, who lose their {position} for the rest of the year.' },
    { id: 'is2', headline: '{team} lose {player} for the year', body: 'The {position} will play no further part this season.' },
    { id: 'is3', headline: 'Season over for {player}', body: 'A serious {@blow} to {team} at {position}.' },
    { id: 'is4', headline: '{team} without {player} for the rest of the season', body: 'Losing a {position} of his standing reshapes what is possible here.' },
    { id: 'is5', headline: 'Long-term {@blow}: {player} done for the year', body: '{team} must now find another answer at {position}.' },
  ],
  'injury.major': [
    { id: 'im1', headline: '{player} sidelined {weeks} weeks', body: 'A {@blow} for {team}, who lose their {position} into the run-in.' },
    { id: 'im2', headline: '{team} lose {player} for {weeks} weeks', body: 'The {position} picked up the injury this week.' },
    { id: 'im3', headline: '{weeks}-week absence for {player}', body: '{team} will have to cover at {position}.' },
    { id: 'im4', headline: '{player} to miss {weeks} weeks', body: 'A {@blow} at {position} for {team}.' },
    { id: 'im5', headline: '{team} face {weeks} weeks without {player}', body: 'Their {position} is the latest to go down.' },
  ],
  'hot_seat.pressure': [
    { id: 'hp1', headline: '{@pressure} building on {coach}', body: '{team} are {record} against an expectation of {expected} wins. Year {tenure} is not going to plan.' },
    { id: 'hp2', headline: '{coach} under {@pressure} at {team}', body: 'At {record}, the gap to what this roster promised is hard to ignore.' },
    { id: 'hp3', headline: 'Questions for {coach}', body: '{team} sit {record}. The roster was built to win more than that.' },
    { id: 'hp4', headline: '{team} record puts {coach} in the spotlight', body: '{record} in year {tenure}, with {expected} wins the reasonable target.' },
    { id: 'hp5', headline: 'The seat warms under {coach}', body: '{team} are {record} and running out of season.' },
    { id: 'hp6', headline: '{coach} needs results at {team}', body: 'A {record} record has turned the {@pressure} up.' },
  ],
  'hot_seat.reprieve': [
    { id: 'hr1', headline: '{coach} answers the doubters', body: '{team} at {record} is comfortably beyond what this roster suggested.' },
    { id: 'hr2', headline: 'Case closed for now: {coach} has {team} at {record}', body: 'Against an expectation of {expected} wins, that is a season worth keeping.' },
    { id: 'hr3', headline: '{coach} turns it around', body: '{team} are {record} and the conversation has changed.' },
    { id: 'hr4', headline: 'Vindication for {coach}', body: 'A {record} record where {expected} wins was the honest forecast.' },
  ],
  'award.tight': [
    { id: 'at1', headline: '{award} race {@tight} between {leader} and {chaser}', body: '{leader} {@leads} on {value} {statLabel}, but only just.' },
    { id: 'at2', headline: 'Nothing between {leader} and {chaser} for the {award}', body: '{value} {statLabel} {@leads} it, with the margin down to almost nothing.' },
    { id: 'at3', headline: '{award}: {leader} holds off {chaser}', body: 'A {@tight} race, and {value} {statLabel} is what separates them.' },
    { id: 'at4', headline: 'Two-horse {award} race', body: '{leader} and {chaser} are stride for stride on {statLabel}.' },
    { id: 'at5', headline: '{leader} clings to the {award} lead', body: '{chaser} is close enough that one week could settle it.' },
  ],
  'award.clear': [
    { id: 'ac1', headline: '{leader} pulling clear in the {award} race', body: '{value} {statLabel} for the {team} man, and daylight behind.' },
    { id: 'ac2', headline: '{award} looks like {leader}’s to lose', body: 'A commanding lead on {statLabel}, at {value}.' },
    { id: 'ac3', headline: '{leader} {@leads} the {award} race comfortably', body: '{value} {statLabel} with the field some way back.' },
    { id: 'ac4', headline: 'Hard to look past {leader} for the {award}', body: '{value} {statLabel} and a margin nobody has closed.' },
    { id: 'ac5', headline: '{leader} sets the {award} standard', body: 'On {value} {statLabel}, the {team} man is the one to catch.' },
  ],
};

export const TEMPLATE_KINDS = Object.keys(TEMPLATES);
