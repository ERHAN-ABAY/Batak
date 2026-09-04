/**
 * Core domain types for the Batak rule engine.
 *
 * Design note: all Turkish Batak contract types (koz, gizli, elsiz) live
 * inside ONE unified bidding auction. A table never needs a separate "game
 * mode" selector — which contract gets played simply depends on what the
 * players bid during that hand's auction. This mirrors how real Turkish
 * Batak sites work. A trump suit is always chosen for every contract
 * (there is no no-trump "kozsuz" bid) except in "Maça" mode, where trump
 * is always forced to Spades.
 */

export type Suit = 'S' | 'H' | 'D' | 'C'; // Spades, Hearts, Diamonds, Clubs
export const SUITS: Suit[] = ['S', 'H', 'D', 'C'];

// 11=Jack, 12=Queen, 13=King, 14=Ace
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;
export const RANKS: Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

export interface Card {
  suit: Suit;
  rank: Rank;
}

export function cardId(card: Card): string {
  return `${card.rank}${card.suit}`;
}

export function cardsEqual(a: Card, b: Card): boolean {
  return a.suit === b.suit && a.rank === b.rank;
}

export type PlayerIndex = 0 | 1 | 2 | 3;
export const PLAYER_INDICES: PlayerIndex[] = [0, 1, 2, 3];

/** Fixed partnership seating: 0&2 are one team, 1&3 are the other. */
export function partnerOf(player: PlayerIndex): PlayerIndex {
  return ((player + 2) % 4) as PlayerIndex;
}

export function teamOf(player: PlayerIndex): 0 | 1 {
  return (player % 2) as 0 | 1;
}

/**
 * Bid types. A koz (trump) suit is ALWAYS chosen for the winning bid before
 * play starts (CHOOSING_TRUMP phase) - there is no no-trump ("kozsuz")
 * contract in this game; the only exception is "Maça" mode, where trump is
 * always forced to Spades automatically.
 *  - 'pas'   : player passes for this auction
 *  - 'koz'   : bids `value` tricks (5-13) and will name a trump suit if won
 *  - 'gizli' : blind bid - commits to taking ALL tricks, trump named after
 *              winning, declared before rearranging/looking closely at the
 *              hand. Highest risk / highest reward contract.
 *  - 'elsiz' : commits to taking ZERO tricks for the whole hand.
 */
export type BidType = 'pas' | 'koz' | 'gizli' | 'elsiz';

export interface Bid {
  player: PlayerIndex;
  type: BidType;
  /** Trick target, only meaningful for 'koz' (range minBid..maxBid). */
  value?: number;
}

export type GamePhase =
  | 'WAITING_FOR_PLAYERS'
  | 'BIDDING'
  | 'EXCHANGE'
  | 'CHOOSING_TRUMP'
  | 'PLAYING'
  | 'HAND_COMPLETE'
  | 'MATCH_COMPLETE';

export interface TrickCard {
  player: PlayerIndex;
  card: Card;
}

export interface Contract {
  declarer: PlayerIndex;
  type: 'koz' | 'gizli' | 'elsiz';
  /** Trick target the declarer must reach (maxBid for gizli, 0 for elsiz). */
  target: number;
  /** Always set once the contract is playable - trump is never optional. */
  trumpSuit: Suit | null;
}

export interface HandResult {
  handNumber: number;
  dealer: PlayerIndex;
  contract: Contract;
  tricksWon: Record<PlayerIndex, number>;
  scoreDelta: Record<PlayerIndex, number>;
}

/** How a successful (made) 'koz'/'gizli' contract is scored. */
export type ScoringMode = 'takenTricks' | 'bidOnly' | 'bidPlusOvertricks';
/** How a failed (batak) 'koz'/'gizli' contract is penalized. */
export type PenaltyMode = 'negativeBid' | 'negativeTaken' | 'fixedPenalty';
/** How a full match ends. */
export type GameEndMode = 'targetScore' | 'fixedHands';
/** What happens when all 4 players pass during the auction. */
export type AllPassAction = 'redeal' | 'dealerTakesMinimum';

export interface MatchConfig {
  /** Minimum trick count for a 'koz' bid. */
  minBid: number;
  /** Maximum trick count for a 'koz' bid (also the full hand size). */
  maxBid: number;

  /**
   * Declarer scoring on a MADE contract:
   *  - 'takenTricks'      : score += tricks actually taken (default; e.g. bid 7, took 9 -> +9)
   *  - 'bidOnly'           : score += the bid, overtricks ignored (bid 7, took 9 -> +7)
   *  - 'bidPlusOvertricks' : score += bid + overtrickPoints per trick beyond the bid
   */
  scoringMode: ScoringMode;
  /** Per-overtrick point value, only used when scoringMode = 'bidPlusOvertricks'. */
  overtrickPoints: number;
  /**
   * Declarer penalty on a FAILED (batak) contract:
   *  - 'negativeBid'   : score -= the bid (default; e.g. bid 8, took 5 -> -8)
   *  - 'negativeTaken' : score -= the shortfall (bid - taken)
   *  - 'fixedPenalty'  : score -= fixedPenaltyPoints, regardless of the bid
   */
  penaltyMode: PenaltyMode;
  /** Flat penalty, only used when penaltyMode = 'fixedPenalty'. */
  fixedPenaltyPoints: number;
  /**
   * Flat score awarded/deducted for a successful/failed 'elsiz' (0-trick)
   * contract - a plain taken-tricks formula is meaningless when the target
   * is zero, so elsiz always uses this dedicated flat value regardless of
   * scoringMode/penaltyMode. Not defined by the source spec; kept tunable.
   */
  elsizPoints: number;
  /** Flat points earned per trick won by a non-declarer (or non-declaring-team) player. */
  pointsPerTrick: number;

  /** How a match ends: reach `targetScore` (default) or play a fixed `handsPerMatch`. */
  gameEndMode: GameEndMode;
  /** Cumulative score that ends the match when gameEndMode = 'targetScore'. */
  targetScore: number;
  /** Hands per match when gameEndMode = 'fixedHands'. */
  handsPerMatch: number;

  /** What happens when all 4 players pass: redeal, or the dealer takes minBid automatically. */
  allPassAction: AllPassAction;

  /**
   * Must a player who is void in the led suit play a trump if they hold
   * one (cannot sluff a third suit while holding trump)? Default true.
   */
  mustTrumpWhenVoid: boolean;
  /**
   * Within whichever category you must play from (led suit, or trump when
   * void), must you play a card that beats the current best card of the
   * trick if you have one ("üstüne basma zorunluluğu")? Default true -
   * only when none of your eligible cards can beat the current best are
   * you free to play any of them (typically your smallest).
   */
  mustOvertrumpOrBeat: boolean;

  /**
   * "Eşli" mode: seats 0&2 are Team A, seats 1&3 are Team B. Contract
   * success/failure and trick points are scored per-team instead of
   * per-player (both teammates always end a hand with the same delta).
   */
  partnership: boolean;
  /**
   * "Açık" mode: once the auction resolves, the declarer's partner's hand
   * is revealed face-up to every player for the rest of the hand (bridge-
   * style dummy). Only meaningful when `partnership` is also true.
   */
  openHand: boolean;
  /**
   * "Maça" mode: trump is always forced to Spades. The auction only
   * accepts 'koz' (and 'pas') bids - 'gizli' / 'elsiz' are disabled, and
   * the winning declarer never chooses a suit; the CHOOSING_TRUMP phase
   * is skipped entirely.
   */
  fixedSpadesTrump: boolean;

  /**
   * "Gömmeli" mode: a kitty is set aside during dealing (so each player
   * gets fewer than 13 cards - (52-buriedCardCount)/4 each). Once the
   * auction resolves, the declarer picks up the kitty and must discard
   * back down to the normal hand size before trump selection/play
   * (GamePhase 'EXCHANGE'). `buriedCardCount` must be a multiple of 4 so
   * the remaining cards split evenly; maxBid is auto-derived from it.
   */
  buriedCards: boolean;
  /** Kitty size for Gömmeli mode. Must be a multiple of 4. */
  buriedCardCount: number;
}

export const DEFAULT_MATCH_CONFIG: MatchConfig = {
  minBid: 5,
  maxBid: 13,
  scoringMode: 'takenTricks',
  overtrickPoints: 1,
  penaltyMode: 'negativeBid',
  fixedPenaltyPoints: 10,
  elsizPoints: 20,
  pointsPerTrick: 1,
  gameEndMode: 'targetScore',
  targetScore: 101,
  handsPerMatch: 8,
  allPassAction: 'dealerTakesMinimum',
  mustTrumpWhenVoid: true,
  mustOvertrumpOrBeat: true,
  partnership: false,
  openHand: false,
  fixedSpadesTrump: false,
  buriedCards: false,
  buriedCardCount: 4,
};
