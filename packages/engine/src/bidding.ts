import { BatakErrorCode } from './errors.js';
import { Bid, MatchConfig } from './types.js';

export interface BidValidationResult {
  valid: boolean;
  code?: BatakErrorCode;
  reason?: string;
}

/**
 * Auction bid validation (NORMAL_BID/OPEN_BID/TEAM_BID/TEAM_OPEN_BID/
 * BURIED_BID, §12/§13): pas is always allowed, and any raise must be a
 * whole number strictly greater than the current highest bid (or at least
 * `minimumBid` if nobody has bid yet).
 */
export function validateAuctionBid(
  bid: Bid,
  currentHighestValue: number | null,
  config: MatchConfig
): BidValidationResult {
  if (bid.type === 'pas') {
    if (!config.canPass) {
      return { valid: false, code: 'INVALID_BID', reason: 'bu varyantta pas geçilemez' };
    }
    return { valid: true };
  }

  const v = bid.value;
  if (v === undefined || !Number.isInteger(v)) {
    return { valid: false, code: 'INVALID_BID', reason: 'value must be an integer' };
  }
  if (v < config.minimumBid) {
    return { valid: false, code: 'BID_TOO_LOW', reason: `value must be at least ${config.minimumBid}` };
  }
  if (v > config.maximumBid) {
    return { valid: false, code: 'BID_TOO_HIGH', reason: `value must be at most ${config.maximumBid}` };
  }

  const floor = currentHighestValue ?? config.minimumBid - 1;
  if (v <= floor) {
    return { valid: false, code: 'BID_TOO_LOW', reason: 'bid does not exceed the current highest bid' };
  }

  return { valid: true };
}

/**
 * Koz Maça taahhütlü commitment validation (§8 Mod B / §9): each player
 * independently names a personal trick target - no comparison against
 * other players is involved, just the variant's min/max range.
 */
export function validateCommitment(value: number | undefined, config: MatchConfig): BidValidationResult {
  if (value === undefined || !Number.isInteger(value)) {
    return { valid: false, code: 'INVALID_BID', reason: 'value must be an integer' };
  }
  if (value < config.minimumBid) {
    return { valid: false, code: 'BID_TOO_LOW', reason: `value must be at least ${config.minimumBid}` };
  }
  if (value > config.maximumBid) {
    return { valid: false, code: 'BID_TOO_HIGH', reason: `value must be at most ${config.maximumBid}` };
  }
  return { valid: true };
}
