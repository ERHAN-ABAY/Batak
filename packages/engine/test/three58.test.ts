import { beforeEach, describe, expect, it } from 'vitest';
import { THREE_SEATS, ThreeFiveEightGame, ThreeSeat, create358Deck } from '../src/three58.js';
import { legalPlays } from '../src/trick.js';

function makePlayers() {
  return {
    0: { id: 'a0', name: 'Ada' },
    1: { id: 'a1', name: 'Bora' },
    2: { id: 'a2', name: 'Can' },
  };
}

function autoPlayHand(game: ThreeFiveEightGame): void {
  while (game.phase === 'PLAYING') {
    const turn = game.whoseTurn() as ThreeSeat;
    const state = game.getPublicState(turn);
    const legal = legalPlays(state.hand, state.currentTrick, state.trumpSuit);
    game.playCard(turn, legal[0]);
  }
}

describe('create358Deck', () => {
  it('has 48 cards (2s removed), all unique', () => {
    const deck = create358Deck();
    expect(deck.length).toBe(48);
    expect(deck.some((c) => c.rank === 2)).toBe(false);
    const ids = new Set(deck.map((c) => `${c.rank}${c.suit}`));
    expect(ids.size).toBe(48);
  });
});

describe('ThreeFiveEightGame', () => {
  let game: ThreeFiveEightGame;

  beforeEach(() => {
    game = new ThreeFiveEightGame(makePlayers(), { targetScore: 1000 });
    game.startHand(11);
  });

  it('deals 16 cards to each of 3 seats', () => {
    for (const s of THREE_SEATS) {
      expect(game.getHand(s).length).toBe(16);
    }
  });

  it('assigns role targets 3/5/8 rotating from the dealer', () => {
    const state = game.getPublicState(0);
    expect(state.players[game.dealer].target).toBe(3);
    expect(state.players[((game.dealer + 1) % 3) as ThreeSeat].target).toBe(5);
    expect(state.players[((game.dealer + 2) % 3) as ThreeSeat].target).toBe(8);
  });

  it('starts in CHOOSING_TRUMP with the dealer to act', () => {
    expect(game.phase).toBe('CHOOSING_TRUMP');
    expect(game.whoseTurn()).toBe(game.dealer);
  });

  it('only the dealer may choose trump', () => {
    const notDealer = ((game.dealer + 1) % 3) as ThreeSeat;
    expect(() => game.chooseTrump(notDealer, 'H')).toThrow();
  });

  it('plays out a full 16-trick hand, totals add up, and scores the 3 roles', () => {
    game.chooseTrump(game.dealer, 'S');
    expect(game.phase).toBe('PLAYING');
    autoPlayHand(game);

    expect(game.phase).toBe('HAND_COMPLETE');
    const total = THREE_SEATS.reduce((sum, s) => sum + game.getPublicState(s).tricksWon[s], 0);
    expect(total).toBe(16);
    expect(game.handHistory.length).toBe(1);

    const result = game.handHistory[0];
    for (const s of THREE_SEATS) {
      const made = result.tricksWon[s] >= result.targets[s];
      expect(result.scoreDelta[s]).toBe(made ? result.tricksWon[s] : -result.targets[s]);
    }
  });

  it('ends the match once a player reaches targetScore', () => {
    const shortGame = new ThreeFiveEightGame(makePlayers(), { targetScore: 3 });
    shortGame.startHand(11);
    shortGame.chooseTrump(shortGame.dealer, 'S');
    autoPlayHand(shortGame);
    expect(shortGame.phase).toBe('MATCH_COMPLETE');
    expect(shortGame.scores[shortGame.matchWinner!]).toBeGreaterThanOrEqual(3);
  });

  it('rotates the dealer (and thus roles) after each hand', () => {
    const dealerBefore = game.dealer;
    game.chooseTrump(game.dealer, 'S');
    autoPlayHand(game);
    expect(game.dealer).toBe(((dealerBefore + 1) % 3) as ThreeSeat);
  });

  it('rejects a card play from a player who is not on turn', () => {
    game.chooseTrump(game.dealer, 'S');
    const notFirst = ((game.dealer + 1) % 3) as ThreeSeat;
    expect(() => game.playCard(notFirst, game.getHand(notFirst)[0])).toThrow();
  });
});
