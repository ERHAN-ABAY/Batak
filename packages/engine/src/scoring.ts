import { Contract, MatchConfig, PLAYER_INDICES, PlayerIndex, partnerOf, teamOf } from './types.js';

/**
 * Computes each player's score delta for one completed hand.
 * Dispatches to solo or partnership scoring based on config.partnership.
 */
export function scoreHand(
  contract: Contract,
  tricksWon: Record<PlayerIndex, number>,
  config: MatchConfig
): Record<PlayerIndex, number> {
  return config.partnership
    ? scoreHandPartnership(contract, tricksWon, config)
    : scoreHandSolo(contract, tricksWon, config);
}

/**
 * Score for the declaring side (player or team) against their contract.
 * 'elsiz' (0-trick) contracts always use the dedicated flat elsizPoints,
 * since a taken-tricks/bid-based formula is meaningless when the target
 * is zero. Everything else follows config.scoringMode / config.penaltyMode.
 */
function contractPoints(
  type: Contract['type'],
  target: number,
  tricksTakenByContractSide: number,
  config: MatchConfig
): number {
  if (type === 'elsiz') {
    return (tricksTakenByContractSide === 0 ? 1 : -1) * config.elsizPoints;
  }

  const made = tricksTakenByContractSide >= target;
  if (made) {
    switch (config.scoringMode) {
      case 'bidOnly':
        return target;
      case 'bidPlusOvertricks':
        return target + (tricksTakenByContractSide - target) * config.overtrickPoints;
      case 'takenTricks':
      default:
        return tricksTakenByContractSide;
    }
  }

  switch (config.penaltyMode) {
    case 'negativeTaken':
      return -(target - tricksTakenByContractSide);
    case 'fixedPenalty':
      return -config.fixedPenaltyPoints;
    case 'negativeBid':
    default:
      return -target;
  }
}

/**
 * Solo scoring: the declarer alone is judged against the contract; every
 * other player simply banks `pointsPerTrick` for each trick they personally
 * won. (The source spec only defines declarer scoring - the non-declarer
 * per-trick bonus is our own tunable addition.)
 */
function scoreHandSolo(
  contract: Contract,
  tricksWon: Record<PlayerIndex, number>,
  config: MatchConfig
): Record<PlayerIndex, number> {
  const delta: Record<PlayerIndex, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };

  for (const p of PLAYER_INDICES) {
    if (p === contract.declarer) continue;
    delta[p] = tricksWon[p] * config.pointsPerTrick;
  }

  delta[contract.declarer] = contractPoints(
    contract.type,
    contract.target,
    tricksWon[contract.declarer],
    config
  );

  return delta;
}

/**
 * Partnership ("eşli") scoring: the declarer bids on behalf of their whole
 * team. The declarer + their partner's combined tricks are judged against
 * the contract, and both teammates receive the same delta. The opposing
 * team banks `pointsPerTrick` for their combined tricks, split equally
 * (i.e. both opponents get the same delta too).
 */
function scoreHandPartnership(
  contract: Contract,
  tricksWon: Record<PlayerIndex, number>,
  config: MatchConfig
): Record<PlayerIndex, number> {
  const delta: Record<PlayerIndex, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };

  const declarer = contract.declarer;
  const partner = partnerOf(declarer);
  const declarerTeamTricks = tricksWon[declarer] + tricksWon[partner];

  const opponents = PLAYER_INDICES.filter((p) => teamOf(p) !== teamOf(declarer));
  const opponentTricks = opponents.reduce((sum: number, p) => sum + tricksWon[p], 0);
  const opponentPoints = opponentTricks * config.pointsPerTrick;
  for (const p of opponents) delta[p] = opponentPoints;

  const declarerTeamPoints = contractPoints(contract.type, contract.target, declarerTeamTricks, config);
  delta[declarer] = declarerTeamPoints;
  delta[partner] = declarerTeamPoints;

  return delta;
}
