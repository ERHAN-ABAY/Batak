import { Contract, MatchConfig, PLAYER_INDICES, PlayerIndex } from './types.js';

/**
 * Points for one target/taken pair under the table's `scoreMode` (§19 - a
 * direct port of the document's three named modes):
 *  - TakenMinusBidOnFail : made -> +taken tricks; failed -> -target
 *  - BidOnly              : made -> +target (overtricks ignored); failed -> -target
 *  - Multiplier10         : made -> target*10 + overtricks; failed -> -(target*10)
 */
function contractPoints(target: number, taken: number, config: MatchConfig): number {
  const made = taken >= target;
  if (made) {
    switch (config.scoreMode) {
      case 'BidOnly':
        return target;
      case 'Multiplier10':
        return target * 10 + (taken - target);
      case 'TakenMinusBidOnFail':
      default:
        return taken;
    }
  }
  switch (config.scoreMode) {
    case 'Multiplier10':
      return -(target * 10);
    case 'BidOnly':
    case 'TakenMinusBidOnFail':
    default:
      return -target;
  }
}

/**
 * Computes each player's score delta for one completed hand.
 *
 * Team variants (§6, §9): both teammates always receive the same delta,
 * judged against their team's target (if any) rather than either player's
 * individual trick count. Solo variants judge each player against their own
 * target. A player/team with no target for this hand (the non-declaring
 * side in an auction variant, or Koz Maça Mod A with no bidding at all)
 * simply banks their tricks taken 1-for-1 - there is no batma risk without
 * a target to fall short of.
 */
export function scoreHand(
  contract: Contract,
  tricksWon: Record<PlayerIndex, number>,
  config: MatchConfig
): Record<PlayerIndex, number> {
  const delta: Record<PlayerIndex, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };

  if (config.isTeamGame) {
    const teamSeats: Record<0 | 1, [PlayerIndex, PlayerIndex]> = { 0: [0, 2], 1: [1, 3] };
    for (const team of [0, 1] as const) {
      const [a, b] = teamSeats[team];
      const teamTricks = tricksWon[a] + tricksWon[b];
      const target = contract.teamTargets[team];
      const pts = target !== undefined ? contractPoints(target, teamTricks, config) : teamTricks;
      delta[a] = pts;
      delta[b] = pts;
    }
    return delta;
  }

  for (const p of PLAYER_INDICES) {
    const target = contract.targets[p];
    delta[p] = target !== undefined ? contractPoints(target, tricksWon[p], config) : tricksWon[p];
  }
  return delta;
}
