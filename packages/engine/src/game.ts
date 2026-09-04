import { bidStrength, targetForBid, validateBid } from './bidding.js';
import { deal, sortHand } from './deck.js';
import { scoreHand } from './scoring.js';
import { isLegalPlay, trickWinner } from './trick.js';
import {
  Bid,
  Card,
  Contract,
  DEFAULT_MATCH_CONFIG,
  GamePhase,
  HandResult,
  MatchConfig,
  PLAYER_INDICES,
  PlayerIndex,
  Suit,
  TrickCard,
  cardsEqual,
  partnerOf,
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
}

export interface PublicSettings {
  partnership: boolean;
  openHand: boolean;
  fixedSpadesTrump: boolean;
}

export interface OpenHandInfo {
  player: PlayerIndex;
  cards: Card[];
}

export interface PublicState {
  phase: GamePhase;
  handNumber: number;
  handsPerMatch: number;
  dealer: PlayerIndex;
  settings: PublicSettings;
  players: Record<PlayerIndex, PublicPlayerState>;
  hand: Card[]; // requesting player's own hand only
  bids: Bid[];
  highestBid: Bid | null;
  currentBidder: PlayerIndex | null;
  contract: Contract | null;
  currentTrick: TrickCard[];
  turn: PlayerIndex | null;
  lastCompletedTrick: TrickCard[] | null;
  tricksWon: Record<PlayerIndex, number>;
  lastHandResult: HandResult | null;
  matchWinner: PlayerIndex | null;
  /** Declarer's partner's hand, revealed to everyone (Açık mode only). */
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

  private hands: Record<PlayerIndex, Card[]> = { 0: [], 1: [], 2: [], 3: [] };
  private bids: Bid[] = [];
  private highestBid: Bid | null = null;
  private passedPlayers = new Set<PlayerIndex>();
  private currentBidder: PlayerIndex | null = null;

  private contract: Contract | null = null;
  private trickLeader: PlayerIndex = 0;
  private currentTrick: TrickCard[] = [];
  private completedTricks: TrickCard[][] = [];
  private tricksWon: Record<PlayerIndex, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
  private lastHandResult: HandResult | null = null;
  private openHandPlayer: PlayerIndex | null = null;
  matchWinner: PlayerIndex | null = null;

  constructor(players: Record<PlayerIndex, PlayerInfo>, config: Partial<MatchConfig> = {}) {
    this.players = players;
    this.config = { ...DEFAULT_MATCH_CONFIG, ...config };
    if (this.config.openHand && !this.config.partnership) {
      // Açık only makes sense once a partner exists.
      this.config.openHand = false;
    }
  }

  startHand(seed?: number): void {
    if (this.phase === 'MATCH_COMPLETE') {
      throw new Error('match already complete');
    }
    this.handNumber += 1;
    this.hands = deal(this.dealer, seed);
    this.bids = [];
    this.highestBid = null;
    this.passedPlayers = new Set();
    this.currentBidder = ((this.dealer + 1) % 4) as PlayerIndex;
    this.contract = null;
    this.trickLeader = this.currentBidder;
    this.currentTrick = [];
    this.completedTricks = [];
    this.tricksWon = { 0: 0, 1: 0, 2: 0, 3: 0 };
    this.lastHandResult = null;
    this.openHandPlayer = null;
    this.phase = 'BIDDING';
  }

  getHand(player: PlayerIndex): Card[] {
    return sortHand(this.hands[player]);
  }

  submitBid(player: PlayerIndex, bid: Bid): void {
    if (this.phase !== 'BIDDING') throw new Error('not in bidding phase');
    if (this.currentBidder !== player) throw new Error('not this player\'s turn to bid');
    if (this.passedPlayers.has(player)) throw new Error('player already passed');

    const result = validateBid(bid, this.highestBid, this.config);
    if (!result.valid) throw new Error(result.reason ?? 'invalid bid');

    this.bids.push({ ...bid, player });

    if (bid.type === 'pas') {
      this.passedPlayers.add(player);
    } else {
      this.highestBid = { ...bid, player };
    }

    if (this.passedPlayers.size === 4) {
      // everyone passed - redeal, dealer rotates
      this.dealer = ((this.dealer + 1) % 4) as PlayerIndex;
      this.handNumber -= 1; // this hand never counted
      this.startHand();
      return;
    }

    if (this.passedPlayers.size === 3 && this.highestBid) {
      this.resolveAuction(this.highestBid);
      return;
    }

    this.advanceBidder();
  }

  private advanceBidder(): void {
    let next = ((this.currentBidder! + 1) % 4) as PlayerIndex;
    while (this.passedPlayers.has(next)) {
      next = ((next + 1) % 4) as PlayerIndex;
    }
    this.currentBidder = next;
  }

  private resolveAuction(winningBid: Bid): void {
    const type = winningBid.type as 'koz' | 'kozsuz' | 'gizli' | 'elsiz';
    const target = targetForBid(winningBid);
    this.contract = {
      declarer: winningBid.player,
      type,
      target,
      trumpSuit: null,
    };
    this.currentBidder = null;

    if (this.config.partnership && this.config.openHand) {
      this.openHandPlayer = partnerOf(winningBid.player);
    }

    if (type === 'koz' && this.config.fixedSpadesTrump) {
      this.contract.trumpSuit = 'S';
      this.phase = 'PLAYING';
      this.trickLeader = winningBid.player;
    } else if (type === 'koz') {
      this.phase = 'CHOOSING_TRUMP';
    } else {
      this.phase = 'PLAYING';
      this.trickLeader = winningBid.player;
    }
  }

  chooseTrump(player: PlayerIndex, suit: Suit): void {
    if (this.phase !== 'CHOOSING_TRUMP') throw new Error('not choosing trump right now');
    if (!this.contract || this.contract.declarer !== player) {
      throw new Error('only the declarer can choose trump');
    }
    this.contract.trumpSuit = suit;
    this.trickLeader = player;
    this.phase = 'PLAYING';
  }

  whoseTurn(): PlayerIndex | null {
    if (this.phase === 'BIDDING') return this.currentBidder;
    if (this.phase === 'PLAYING') {
      return ((this.trickLeader + this.currentTrick.length) % 4) as PlayerIndex;
    }
    return null;
  }

  playCard(player: PlayerIndex, card: Card): void {
    if (this.phase !== 'PLAYING') throw new Error('not in playing phase');
    if (this.whoseTurn() !== player) throw new Error('not this player\'s turn to play');

    const hand = this.hands[player];
    const inHand = hand.some((c) => cardsEqual(c, card));
    if (!inHand) throw new Error('card not in hand');
    if (!isLegalPlay(card, hand, this.currentTrick, this.contract!.trumpSuit)) {
      throw new Error('illegal play: must follow suit if possible');
    }

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
      contract: this.contract!,
      tricksWon: { ...this.tricksWon },
      scoreDelta: delta,
    };
    this.handHistory.push(result);
    this.lastHandResult = result;
    this.dealer = ((this.dealer + 1) % 4) as PlayerIndex;

    if (this.handNumber >= this.config.handsPerMatch) {
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

  getPublicState(forPlayer: PlayerIndex): PublicState {
    const players: Record<PlayerIndex, PublicPlayerState> = {} as any;
    for (const p of PLAYER_INDICES) {
      players[p] = {
        id: this.players[p]?.id ?? '',
        name: this.players[p]?.name ?? '',
        cardCount: this.hands[p]?.length ?? 0,
        score: this.scores[p],
        hasPassed: this.passedPlayers.has(p),
      };
    }

    return {
      phase: this.phase,
      handNumber: this.handNumber,
      handsPerMatch: this.config.handsPerMatch,
      dealer: this.dealer,
      settings: {
        partnership: this.config.partnership,
        openHand: this.config.openHand,
        fixedSpadesTrump: this.config.fixedSpadesTrump,
      },
      players,
      hand: this.getHand(forPlayer),
      bids: this.bids.slice(),
      highestBid: this.highestBid,
      currentBidder: this.currentBidder,
      contract: this.contract,
      currentTrick: this.currentTrick.slice(),
      turn: this.whoseTurn(),
      lastCompletedTrick: this.getLastCompletedTrick(),
      tricksWon: { ...this.tricksWon },
      lastHandResult: this.lastHandResult,
      matchWinner: this.matchWinner,
      openHand:
        this.openHandPlayer !== null
          ? { player: this.openHandPlayer, cards: this.getHand(this.openHandPlayer) }
          : null,
    };
  }
}
