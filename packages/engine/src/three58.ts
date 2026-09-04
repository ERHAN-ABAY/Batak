/**
 * "3-5-8" - a well-known 3-player trick-taking game, deliberately kept as
 * its own independent rule engine (per BATAK_OYUN_KURALLARI_VE_TEKNIK_SPEK.md
 * §48: "3-5-8 modu klasik 4 kişilik Batak motoruna zorla bağlanmamalıdır").
 * It only reuses the player-count-agnostic building blocks from the Batak
 * engine (Card/Suit types, shuffle, legalPlays/trickWinner) - everything
 * about dealing, roles, and scoring is specific to this game.
 *
 * The source spec is intentionally vague here ("dağıtım ve kart değiştirme
 * kuralları varyanta göre değişebilir") and only fixes two facts: 3 players,
 * and role targets of 3, 5 and 8 tricks that "toplamda 16 el" (sum to the
 * hand's 16 tricks). To make that arithmetic exact, this implementation:
 *  - uses a 48-card deck (standard 52, with all four 2s removed) dealt out
 *    evenly as 16 cards per player - so 3+5+8 = 16 accounts for every
 *    trick in the hand;
 *  - rotates roles with the dealer each hand: dealer=3, dealer's left=5,
 *    dealer's right=8;
 *  - has the dealer choose a single trump suit before play (the spec does
 *    not fix this either; a dealer-chosen trump gives the toughest role a
 *    small compensating lever).
 * These are documented assumptions, not sourced from the spec, and are
 * easy to swap out - see DEFAULT_358_CONFIG.
 */
import { BatakError } from './errors.js';
import { shuffle } from './deck.js';
import { isLegalPlay, legalPlays, trickWinner } from './trick.js';
import { Card, RANKS, SUITS, Suit, cardsEqual } from './types.js';

export type ThreeSeat = 0 | 1 | 2;
export const THREE_SEATS: ThreeSeat[] = [0, 1, 2];

export interface ThreeFiveEightPlayerInfo {
  id: string;
  name: string;
}

export interface ThreeFiveEightTrickCard {
  player: ThreeSeat;
  card: Card;
}

export type ThreeFiveEightPhase = 'CHOOSING_TRUMP' | 'PLAYING' | 'HAND_COMPLETE' | 'MATCH_COMPLETE';

export function create358Deck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      if (rank === 2) continue; // 48-card deck: 2s removed
      deck.push({ suit, rank });
    }
  }
  return deck;
}

export interface ThreeFiveEightMatchConfig {
  /** Cumulative score that ends the match. */
  targetScore: number;
}

export const DEFAULT_358_CONFIG: ThreeFiveEightMatchConfig = {
  targetScore: 51,
};

export interface ThreeFiveEightHandResult {
  handNumber: number;
  dealer: ThreeSeat;
  targets: Record<ThreeSeat, number>;
  tricksWon: Record<ThreeSeat, number>;
  scoreDelta: Record<ThreeSeat, number>;
  trumpSuit: Suit;
}

export interface ThreeFiveEightPublicPlayerState {
  id: string;
  name: string;
  cardCount: number;
  score: number;
  target: number;
}

export interface ThreeFiveEightPublicState {
  phase: ThreeFiveEightPhase;
  handNumber: number;
  targetScore: number;
  dealer: ThreeSeat;
  players: Record<ThreeSeat, ThreeFiveEightPublicPlayerState>;
  hand: Card[];
  isSpectator: boolean;
  trumpSuit: Suit | null;
  currentTrick: ThreeFiveEightTrickCard[];
  turn: ThreeSeat | null;
  lastCompletedTrick: ThreeFiveEightTrickCard[] | null;
  tricksWon: Record<ThreeSeat, number>;
  lastHandResult: ThreeFiveEightHandResult | null;
  matchWinner: ThreeSeat | null;
}

export class ThreeFiveEightGame {
  readonly config: ThreeFiveEightMatchConfig;
  readonly players: Record<ThreeSeat, ThreeFiveEightPlayerInfo>;
  scores: Record<ThreeSeat, number> = { 0: 0, 1: 0, 2: 0 };
  handHistory: ThreeFiveEightHandResult[] = [];

  dealer: ThreeSeat = 0;
  handNumber = 0;
  phase: ThreeFiveEightPhase = 'CHOOSING_TRUMP';
  matchWinner: ThreeSeat | null = null;

  private hands: Record<ThreeSeat, Card[]> = { 0: [], 1: [], 2: [] };
  private targets: Record<ThreeSeat, number> = { 0: 3, 1: 5, 2: 8 };
  private trumpSuit: Suit | null = null;
  private trickLeader: ThreeSeat = 0;
  private currentTrick: ThreeFiveEightTrickCard[] = [];
  private completedTricks: ThreeFiveEightTrickCard[][] = [];
  private tricksWon: Record<ThreeSeat, number> = { 0: 0, 1: 0, 2: 0 };
  private lastHandResult: ThreeFiveEightHandResult | null = null;

  constructor(
    players: Record<ThreeSeat, ThreeFiveEightPlayerInfo>,
    config: Partial<ThreeFiveEightMatchConfig> = {}
  ) {
    this.players = players;
    this.config = { ...DEFAULT_358_CONFIG, ...config };
  }

  private rolesForDealer(dealer: ThreeSeat): Record<ThreeSeat, number> {
    const targets: Record<ThreeSeat, number> = { 0: 0, 1: 0, 2: 0 };
    targets[dealer] = 3;
    targets[((dealer + 1) % 3) as ThreeSeat] = 5;
    targets[((dealer + 2) % 3) as ThreeSeat] = 8;
    return targets;
  }

  startHand(seed?: number): void {
    if (this.phase === 'MATCH_COMPLETE') {
      throw new BatakError('MATCH_ALREADY_COMPLETE', 'match already complete');
    }
    this.handNumber += 1;
    const deck = shuffle(create358Deck(), seed);
    this.hands = { 0: [], 1: [], 2: [] };
    for (let i = 0; i < deck.length; i++) {
      const seat = (i % 3) as ThreeSeat;
      this.hands[seat].push(deck[i]);
    }
    this.targets = this.rolesForDealer(this.dealer);
    this.trumpSuit = null;
    this.trickLeader = this.dealer;
    this.currentTrick = [];
    this.completedTricks = [];
    this.tricksWon = { 0: 0, 1: 0, 2: 0 };
    this.lastHandResult = null;
    this.phase = 'CHOOSING_TRUMP';
  }

  getHand(seat: ThreeSeat): Card[] {
    const suitOrder: Record<string, number> = { S: 0, H: 1, D: 2, C: 3 };
    return this.hands[seat]
      .slice()
      .sort((a, b) => suitOrder[a.suit] - suitOrder[b.suit] || b.rank - a.rank);
  }

  chooseTrump(seat: ThreeSeat, suit: Suit): void {
    if (this.phase !== 'CHOOSING_TRUMP') throw new BatakError('NOT_CHOOSING_TRUMP', 'not choosing trump right now');
    if (seat !== this.dealer) throw new BatakError('NOT_DECLARER', 'only the dealer chooses trump in 3-5-8');
    this.trumpSuit = suit;
    this.phase = 'PLAYING';
  }

  whoseTurn(): ThreeSeat | null {
    if (this.phase === 'CHOOSING_TRUMP') return this.dealer;
    if (this.phase === 'PLAYING') return ((this.trickLeader + this.currentTrick.length) % 3) as ThreeSeat;
    return null;
  }

  private trickRules() {
    return { mustTrumpWhenVoid: true, mustOvertrumpOrBeat: true };
  }

  getLegalPlays(seat: ThreeSeat): Card[] {
    if (this.phase !== 'PLAYING' || this.whoseTurn() !== seat) return [];
    return legalPlays(this.hands[seat], this.currentTrick, this.trumpSuit, this.trickRules());
  }

  playCard(seat: ThreeSeat, card: Card): void {
    if (this.phase !== 'PLAYING') throw new BatakError('WRONG_PHASE', 'not in playing phase');
    if (this.whoseTurn() !== seat) throw new BatakError('NOT_PLAYER_TURN', "not this player's turn to play");

    const hand = this.hands[seat];
    if (!hand.some((c) => cardsEqual(c, card))) throw new BatakError('CARD_NOT_IN_HAND', 'card not in hand');
    if (!isLegalPlay(card, hand, this.currentTrick, this.trumpSuit, this.trickRules())) {
      throw new BatakError('MUST_FOLLOW_SUIT', 'illegal play: must follow suit if possible');
    }

    this.hands[seat] = hand.filter((c) => !cardsEqual(c, card));
    this.currentTrick.push({ player: seat, card });

    if (this.currentTrick.length === 3) {
      const winner = trickWinner(this.currentTrick, this.trumpSuit) as ThreeSeat;
      this.tricksWon[winner] += 1;
      this.completedTricks.push(this.currentTrick);
      this.trickLeader = winner;
      this.currentTrick = [];

      const cardsLeft = THREE_SEATS.some((s) => this.hands[s].length > 0);
      if (!cardsLeft) this.finishHand();
    }
  }

  /** Made a role's target -> +tricks taken; missed it -> -target. (See file header for rationale.) */
  private finishHand(): void {
    const delta: Record<ThreeSeat, number> = { 0: 0, 1: 0, 2: 0 };
    for (const s of THREE_SEATS) {
      const made = this.tricksWon[s] >= this.targets[s];
      delta[s] = made ? this.tricksWon[s] : -this.targets[s];
    }
    for (const s of THREE_SEATS) this.scores[s] += delta[s];

    const result: ThreeFiveEightHandResult = {
      handNumber: this.handNumber,
      dealer: this.dealer,
      targets: { ...this.targets },
      tricksWon: { ...this.tricksWon },
      scoreDelta: delta,
      trumpSuit: this.trumpSuit!,
    };
    this.handHistory.push(result);
    this.lastHandResult = result;
    this.dealer = ((this.dealer + 1) % 3) as ThreeSeat;

    if (THREE_SEATS.some((s) => this.scores[s] >= this.config.targetScore)) {
      this.phase = 'MATCH_COMPLETE';
      let best: ThreeSeat = 0;
      for (const s of THREE_SEATS) if (this.scores[s] > this.scores[best]) best = s;
      this.matchWinner = best;
    } else {
      this.phase = 'HAND_COMPLETE';
    }
  }

  getLastCompletedTrick(): ThreeFiveEightTrickCard[] | null {
    return this.completedTricks.length > 0 ? this.completedTricks[this.completedTricks.length - 1] : null;
  }

  /** Pass `forSeat: null` for a spectator view - no hand is revealed. */
  getPublicState(forSeat: ThreeSeat | null): ThreeFiveEightPublicState {
    const players: Record<ThreeSeat, ThreeFiveEightPublicPlayerState> = {} as any;
    for (const s of THREE_SEATS) {
      players[s] = {
        id: this.players[s]?.id ?? '',
        name: this.players[s]?.name ?? '',
        cardCount: this.hands[s]?.length ?? 0,
        score: this.scores[s],
        target: this.targets[s],
      };
    }

    return {
      phase: this.phase,
      handNumber: this.handNumber,
      targetScore: this.config.targetScore,
      dealer: this.dealer,
      players,
      hand: forSeat !== null ? this.getHand(forSeat) : [],
      isSpectator: forSeat === null,
      trumpSuit: this.trumpSuit,
      currentTrick: this.currentTrick.slice(),
      turn: this.whoseTurn(),
      lastCompletedTrick: this.getLastCompletedTrick(),
      tricksWon: { ...this.tricksWon },
      lastHandResult: this.lastHandResult,
      matchWinner: this.matchWinner,
    };
  }
}
