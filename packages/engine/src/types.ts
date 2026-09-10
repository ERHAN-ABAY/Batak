/**
 * Core domain types for the Batak rule engine.
 *
 * Design note: this engine is built directly around the variant system
 * defined in BATAK_DETAYLI_KURALLAR_VE_OYUN_TIPLERI.md. Each table picks one
 * `VariantId` (section 27); the concrete rules for that variant are captured
 * by an `IBatakRuleSet` (section 26) plus a handful of tunable extras
 * (section 31). The engine never branches on variant name internally -
 * everything reads from the resolved `MatchConfig`.
 */

export type Suit = 'S' | 'H' | 'D' | 'C'; // Maça, Kupa, Karo, Sinek
export const SUITS: Suit[] = ['S', 'H', 'D', 'C'];

// 11=Vale, 12=Kız, 13=Papaz, 14=As
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

/** Fixed partnership seating: 0&2 are one team, 1&3 are the other (§6). */
export function partnerOf(player: PlayerIndex): PlayerIndex {
  return ((player + 2) % 4) as PlayerIndex;
}

export function teamOf(player: PlayerIndex): 0 | 1 {
  return (player % 2) as 0 | 1;
}

/** The seven variant IDs defined in §27 of the rules document. */
export type VariantId =
  | 'NORMAL_BID'
  | 'OPEN_BID'
  | 'TEAM_BID'
  | 'TEAM_OPEN_BID'
  | 'SPADES'
  | 'TEAM_SPADES'
  | 'BURIED_BID';

export const VARIANT_IDS: VariantId[] = [
  'NORMAL_BID',
  'OPEN_BID',
  'TEAM_BID',
  'TEAM_OPEN_BID',
  'SPADES',
  'TEAM_SPADES',
  'BURIED_BID',
];

/**
 * The shared rule-set contract every variant implements (§26). Kept as a
 * literal port of the document's `IBatakRuleSet` interface (field-for-field)
 * so the mapping to the source spec stays obvious.
 */
export interface IBatakRuleSet {
  playerCount: number;
  cardsPerPlayer: number;
  totalTricks: number;
  minimumBid: number;
  maximumBid: number;

  isTeamGame: boolean;
  isOpenBidding: boolean;
  mustFollowSuit: boolean;
  canPass: boolean;
  bidWinnerChoosesTrump: boolean;
  bidWinnerStarts: boolean;

  fixedTrump: Suit | null;
}

/**
 * A bid during the auction (NORMAL_BID/OPEN_BID/TEAM_BID/TEAM_OPEN_BID/
 * BURIED_BID) or a personal commitment during Koz Maça taahhütlü bidding
 * (SPADES/TEAM_SPADES, §8 Mod B / §9) - both flows share this shape:
 * `pas` only exists in the competitive auction, a commitment is always a
 * `bid` with a `value`.
 */
export type BidType = 'pas' | 'bid';

export interface Bid {
  player: PlayerIndex;
  type: BidType;
  /** Trick target, required when type='bid' (range minimumBid..maximumBid). */
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
  /** The auction winner for auction-style variants; null for commitment-style Koz Maça deals with no single winner. */
  declarer: PlayerIndex | null;
  /** Always set once the contract is playable - a trump suit is required for every contract (§4, §7). */
  trumpSuit: Suit | null;
  /**
   * Per-player trick target. Populated for the declarer in solo auction
   * variants, or for every seat in Koz Maça taahhütlü mode (§8 Mod B). A
   * missing entry means "no personal target" (flat trick-count scoring).
   */
  targets: Partial<Record<PlayerIndex, number>>;
  /**
   * Per-team trick target (§6, §9). Populated for the declaring team in
   * team auction variants, or for both teams in Eşli Koz Maça. A missing
   * entry means that team has no target of its own.
   */
  teamTargets: Partial<Record<0 | 1, number>>;
}

export interface HandResult {
  handNumber: number;
  dealer: PlayerIndex;
  variantId: VariantId;
  contract: Contract;
  tricksWon: Record<PlayerIndex, number>;
  scoreDelta: Record<PlayerIndex, number>;
}

/** How a made/failed contract is scored (§19 - a direct port of the document's three named modes). */
export type ScoreMode = 'TakenMinusBidOnFail' | 'BidOnly' | 'Multiplier10';
/** How a full match ends (§18). */
export type GameEndMode = 'targetScore' | 'fixedHands';
/** What happens when every player passes during an auction (§6.4/§12). */
export type AllPassAction = 'redeal' | 'dealerTakesMinimum';
/** Koz Maça Eşli's two team-bidding shapes (§9). */
export type TeamBidMode = 'individualSum' | 'directTeam';
/** How the current auction/commitment round is driven. */
export type BiddingStyle = 'auction' | 'commitment' | 'none';

/**
 * Full per-table configuration: the variant's `IBatakRuleSet` plus the
 * tunable extras §31 calls out ("Özellikle şu değerler konfigüre edilebilir
 * olmalıdır"). Always built via `createMatchConfig()` - never hand-rolled -
 * so the identity fields (playerCount, fixedTrump, isTeamGame, ...) stay
 * consistent with the chosen `variantId`.
 */
export interface MatchConfig extends IBatakRuleSet {
  variantId: VariantId;
  biddingStyle: BiddingStyle;

  scoreMode: ScoreMode;
  gameEndMode: GameEndMode;
  targetScore: number;
  maxRounds: number;
  allPassAction: AllPassAction;

  /** Gömmeli mode (BURIED_BID only, §10). */
  buriedCards: boolean;
  buriedCardCount: number;

  /** Koz Maça Mod A ("İhalesiz", §8) vs Mod B ("Taahhütlü", §8) - SPADES/TEAM_SPADES only. */
  spadesBiddingEnabled: boolean;
  /** Eşli Koz Maça's two submodes (§9) - TEAM_SPADES only. */
  teamBidMode: TeamBidMode;

  reconnectSeconds: number;
  botTakeoverSeconds: number;
}
