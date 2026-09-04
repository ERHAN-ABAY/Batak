/**
 * Core domain types for the Batak rule engine.
 *
 * Design note: all four well-known Turkish Batak contract types (koz,
 * kozsuz, gizli, elsiz) live inside ONE unified bidding auction. A table
 * never needs a separate "game mode" selector — which contract gets played
 * simply depends on what the players bid during that hand's auction. This
 * mirrors how real Turkish Batak sites work.
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
 * Bid types:
 *  - 'pas'    : player passes for this auction
 *  - 'koz'    : bids `value` tricks (5-13) and will name a trump suit if won
 *  - 'kozsuz' : bids `value` tricks (5-13), no trump suit for the whole hand
 *  - 'gizli'  : blind bid - commits to taking ALL 13 tricks, no trump,
 *               declared before rearranging/looking closely at the hand.
 *               Highest risk / highest reward contract.
 *  - 'elsiz'  : commits to taking ZERO tricks for the whole hand (no trump).
 */
export type BidType = 'pas' | 'koz' | 'kozsuz' | 'gizli' | 'elsiz';

export interface Bid {
  player: PlayerIndex;
  type: BidType;
  /** Trick target, only meaningful for 'koz' | 'kozsuz' (range MIN_BID..13). */
  value?: number;
}

export type GamePhase =
  | 'WAITING_FOR_PLAYERS'
  | 'BIDDING'
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
  type: 'koz' | 'kozsuz' | 'gizli' | 'elsiz';
  /** Trick target the declarer must reach (13 for gizli, 0 for elsiz). */
  target: number;
  trumpSuit: Suit | null;
}

export interface HandResult {
  handNumber: number;
  dealer: PlayerIndex;
  contract: Contract;
  tricksWon: Record<PlayerIndex, number>;
  scoreDelta: Record<PlayerIndex, number>;
}

export interface MatchConfig {
  /** Minimum trick count for a 'koz' / 'kozsuz' bid. */
  minBid: number;
  /** Point multiplier per trick for a 'koz' contract. */
  kozMultiplier: number;
  /** Point multiplier per trick for a 'kozsuz' contract. */
  kozsuzMultiplier: number;
  /** Point multiplier per trick for a successful/failed 'gizli' contract. */
  gizliMultiplier: number;
  /** Flat score awarded/deducted for a successful/failed 'elsiz' contract. */
  elsizPoints: number;
  /** Flat points earned per trick won by a non-declarer player. */
  pointsPerTrick: number;
  /** How many hands make up a full match. */
  handsPerMatch: number;

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
   * accepts 'koz' (and 'pas') bids - 'kozsuz' / 'gizli' / 'elsiz' are
   * disabled, and the winning declarer never chooses a suit; the
   * CHOOSING_TRUMP phase is skipped entirely.
   */
  fixedSpadesTrump: boolean;
}

export const DEFAULT_MATCH_CONFIG: MatchConfig = {
  minBid: 5,
  kozMultiplier: 10,
  kozsuzMultiplier: 20,
  gizliMultiplier: 40,
  elsizPoints: 100,
  pointsPerTrick: 10,
  handsPerMatch: 8,
  partnership: false,
  openHand: false,
  fixedSpadesTrump: false,
};
