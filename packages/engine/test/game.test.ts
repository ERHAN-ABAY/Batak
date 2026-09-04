import { beforeEach, describe, expect, it } from 'vitest';
import { Game } from '../src/game.js';
import { legalPlays } from '../src/trick.js';
import { PLAYER_INDICES, PlayerIndex } from '../src/types.js';

function makePlayers() {
  return {
    0: { id: 'p0', name: 'Ali' },
    1: { id: 'p1', name: 'Veli' },
    2: { id: 'p2', name: 'Ayşe' },
    3: { id: 'p3', name: 'Fatma' },
  };
}

/** Auto-plays every remaining trick using the first legal card, i.e. a "bot" player. */
function autoPlayHand(game: Game): void {
  while (game.phase === 'PLAYING') {
    const turn = game.whoseTurn() as PlayerIndex;
    const state = game.getPublicState(turn);
    const legal = legalPlays(state.hand, state.currentTrick, state.contract!.trumpSuit);
    game.playCard(turn, legal[0]);
  }
}

describe('Game - full auction + play (koz contract)', () => {
  let game: Game;

  beforeEach(() => {
    game = new Game(makePlayers(), { handsPerMatch: 1 });
    game.startHand(123);
  });

  it('starts in BIDDING with dealer+1 to act', () => {
    expect(game.phase).toBe('BIDDING');
    expect(game.whoseTurn()).toBe(1);
  });

  it('resolves a koz auction, requires trump choice, then plays out all 13 tricks', () => {
    game.submitBid(1, { player: 1, type: 'koz', value: 5 });
    game.submitBid(2, { player: 2, type: 'pas' });
    game.submitBid(3, { player: 3, type: 'pas' });
    game.submitBid(0, { player: 0, type: 'pas' });

    expect(game.phase).toBe('CHOOSING_TRUMP');
    game.chooseTrump(1, 'H');
    expect(game.phase).toBe('PLAYING');

    autoPlayHand(game);

    expect(game.phase).toBe('MATCH_COMPLETE');
    const total = PLAYER_INDICES.reduce(
      (sum, p) => sum + game.getPublicState(p).tricksWon[p],
      0
    );
    expect(total).toBe(13);
    expect(game.handHistory.length).toBe(1);
    const scoreSum = PLAYER_INDICES.reduce((s, p) => s + game.scores[p], 0);
    // sanity: scores were actually mutated from zero
    expect(scoreSum).not.toBe(0);
  });
});

describe('Game - kozsuz/gizli/elsiz skip trump selection', () => {
  it('kozsuz goes straight to PLAYING with no trump suit', () => {
    const game = new Game(makePlayers(), { handsPerMatch: 1 });
    game.startHand(7);
    game.submitBid(1, { player: 1, type: 'kozsuz', value: 6 });
    game.submitBid(2, { player: 2, type: 'pas' });
    game.submitBid(3, { player: 3, type: 'pas' });
    game.submitBid(0, { player: 0, type: 'pas' });
    expect(game.phase).toBe('PLAYING');
    expect(game.getPublicState(0).contract?.trumpSuit).toBeNull();
  });

  it('gizli targets all 13 tricks with no trump', () => {
    const game = new Game(makePlayers(), { handsPerMatch: 1 });
    game.startHand(7);
    game.submitBid(1, { player: 1, type: 'gizli' });
    game.submitBid(2, { player: 2, type: 'pas' });
    game.submitBid(3, { player: 3, type: 'pas' });
    game.submitBid(0, { player: 0, type: 'pas' });
    expect(game.phase).toBe('PLAYING');
    const state = game.getPublicState(0);
    expect(state.contract?.type).toBe('gizli');
    expect(state.contract?.target).toBe(13);
    expect(state.contract?.trumpSuit).toBeNull();
  });

  it('elsiz targets zero tricks', () => {
    const game = new Game(makePlayers(), { handsPerMatch: 1 });
    game.startHand(7);
    game.submitBid(1, { player: 1, type: 'elsiz' });
    game.submitBid(2, { player: 2, type: 'pas' });
    game.submitBid(3, { player: 3, type: 'pas' });
    game.submitBid(0, { player: 0, type: 'pas' });
    expect(game.getPublicState(0).contract?.target).toBe(0);
  });

  it('an elsiz bid outranks any koz/kozsuz bid, forcing them to raise or pass', () => {
    const game = new Game(makePlayers(), { handsPerMatch: 1 });
    game.startHand(7);
    game.submitBid(1, { player: 1, type: 'elsiz' });
    expect(() => game.submitBid(2, { player: 2, type: 'kozsuz', value: 13 })).toThrow();
  });
});

describe('Game - all players pass triggers a redeal', () => {
  it('rotates the dealer and restarts bidding without consuming a hand slot', () => {
    const game = new Game(makePlayers(), { handsPerMatch: 8 });
    game.startHand(7);
    expect(game.handNumber).toBe(1);

    game.submitBid(1, { player: 1, type: 'pas' });
    game.submitBid(2, { player: 2, type: 'pas' });
    game.submitBid(3, { player: 3, type: 'pas' });
    game.submitBid(0, { player: 0, type: 'pas' });

    expect(game.phase).toBe('BIDDING');
    expect(game.handNumber).toBe(1);
    expect(game.dealer).toBe(1);
  });
});

describe('Game - fixedSpadesTrump (Maça modu)', () => {
  it('skips CHOOSING_TRUMP and forces trump to Spades on a koz win', () => {
    const game = new Game(makePlayers(), { handsPerMatch: 1, fixedSpadesTrump: true });
    game.startHand(7);
    game.submitBid(1, { player: 1, type: 'koz', value: 5 });
    game.submitBid(2, { player: 2, type: 'pas' });
    game.submitBid(3, { player: 3, type: 'pas' });
    game.submitBid(0, { player: 0, type: 'pas' });
    expect(game.phase).toBe('PLAYING');
    expect(game.getPublicState(0).contract?.trumpSuit).toBe('S');
  });

  it('rejects kozsuz/gizli/elsiz bids', () => {
    const game = new Game(makePlayers(), { handsPerMatch: 1, fixedSpadesTrump: true });
    game.startHand(7);
    expect(() => game.submitBid(1, { player: 1, type: 'kozsuz', value: 6 })).toThrow();
    expect(() => game.submitBid(1, { player: 1, type: 'gizli' })).toThrow();
    expect(() => game.submitBid(1, { player: 1, type: 'elsiz' })).toThrow();
  });
});

describe('Game - partnership (eşli) + open hand (açık)', () => {
  it('reveals the declarer\'s partner\'s hand once the contract is set', () => {
    const game = new Game(makePlayers(), { handsPerMatch: 1, partnership: true, openHand: true });
    game.startHand(7);
    const declarer = game.whoseTurn() as PlayerIndex;
    game.submitBid(declarer, { player: declarer, type: 'kozsuz', value: 6 });
    let next = ((declarer + 1) % 4) as PlayerIndex;
    while (game.phase === 'BIDDING') {
      game.submitBid(next, { player: next, type: 'pas' });
      next = ((next + 1) % 4) as PlayerIndex;
    }
    const partner = ((declarer + 2) % 4) as PlayerIndex;
    const state = game.getPublicState(0);
    expect(state.openHand?.player).toBe(partner);
    expect(state.openHand?.cards.length).toBe(13);
  });

  it('silently disables openHand when partnership is off', () => {
    const game = new Game(makePlayers(), { handsPerMatch: 1, partnership: false, openHand: true });
    expect(game.config.openHand).toBe(false);
  });

  it('both teammates receive the same score delta after a hand', () => {
    const game = new Game(makePlayers(), { handsPerMatch: 1, partnership: true });
    game.startHand(7);
    const declarer = game.whoseTurn() as PlayerIndex;
    game.submitBid(declarer, { player: declarer, type: 'kozsuz', value: 5 });
    let next = ((declarer + 1) % 4) as PlayerIndex;
    while (game.phase === 'BIDDING') {
      game.submitBid(next, { player: next, type: 'pas' });
      next = ((next + 1) % 4) as PlayerIndex;
    }
    autoPlayHand(game);
    const partner = ((declarer + 2) % 4) as PlayerIndex;
    expect(game.scores[declarer]).toBe(game.scores[partner]);
  });
});

describe('Game - illegal actions are rejected', () => {
  it('rejects a bid from a player who is not on turn', () => {
    const game = new Game(makePlayers(), { handsPerMatch: 1 });
    game.startHand(7);
    expect(() => game.submitBid(2, { player: 2, type: 'koz', value: 5 })).toThrow();
  });

  it('rejects playing a card before the auction resolves', () => {
    const game = new Game(makePlayers(), { handsPerMatch: 1 });
    game.startHand(7);
    expect(() => game.playCard(1, game.getHand(1)[0])).toThrow();
  });
});
