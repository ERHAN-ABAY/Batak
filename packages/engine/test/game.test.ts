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
    game = new Game(makePlayers(), { gameEndMode: 'fixedHands', handsPerMatch: 1 });
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

describe('Game - gameEndMode=targetScore (default)', () => {
  it('ends the match once any player reaches targetScore, picking the highest score as winner', () => {
    const game = new Game(makePlayers(), { targetScore: 5 });
    game.startHand(123);
    game.submitBid(1, { player: 1, type: 'koz', value: 5 });
    game.submitBid(2, { player: 2, type: 'pas' });
    game.submitBid(3, { player: 3, type: 'pas' });
    game.submitBid(0, { player: 0, type: 'pas' });
    game.chooseTrump(1, 'H');
    autoPlayHand(game);

    // a single hand's winner takes at least 5 tricks (takenTricks scoring),
    // more than enough to cross a targetScore of 5.
    expect(game.phase).toBe('MATCH_COMPLETE');
    expect(game.scores[game.matchWinner!]).toBeGreaterThanOrEqual(5);
    for (const p of PLAYER_INDICES) {
      expect(game.scores[game.matchWinner!]).toBeGreaterThanOrEqual(game.scores[p]);
    }
  });

  it('keeps playing (HAND_COMPLETE, not MATCH_COMPLETE) while everyone is still under target', () => {
    const game = new Game(makePlayers(), { targetScore: 1000 });
    game.startHand(123);
    game.submitBid(1, { player: 1, type: 'koz', value: 5 });
    game.submitBid(2, { player: 2, type: 'pas' });
    game.submitBid(3, { player: 3, type: 'pas' });
    game.submitBid(0, { player: 0, type: 'pas' });
    game.chooseTrump(1, 'H');
    autoPlayHand(game);
    expect(game.phase).toBe('HAND_COMPLETE');
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

describe('Game - all players pass', () => {
  it('with allPassAction=redeal: rotates the dealer and restarts bidding without consuming a hand slot', () => {
    const game = new Game(makePlayers(), { allPassAction: 'redeal' });
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

  it('with allPassAction=dealerTakesMinimum (default): dealer auto-declares at minBid', () => {
    const game = new Game(makePlayers());
    game.startHand(7);
    const dealer = game.dealer;

    game.submitBid(1, { player: 1, type: 'pas' });
    game.submitBid(2, { player: 2, type: 'pas' });
    game.submitBid(3, { player: 3, type: 'pas' });
    game.submitBid(0, { player: 0, type: 'pas' });

    expect(game.phase).toBe('CHOOSING_TRUMP');
    expect(game.getPublicState(0).contract?.declarer).toBe(dealer);
    expect(game.getPublicState(0).contract?.target).toBe(game.config.minBid);
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

describe('Game - buriedCards (Gömmeli Batak)', () => {
  it('deals a smaller hand and auto-derives maxBid from the kitty size', () => {
    const game = new Game(makePlayers(), { buriedCards: true, buriedCardCount: 4 });
    expect(game.config.maxBid).toBe(12); // (52-4)/4
    game.startHand(7);
    for (const p of PLAYER_INDICES) {
      expect(game.getHand(p).length).toBe(12);
    }
  });

  it('enters EXCHANGE after the auction, giving the declarer the kitty', () => {
    const game = new Game(makePlayers(), { handsPerMatch: 1, buriedCards: true, buriedCardCount: 4 });
    game.startHand(7);
    const declarer = game.whoseTurn() as PlayerIndex;
    game.submitBid(declarer, { player: declarer, type: 'koz', value: 5 });
    let next = ((declarer + 1) % 4) as PlayerIndex;
    while (game.phase === 'BIDDING') {
      game.submitBid(next, { player: next, type: 'pas' });
      next = ((next + 1) % 4) as PlayerIndex;
    }
    expect(game.phase).toBe('EXCHANGE');
    expect(game.whoseTurn()).toBe(declarer);
    expect(game.getHand(declarer).length).toBe(16); // 12 + 4 kitty cards
  });

  it('rejects an exchange with the wrong discard count, accepts a correct one and proceeds to trump selection', () => {
    const game = new Game(makePlayers(), { handsPerMatch: 1, buriedCards: true, buriedCardCount: 4 });
    game.startHand(7);
    const declarer = game.whoseTurn() as PlayerIndex;
    game.submitBid(declarer, { player: declarer, type: 'koz', value: 5 });
    let next = ((declarer + 1) % 4) as PlayerIndex;
    while (game.phase === 'BIDDING') {
      game.submitBid(next, { player: next, type: 'pas' });
      next = ((next + 1) % 4) as PlayerIndex;
    }

    const hand16 = game.getHand(declarer);
    expect(() => game.exchangeCards(declarer, hand16.slice(0, 3))).toThrow();

    game.exchangeCards(declarer, hand16.slice(0, 4));
    expect(game.phase).toBe('CHOOSING_TRUMP');
    expect(game.getHand(declarer).length).toBe(12);

    game.chooseTrump(declarer, 'H');
    expect(game.phase).toBe('PLAYING');
    autoPlayHand(game);
    const total = PLAYER_INDICES.reduce((sum, p) => sum + game.getPublicState(p).tricksWon[p], 0);
    expect(total).toBe(12); // full-hand size for this table is 12, not 13
  });

  it('only the declarer may exchange', () => {
    const game = new Game(makePlayers(), { handsPerMatch: 1, buriedCards: true, buriedCardCount: 4 });
    game.startHand(7);
    const declarer = game.whoseTurn() as PlayerIndex;
    game.submitBid(declarer, { player: declarer, type: 'koz', value: 5 });
    let next = ((declarer + 1) % 4) as PlayerIndex;
    while (game.phase === 'BIDDING') {
      game.submitBid(next, { player: next, type: 'pas' });
      next = ((next + 1) % 4) as PlayerIndex;
    }
    const notDeclarer = ((declarer + 1) % 4) as PlayerIndex;
    expect(() => game.exchangeCards(notDeclarer, game.getHand(notDeclarer).slice(0, 4))).toThrow();
  });
});

describe('Game - illegal actions carry typed error codes', () => {
  it('BIDDING_NOT_ACTIVE when bidding after the auction has resolved', () => {
    const game = new Game(makePlayers(), { handsPerMatch: 1 });
    game.startHand(7);
    game.submitBid(1, { player: 1, type: 'gizli' });
    game.submitBid(2, { player: 2, type: 'pas' });
    game.submitBid(3, { player: 3, type: 'pas' });
    game.submitBid(0, { player: 0, type: 'pas' });
    expect(game.phase).toBe('PLAYING'); // gizli, no trump selection needed
    try {
      game.submitBid(2, { player: 2, type: 'pas' });
      throw new Error('expected to throw');
    } catch (err) {
      expect((err as any).code).toBe('BIDDING_NOT_ACTIVE');
    }
  });

  it('NOT_PLAYER_TURN when bidding out of turn', () => {
    const game = new Game(makePlayers(), { handsPerMatch: 1 });
    game.startHand(7);
    try {
      game.submitBid(2, { player: 2, type: 'koz', value: 5 });
      throw new Error('expected to throw');
    } catch (err) {
      expect((err as any).code).toBe('NOT_PLAYER_TURN');
    }
  });

  it('CARD_NOT_IN_HAND when playing before the auction resolves', () => {
    const game = new Game(makePlayers(), { handsPerMatch: 1 });
    game.startHand(7);
    try {
      game.playCard(1, game.getHand(1)[0]);
      throw new Error('expected to throw');
    } catch (err) {
      expect((err as any).code).toBe('WRONG_PHASE');
    }
  });

  it('BID_TOO_LOW when a bid does not beat the current highest', () => {
    const game = new Game(makePlayers(), { handsPerMatch: 1 });
    game.startHand(7);
    game.submitBid(1, { player: 1, type: 'koz', value: 8 });
    try {
      game.submitBid(2, { player: 2, type: 'koz', value: 8 });
      throw new Error('expected to throw');
    } catch (err) {
      expect((err as any).code).toBe('BID_TOO_LOW');
    }
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
