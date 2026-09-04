import { Bid, MatchConfig } from './types.js';

/**
 * Strength ordering for the auction. Each new (non-pass) bid must strictly
 * exceed the current highest bid's strength.
 *
 *   koz(v)    -> v*10          (50..130 for v in 5..13)
 *   kozsuz(v) -> v*10 + 5      (55..135) - same trick count beats a colored bid
 *   elsiz     -> 140           - committing to zero tricks is very hard to pull off
 *   gizli     -> 200           - blind 13-trick bid, the strongest possible contract
 */
export function bidStrength(bid: Bid, config: MatchConfig): number {
  switch (bid.type) {
    case 'pas':
      return -1;
    case 'koz':
      return (bid.value ?? 0) * 10;
    case 'kozsuz':
      return (bid.value ?? 0) * 10 + 5;
    case 'elsiz':
      return 140;
    case 'gizli':
      return 200;
    default:
      return -1;
  }
}

export interface BidValidationResult {
  valid: boolean;
  reason?: string;
}

export function validateBid(
  bid: Bid,
  currentHighest: Bid | null,
  config: MatchConfig
): BidValidationResult {
  if (bid.type === 'pas') {
    return { valid: true };
  }

  if (config.fixedSpadesTrump && bid.type !== 'koz') {
    return {
      valid: false,
      reason: 'bu masada koz her zaman maça - sadece koz veya pas teklif edilebilir',
    };
  }

  if (bid.type === 'koz' || bid.type === 'kozsuz') {
    const v = bid.value;
    if (v === undefined || !Number.isInteger(v) || v < config.minBid || v > config.maxBid) {
      return {
        valid: false,
        reason: `value must be an integer between ${config.minBid} and ${config.maxBid}`,
      };
    }
  }

  const strength = bidStrength(bid, config);
  const currentStrength = currentHighest ? bidStrength(currentHighest, config) : -1;
  if (strength <= currentStrength) {
    return { valid: false, reason: 'bid does not exceed the current highest bid' };
  }

  return { valid: true };
}

/** Resolves the target trick count implied by a winning (non-pass) bid. */
export function targetForBid(bid: Bid, config: MatchConfig): number {
  switch (bid.type) {
    case 'gizli':
      return config.maxBid;
    case 'elsiz':
      return 0;
    case 'koz':
    case 'kozsuz':
      return bid.value ?? 0;
    default:
      return 0;
  }
}
