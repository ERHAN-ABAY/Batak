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

function contractPoints(
  type: Contract['type'],
  target: number,
  tricksTakenByContractSide: number,
  config: MatchConfig
): number {
  switch (type) {
    case 'koz':
      return (tricksTakenByContractSide >= target ? 1 : -1) * target * config.kozMultiplier;
    case 'kozsuz':
      return (tricksTakenByContractSide >= target ? 1 : -1) * target * config.kozsuzMultiplier;
    case 'gizli':
      return (tricksTakenByContractSide === 13 ? 1 : -1) * 13 * config.gizliMultiplier;
    case 'elsiz':
      return (tricksTakenByContractSide === 0 ? 1 : -1) * config.elsizPoints;
  }
}

/**
 * Solo scoring: the declarer alone is judged against the contract; every
 * other player simply banks `pointsPerTrick` for each trick they personally
 * won. (Deliberately simple, tunable house rule - see MatchConfig.)
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
