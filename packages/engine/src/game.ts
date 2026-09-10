import { validateAuctionBid, validateCommitment } from './bidding.js';
import { deal, sortHand } from './deck.js';
import { BatakError } from './errors.js';
import { scoreHand } from './scoring.js';
import { isLegalPlay, legalPlays, trickWinner } from './trick.js';
import {
  Bid,
  Card,
  Contract,
  GameEndMode,
  GamePhase,
  HandResult,
  MatchConfig,
  PLAYER_INDICES,
  PlayerIndex,
  ScoreMode,
  Suit,
  TrickCard,
  VariantId,
  cardsEqual,
  partnerOf,
  teamOf,
} from './types.js';

export interface PlayerInfo {
  id: string;
  name: string;
}

export interface PublicPlayerState {
  id: string;
  name: string;
  cardCount: number;
  score: number;
  hasPassed: boolean;
  hasCommitted: boolean;
}

/** A trimmed-down, client-facing view of the table's `MatchConfig` (§26/§31). */
export interface PublicRuleSet {
  variantId: VariantId;
  isTeamGame: boolean;
  isOpenBidding: boolean;
  fixedTrump: Suit | null;
  minimumBid: number;
  maximumBid: number;
  buriedCards: boolean;
  buriedCardCount: number;
  scoreMode: ScoreMode;
  biddingStyle: MatchConfig['biddingStyle'];
  teamBidMode: MatchConfig['teamBidMode'];
}

export interface OpenHandInfo {
  player: PlayerIndex;
  cards: Card[];
}

export interface PublicState {
  phase: GamePhase;
  handNumber: number;
  maxRounds: number;
  gameEndMode: GameEndMode;
  targetScore: number;
  dealer: PlayerIndex;
  ruleSet: PublicRuleSet;
  players: Record<PlayerIndex, PublicPlayerState>;
  hand: Card[]; // requesting player's own hand only (empty for spectators)
  isSpectator: boolean;
  bids: Bid[];
  highestBid: Bid | null;
  currentBidder: PlayerIndex | null;
  contract: Contract | null;
  /** "Koz kırılmadan koz ile çıkılamaz" - whether trump may currently be led. */
  trumpBroken: boolean;
  currentTrick: TrickCard[];
  turn: PlayerIndex | null;
  lastCompletedTrick: TrickCard[] | null;
  tricksWon: Record<PlayerIndex, number>;
  lastHandResult: HandResult | null;
  /** Every completed hand this match, oldest first - for a running score-by-hand table. */
  handHistory: HandResult[];
  matchWinner: PlayerIndex | null;
  /**
   * §5's "Açık İhale" reveal: once the declarer picks trump, the hand of
   * the seat across from them (partnerOf(declarer)) is turned face-up for
   * everyone - "ihaleye giren kişi koz seçene kadar karşı el açılmaz, koz
   * belirlendikten sonra diğerleri açık eli görür". Only set for
   * OPEN_BID/TEAM_OPEN_BID (isOpenBidding), and only after CHOOSING_TRUMP
   * resolves.
   */
  openHand: OpenHandInfo | null;
}

export class Game {
  readonly config: MatchConfig;
  readonly players: Record<PlayerIndex, PlayerInfo>;
  scores: Record<PlayerIndex, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
  handHistory: HandResult[] = [];

  dealer: PlayerIndex = 0;
  handNumber = 0;
  phase: GamePhase = 'WAITING_FOR_PLAYERS';
  matchWinner: PlayerIndex | null = null;

  private hands: Record<PlayerIndex, Card[]> = { 0: [], 1: [], 2: [], 3: [] };

  // Auction state (biddingStyle='auction').
  private bids: Bid[] = [];
  private highestBid: { player: PlayerIndex; value: number } | null = null;
  private passedPlayers = new Set<PlayerIndex>();

  // Commitment state (biddingStyle='commitment', Koz Maça taahhütlü).
  private commitments: Partial<Record<PlayerIndex, number>> = {};

  private currentBidder: PlayerIndex | null = null;

  private contract: Contract | null = null;
  private trickLeader: PlayerIndex = 0;
  private currentTrick: TrickCard[] = [];
  private completedTricks: TrickCard[][] = [];
  /** "Koz kırılmadan koz ile çıkılamaz": becomes true the first time a trump card is played this hand. */
  private trumpBroken = false;
  private tricksWon: Record<PlayerIndex, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
  private lastHandResult: HandResult | null = null;
  private kitty: Card[] = [];
  private openHandPlayer: PlayerIndex | null = null;

  /** `config` must be a fully-resolved `MatchConfig`, built via `createMatchConfig()`. */
  constructor(players: Record<PlayerIndex, PlayerInfo>, config: MatchConfig) {
    this.players = players;
    this.config = config;
  }

  startHand(seed?: number): void {
    if (this.phase === 'MATCH_COMPLETE') {
      throw new BatakError('MATCH_ALREADY_COMPLETE', 'match already complete');
    }
    this.handNumber += 1;
    const { hands, kitty } = deal(this.dealer, this.config.cardsPerPlayer, seed);
    this.hands = hands;
    this.kitty = kitty;
    this.bids = [];
    this.highestBid = null;
    this.passedPlayers = new Set();
    this.commitments = {};
    const leftOfDealer = ((this.dealer + 1) % 4) as PlayerIndex;
    this.currentBidder = leftOfDealer;
    this.contract = null;
    this.trickLeader = leftOfDealer;
    this.currentTrick = [];
    this.completedTricks = [];
    this.tricksWon = { 0: 0, 1: 0, 2: 0, 3: 0 };
    this.lastHandResult = null;
    this.openHandPlayer = null;
    this.trumpBroken = false;

    if (this.config.biddingStyle === 'none') {
      // Koz Maça Mod A (İhalesiz, §8): no auction at all - straight to play.
      this.contract = { declarer: null, trumpSuit: this.config.fixedTrump, targets: {}, teamTargets: {} };
      this.currentBidder = null;
      this.phase = 'PLAYING';
    } else {
      this.phase = 'BIDDING';
    }
  }

  getHand(player: PlayerIndex): Card[] {
    return sortHand(this.hands[player]);
  }

  submitBid(player: PlayerIndex, bid: Bid): void {
    if (this.phase !== 'BIDDING') throw new BatakError('BIDDING_NOT_ACTIVE', 'not in bidding phase');
    if (this.currentBidder !== player) throw new BatakError('NOT_PLAYER_TURN', "not this player's turn to bid");

    if (this.config.biddingStyle === 'commitment') {
      this.submitCommitment(player, bid);
    } else {
      this.submitAuctionBid(player, bid);
    }
  }

  private submitAuctionBid(player: PlayerIndex, bid: Bid): void {
    if (this.passedPlayers.has(player)) throw new BatakError('ALREADY_PASSED', 'player already passed');

    const currentValue = this.highestBid?.value ?? null;
    const result = validateAuctionBid(bid, currentValue, this.config);
    if (!result.valid) throw new BatakError(result.code ?? 'INVALID_BID', result.reason ?? 'invalid bid');

    this.bids.push({ ...bid, player });

    if (bid.type === 'pas') {
      this.passedPlayers.add(player);
    } else {
      this.highestBid = { player, value: bid.value! };
    }

    if (this.passedPlayers.size === 4) {
      if (this.config.allPassAction === 'dealerTakesMinimum') {
        const autoBid: Bid = { player: this.dealer, type: 'bid', value: this.config.minimumBid };
        this.bids.push(autoBid);
        this.resolveAuction(this.dealer, this.config.minimumBid);
      } else {
        // redeal - dealer rotates, this hand never counted
        this.dealer = ((this.dealer + 1) % 4) as PlayerIndex;
        this.handNumber -= 1;
        this.startHand();
      }
      return;
    }

    if (this.passedPlayers.size === 3 && this.highestBid) {
      this.resolveAuction(this.highestBid.player, this.highestBid.value);
      return;
    }

    this.advanceBidder();
  }

  private submitCommitment(player: PlayerIndex, bid: Bid): void {
    if (bid.type !== 'bid') throw new BatakError('INVALID_BID', 'bu varyantta pas geçilemez, bir sayı söylemelisin');

    const result = validateCommitment(bid.value, this.config);
    if (!result.valid) throw new BatakError(result.code ?? 'INVALID_BID', result.reason ?? 'invalid bid');

    this.bids.push({ ...bid, player });
    this.commitments[player] = bid.value!;

    // Eşli Koz Maça "takım doğrudan taahhüdü" (§9): one teammate speaks for the whole team.
    if (this.config.isTeamGame && this.config.teamBidMode === 'directTeam') {
      this.commitments[partnerOf(player)] = bid.value!;
    }

    const allCommitted = PLAYER_INDICES.every((p) => this.commitments[p] !== undefined);
    if (allCommitted) {
      this.resolveCommitments();
      return;
    }

    this.advanceBidder();
  }

  private advanceBidder(): void {
    let next = ((this.currentBidder! + 1) % 4) as PlayerIndex;
    const alreadyDone = (p: PlayerIndex) =>
      this.passedPlayers.has(p) || (this.config.biddingStyle === 'commitment' && this.commitments[p] !== undefined);
    while (alreadyDone(next)) {
      next = ((next + 1) % 4) as PlayerIndex;
    }
    this.currentBidder = next;
  }

  private resolveAuction(declarer: PlayerIndex, value: number): void {
    this.contract = {
      declarer,
      trumpSuit: null,
      targets: { [declarer]: value },
      teamTargets: this.config.isTeamGame ? { [teamOf(declarer)]: value } : {},
    };
    this.currentBidder = null;

    if (this.config.buriedCards && this.kitty.length > 0) {
      // Declarer picks up the kitty and must discard back down (EXCHANGE phase, §10).
      this.hands[declarer] = [...this.hands[declarer], ...this.kitty];
      this.kitty = [];
      this.phase = 'EXCHANGE';
      return;
    }

    this.enterTrumpOrPlay(declarer);
  }

  private resolveCommitments(): void {
    this.currentBidder = null;
    const targets = { ...this.commitments };
    let teamTargets: Partial<Record<0 | 1, number>> = {};
    if (this.config.isTeamGame) {
      teamTargets =
        this.config.teamBidMode === 'directTeam'
          ? { 0: this.commitments[0]!, 1: this.commitments[1]! }
          : { 0: this.commitments[0]! + this.commitments[2]!, 1: this.commitments[1]! + this.commitments[3]! };
    }
    this.contract = { declarer: null, trumpSuit: this.config.fixedTrump, targets, teamTargets };
    this.trickLeader = ((this.dealer + 1) % 4) as PlayerIndex;
    this.phase = 'PLAYING';
  }

  /** Every contract always names a trump suit before play - there is no no-trump contract (§4, §7). */
  private enterTrumpOrPlay(declarer: PlayerIndex): void {
    if (this.config.fixedTrump) {
      this.contract!.trumpSuit = this.config.fixedTrump;
      this.phase = 'PLAYING';
      if (this.config.bidWinnerStarts) this.trickLeader = declarer;
    } else {
      this.phase = 'CHOOSING_TRUMP';
    }
  }

  /** Gömmeli mode: declarer discards `buriedCardCount` cards after picking up the kitty (§10). */
  exchangeCards(player: PlayerIndex, discards: Card[]): void {
    if (this.phase !== 'EXCHANGE') throw new BatakError('NOT_EXCHANGE_PHASE', 'not in the exchange phase');
    if (!this.contract || this.contract.declarer !== player) {
      throw new BatakError('NOT_DECLARER', 'only the declarer exchanges cards');
    }
    if (discards.length !== this.config.buriedCardCount) {
      throw new BatakError(
        'INVALID_EXCHANGE',
        `must discard exactly ${this.config.buriedCardCount} cards`
      );
    }
    const hand = this.hands[player];
    const remaining = hand.slice();
    for (const d of discards) {
      const idx = remaining.findIndex((c) => cardsEqual(c, d));
      if (idx === -1) throw new BatakError('CARD_NOT_IN_HAND', 'discarded card not in hand');
      remaining.splice(idx, 1);
    }
    this.hands[player] = remaining;
    this.enterTrumpOrPlay(player);
  }

  chooseTrump(player: PlayerIndex, suit: Suit): void {
    if (this.phase !== 'CHOOSING_TRUMP') throw new BatakError('NOT_CHOOSING_TRUMP', 'not choosing trump right now');
    if (!this.contract || this.contract.declarer !== player) {
      throw new BatakError('NOT_DECLARER', 'only the declarer can choose trump');
    }
    this.contract.trumpSuit = suit;
    if (this.config.bidWinnerStarts) this.trickLeader = player;
    if (this.config.isOpenBidding) this.openHandPlayer = partnerOf(player);
    this.phase = 'PLAYING';
  }

  whoseTurn(): PlayerIndex | null {
    if (this.phase === 'BIDDING') return this.currentBidder;
    if (this.phase === 'EXCHANGE' || this.phase === 'CHOOSING_TRUMP') return this.contract?.declarer ?? null;
    if (this.phase === 'PLAYING') {
      return ((this.trickLeader + this.currentTrick.length) % 4) as PlayerIndex;
    }
    return null;
  }

  /** Legal cards for `player` to play right now (empty outside the PLAYING phase). */
  getLegalPlays(player: PlayerIndex): Card[] {
    if (this.phase !== 'PLAYING' || this.whoseTurn() !== player) return [];
    return legalPlays(this.hands[player], this.currentTrick, this.contract!.trumpSuit, this.trumpBroken);
  }

  playCard(player: PlayerIndex, card: Card): void {
    if (this.phase !== 'PLAYING') throw new BatakError('WRONG_PHASE', 'not in playing phase');
    if (this.whoseTurn() !== player) throw new BatakError('NOT_PLAYER_TURN', "not this player's turn to play");

    const hand = this.hands[player];
    const inHand = hand.some((c) => cardsEqual(c, card));
    if (!inHand) throw new BatakError('CARD_NOT_IN_HAND', 'card not in hand');
    if (!isLegalPlay(card, hand, this.currentTrick, this.contract!.trumpSuit, this.trumpBroken)) {
      throw new BatakError('MUST_FOLLOW_SUIT', 'illegal play: must follow suit if possible');
    }

    if (this.contract!.trumpSuit && card.suit === this.contract!.trumpSuit) this.trumpBroken = true;

    this.hands[player] = hand.filter((c) => !cardsEqual(c, card));
    this.currentTrick.push({ player, card });

    if (this.currentTrick.length === 4) {
      const winner = trickWinner(this.currentTrick, this.contract!.trumpSuit);
      this.tricksWon[winner] += 1;
      this.completedTricks.push(this.currentTrick);
      this.trickLeader = winner;
      this.currentTrick = [];

      const cardsLeft = PLAYER_INDICES.some((p) => this.hands[p].length > 0);
      if (!cardsLeft) {
        this.finishHand();
      }
    }
  }

  private finishHand(): void {
    const delta = scoreHand(this.contract!, this.tricksWon, this.config);
    for (const p of PLAYER_INDICES) {
      this.scores[p] += delta[p];
    }
    const result: HandResult = {
      handNumber: this.handNumber,
      dealer: this.dealer,
      variantId: this.config.variantId,
      contract: this.contract!,
      tricksWon: { ...this.tricksWon },
      scoreDelta: delta,
    };
    this.handHistory.push(result);
    this.lastHandResult = result;
    this.dealer = ((this.dealer + 1) % 4) as PlayerIndex;

    const matchOver =
      this.config.gameEndMode === 'targetScore'
        ? PLAYER_INDICES.some((p) => this.scores[p] >= this.config.targetScore)
        : this.handNumber >= this.config.maxRounds;

    if (matchOver) {
      this.phase = 'MATCH_COMPLETE';
      let best: PlayerIndex = 0;
      for (const p of PLAYER_INDICES) {
        if (this.scores[p] > this.scores[best]) best = p;
      }
      this.matchWinner = best;
    } else {
      this.phase = 'HAND_COMPLETE';
    }
  }

  getLastCompletedTrick(): TrickCard[] | null {
    return this.completedTricks.length > 0
      ? this.completedTricks[this.completedTricks.length - 1]
      : null;
  }

  /** Pass `forPlayer: null` for a spectator view - no hand is revealed. */
  getPublicState(forPlayer: PlayerIndex | null): PublicState {
    const players: Record<PlayerIndex, PublicPlayerState> = {} as any;
    for (const p of PLAYER_INDICES) {
      players[p] = {
        id: this.players[p]?.id ?? '',
        name: this.players[p]?.name ?? '',
        cardCount: this.hands[p]?.length ?? 0,
        score: this.scores[p],
        hasPassed: this.passedPlayers.has(p),
        hasCommitted: this.commitments[p] !== undefined,
      };
    }

    const highestBidAsBid: Bid | null = this.highestBid
      ? { player: this.highestBid.player, type: 'bid', value: this.highestBid.value }
      : null;

    return {
      phase: this.phase,
      handNumber: this.handNumber,
      maxRounds: this.config.maxRounds,
      gameEndMode: this.config.gameEndMode,
      targetScore: this.config.targetScore,
      dealer: this.dealer,
      ruleSet: {
        variantId: this.config.variantId,
        isTeamGame: this.config.isTeamGame,
        isOpenBidding: this.config.isOpenBidding,
        fixedTrump: this.config.fixedTrump,
        minimumBid: this.config.minimumBid,
        maximumBid: this.config.maximumBid,
        buriedCards: this.config.buriedCards,
        buriedCardCount: this.config.buriedCardCount,
        scoreMode: this.config.scoreMode,
        biddingStyle: this.config.biddingStyle,
        teamBidMode: this.config.teamBidMode,
      },
      players,
      hand: forPlayer !== null ? this.getHand(forPlayer) : [],
      isSpectator: forPlayer === null,
      bids: this.bids.slice(),
      highestBid: highestBidAsBid,
      currentBidder: this.currentBidder,
      contract: this.contract,
      trumpBroken: this.trumpBroken,
      currentTrick: this.currentTrick.slice(),
      turn: this.whoseTurn(),
      lastCompletedTrick: this.getLastCompletedTrick(),
      tricksWon: { ...this.tricksWon },
      lastHandResult: this.lastHandResult,
      handHistory: this.handHistory.slice(),
      matchWinner: this.matchWinner,
      openHand:
        this.openHandPlayer !== null
          ? { player: this.openHandPlayer, cards: this.getHand(this.openHandPlayer) }
          : null,
    };
  }
}
