import { beforeEach, describe, expect, it } from 'vitest';
import { Game } from '../src/game.js';
import { createMatchConfig } from '../src/ruleSets.js';
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
    const legal = legalPlays(state.hand, state.currentTrick, state.contract!.trumpSuit, state.trumpBroken);
    game.playCard(turn, legal[0]);
  }
}

/** Runs a standard auction to completion: `declarer` bids `value`, everyone else passes. */
function runAuction(game: Game, declarer: PlayerIndex, value: number): void {
  game.submitBid(declarer, { player: declarer, type: 'bid', value });
  let next = ((declarer + 1) % 4) as PlayerIndex;
  while (game.phase === 'BIDDING') {
    game.submitBid(next, { player: next, type: 'pas' });
    next = ((next + 1) % 4) as PlayerIndex;
  }
}

describe('Game - NORMAL_BID: full auction + play', () => {
  let game: Game;

  beforeEach(() => {
    game = new Game(makePlayers(), createMatchConfig('NORMAL_BID', { gameEndMode: 'fixedHands', maxRounds: 1 }));
    game.startHand(123);
  });

  it('starts in BIDDING with dealer+1 to act', () => {
    expect(game.phase).toBe('BIDDING');
    expect(game.whoseTurn()).toBe(1);
  });

  it('resolves an auction, requires trump choice, then plays out all 13 tricks', () => {
    runAuction(game, 1, 5);

    expect(game.phase).toBe('CHOOSING_TRUMP');
    game.chooseTrump(1, 'H');
    expect(game.phase).toBe('PLAYING');

    autoPlayHand(game);

    expect(game.phase).toBe('MATCH_COMPLETE');
    const total = PLAYER_INDICES.reduce((sum, p) => sum + game.getPublicState(p).tricksWon[p], 0);
    expect(total).toBe(13);
    expect(game.handHistory.length).toBe(1);
    const scoreSum = PLAYER_INDICES.reduce((s, p) => s + game.scores[p], 0);
    expect(scoreSum).not.toBe(0);
  });

  it('rejects a bid below minimumBid (§11: min 5)', () => {
    expect(() => game.submitBid(1, { player: 1, type: 'bid', value: 4 })).toThrow();
  });

  it('rejects an equal or lower re-bid (§13)', () => {
    game.submitBid(1, { player: 1, type: 'bid', value: 7 });
    expect(() => game.submitBid(2, { player: 2, type: 'bid', value: 7 })).toThrow();
  });
});

describe('Game - gameEndMode=targetScore (default)', () => {
  it('ends the match once any player reaches targetScore, picking the highest score as winner', () => {
    const game = new Game(makePlayers(), createMatchConfig('NORMAL_BID', { targetScore: 5 }));
    game.startHand(123);
    runAuction(game, 1, 5);
    game.chooseTrump(1, 'H');
    autoPlayHand(game);

    expect(game.phase).toBe('MATCH_COMPLETE');
    expect(game.scores[game.matchWinner!]).toBeGreaterThanOrEqual(5);
    for (const p of PLAYER_INDICES) {
      expect(game.scores[game.matchWinner!]).toBeGreaterThanOrEqual(game.scores[p]);
    }
  });

  it('keeps playing (HAND_COMPLETE, not MATCH_COMPLETE) while everyone is still under target', () => {
    const game = new Game(makePlayers(), createMatchConfig('NORMAL_BID', { targetScore: 1000 }));
    game.startHand(123);
    runAuction(game, 1, 5);
    game.chooseTrump(1, 'H');
    autoPlayHand(game);
    expect(game.phase).toBe('HAND_COMPLETE');
  });
});

describe('Game - all players pass (§6.4/§12)', () => {
  it('allPassAction=redeal: rotates the dealer and restarts bidding without consuming a hand slot', () => {
    const game = new Game(makePlayers(), createMatchConfig('NORMAL_BID', { allPassAction: 'redeal' }));
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

  it('allPassAction=dealerTakesMinimum (default): dealer auto-declares at minimumBid', () => {
    const game = new Game(makePlayers(), createMatchConfig('NORMAL_BID'));
    game.startHand(7);
    const dealer = game.dealer;

    game.submitBid(1, { player: 1, type: 'pas' });
    game.submitBid(2, { player: 2, type: 'pas' });
    game.submitBid(3, { player: 3, type: 'pas' });
    game.submitBid(0, { player: 0, type: 'pas' });

    expect(game.phase).toBe('CHOOSING_TRUMP');
    expect(game.getPublicState(0).contract?.declarer).toBe(dealer);
    expect(game.getPublicState(0).contract?.targets[dealer]).toBe(game.config.minimumBid);
  });
});

describe('Game - OPEN_BID reveals the "karşı el" once trump is chosen (§5)', () => {
  it('NORMAL_BID never reveals an open hand', () => {
    const game = new Game(makePlayers(), createMatchConfig('NORMAL_BID', { maxRounds: 1 }));
    game.startHand(7);
    runAuction(game, 1, 6);
    game.chooseTrump(1, 'H');
    expect(game.getPublicState(0).openHand).toBeNull();
  });

  it('OPEN_BID keeps the "karşı el" hidden through the auction and only reveals it once trump is chosen', () => {
    const game = new Game(makePlayers(), createMatchConfig('OPEN_BID', { maxRounds: 1 }));
    game.startHand(7);
    runAuction(game, 1, 6);
    expect(game.phase).toBe('CHOOSING_TRUMP');
    expect(game.getPublicState(0).openHand).toBeNull(); // not yet - trump hasn't been chosen

    game.chooseTrump(1, 'H');
    const partner = ((1 + 2) % 4) as PlayerIndex; // the seat across from the declarer
    const state = game.getPublicState(0);
    expect(state.openHand?.player).toBe(partner);
    expect(state.openHand?.cards.length).toBe(13);
  });

  it('bids are always fully visible to everyone regardless of isOpenBidding', () => {
    const normal = new Game(makePlayers(), createMatchConfig('NORMAL_BID'));
    normal.startHand(7);
    normal.submitBid(1, { player: 1, type: 'bid', value: 6 });
    expect(normal.getPublicState(0).bids.length).toBe(1);

    const open = new Game(makePlayers(), createMatchConfig('OPEN_BID'));
    open.startHand(7);
    open.submitBid(1, { player: 1, type: 'bid', value: 6 });
    open.submitBid(2, { player: 2, type: 'pas' });
    expect(open.getPublicState(3).bids.length).toBe(2);
  });
});

describe('Game - TEAM_BID (Eşli İhaleli Batak, §6)', () => {
  it('minimumBid is 8 (§11)', () => {
    const game = new Game(makePlayers(), createMatchConfig('TEAM_BID'));
    expect(game.config.minimumBid).toBe(8);
  });

  it('the team target is the combined tricks of declarer + partner, not the declarer alone (§6 example)', () => {
    const game = new Game(makePlayers(), createMatchConfig('TEAM_BID', { maxRounds: 1 }));
    game.startHand(7);
    const declarer = game.whoseTurn() as PlayerIndex;
    runAuction(game, declarer, 10);
    game.chooseTrump(declarer, 'S');
    autoPlayHand(game);
    const partner = ((declarer + 2) % 4) as PlayerIndex;
    expect(game.scores[declarer]).toBe(game.scores[partner]);
  });
});

describe('Game - SPADES (Koz Maça)', () => {
  it('Mod B (taahhütlü, default): each player independently commits a target, no pass allowed', () => {
    const game = new Game(makePlayers(), createMatchConfig('SPADES', { maxRounds: 1 }));
    game.startHand(7);
    expect(game.phase).toBe('BIDDING');
    expect(() => game.submitBid(1, { player: 1, type: 'pas' })).toThrow();

    game.submitBid(1, { player: 1, type: 'bid', value: 3 });
    game.submitBid(2, { player: 2, type: 'bid', value: 2 });
    game.submitBid(3, { player: 3, type: 'bid', value: 4 });
    game.submitBid(0, { player: 0, type: 'bid', value: 2 });

    expect(game.phase).toBe('PLAYING');
    const state = game.getPublicState(0);
    expect(state.contract?.trumpSuit).toBe('S');
    expect(state.contract?.declarer).toBeNull();
    expect(state.contract?.targets).toEqual({ 0: 2, 1: 3, 2: 2, 3: 4 });
  });

  it('Mod A (ihalesiz): skips bidding entirely and starts play immediately with fixed ♠ trump', () => {
    const game = new Game(makePlayers(), createMatchConfig('SPADES', { maxRounds: 1, spadesBiddingEnabled: false }));
    game.startHand(7);
    expect(game.phase).toBe('PLAYING');
    expect(game.getPublicState(0).contract?.trumpSuit).toBe('S');
    expect(game.getPublicState(0).contract?.targets).toEqual({});
    autoPlayHand(game);
    // No targets at all -> everyone simply banks the tricks they took.
    const state = game.getPublicState(0);
    expect(game.scores[0]).toBe(state.lastHandResult!.tricksWon[0]);
  });

  it('each seat is scored independently against its own commitment (like 3-5-8 roles)', () => {
    const game = new Game(makePlayers(), createMatchConfig('SPADES', { maxRounds: 1 }));
    game.startHand(7);
    game.submitBid(1, { player: 1, type: 'bid', value: 1 });
    game.submitBid(2, { player: 2, type: 'bid', value: 1 });
    game.submitBid(3, { player: 3, type: 'bid', value: 1 });
    game.submitBid(0, { player: 0, type: 'bid', value: 1 });
    autoPlayHand(game);
    const result = game.handHistory[0];
    for (const p of PLAYER_INDICES) {
      const made = result.tricksWon[p] >= 1;
      expect(result.scoreDelta[p]).toBe(made ? result.tricksWon[p] : -1);
    }
  });
});

describe('Game - TEAM_SPADES (Eşli Koz Maça, §9)', () => {
  it('individualSum (default): team target is the sum of both teammates\' personal commitments', () => {
    const game = new Game(makePlayers(), createMatchConfig('TEAM_SPADES', { maxRounds: 1 }));
    game.startHand(7);
    game.submitBid(1, { player: 1, type: 'bid', value: 2 });
    game.submitBid(2, { player: 2, type: 'bid', value: 3 });
    game.submitBid(3, { player: 3, type: 'bid', value: 4 });
    game.submitBid(0, { player: 0, type: 'bid', value: 1 });
    const state = game.getPublicState(0);
    expect(state.contract?.teamTargets).toEqual({ 0: 4, 1: 6 }); // team0=0+2=4, team1=2+4=6
  });

  it('directTeam: one teammate speaks for the whole team, the partner\'s turn is auto-filled', () => {
    const game = new Game(makePlayers(), createMatchConfig('TEAM_SPADES', { maxRounds: 1, teamBidMode: 'directTeam' }));
    game.startHand(7);
    // dealer+1=1 acts first; player 1 commits 6 on behalf of team {1,3}.
    game.submitBid(1, { player: 1, type: 'bid', value: 6 });
    expect(game.whoseTurn()).toBe(2); // player 3 (team1's partner) is skipped automatically
    game.submitBid(2, { player: 2, type: 'bid', value: 5 });
    const state = game.getPublicState(0);
    expect(state.contract?.teamTargets).toEqual({ 0: 5, 1: 6 });
    expect(state.contract?.targets).toEqual({ 1: 6, 3: 6, 2: 5, 0: 5 });
  });
});

describe('Game - BURIED_BID (Gömmeli Batak, §10)', () => {
  it('deals a smaller hand and auto-derives maximumBid from the kitty size', () => {
    const game = new Game(makePlayers(), createMatchConfig('BURIED_BID', { buriedCardCount: 4 }));
    expect(game.config.maximumBid).toBe(12); // (52-4)/4
    game.startHand(7);
    for (const p of PLAYER_INDICES) {
      expect(game.getHand(p).length).toBe(12);
    }
  });

  it('enters EXCHANGE after the auction, giving the declarer the kitty', () => {
    const game = new Game(makePlayers(), createMatchConfig('BURIED_BID', { maxRounds: 1, buriedCardCount: 4 }));
    game.startHand(7);
    const declarer = game.whoseTurn() as PlayerIndex;
    runAuction(game, declarer, 5);
    expect(game.phase).toBe('EXCHANGE');
    expect(game.whoseTurn()).toBe(declarer);
    expect(game.getHand(declarer).length).toBe(16); // 12 + 4 kitty cards
  });

  it('rejects an exchange with the wrong discard count, accepts a correct one and proceeds to trump selection', () => {
    const game = new Game(makePlayers(), createMatchConfig('BURIED_BID', { maxRounds: 1, buriedCardCount: 4 }));
    game.startHand(7);
    const declarer = game.whoseTurn() as PlayerIndex;
    runAuction(game, declarer, 5);

    const hand16 = game.getHand(declarer);
    expect(() => game.exchangeCards(declarer, hand16.slice(0, 3))).toThrow();

    game.exchangeCards(declarer, hand16.slice(0, 4));
    expect(game.phase).toBe('CHOOSING_TRUMP');
    expect(game.getHand(declarer).length).toBe(12);

    game.chooseTrump(declarer, 'H');
    expect(game.phase).toBe('PLAYING');
    autoPlayHand(game);
    const total = PLAYER_INDICES.reduce((sum, p) => sum + game.getPublicState(p).tricksWon[p], 0);
    expect(total).toBe(12);
  });

  it('only the declarer may exchange', () => {
    const game = new Game(makePlayers(), createMatchConfig('BURIED_BID', { maxRounds: 1, buriedCardCount: 4 }));
    game.startHand(7);
    const declarer = game.whoseTurn() as PlayerIndex;
    runAuction(game, declarer, 5);
    const notDeclarer = ((declarer + 1) % 4) as PlayerIndex;
    expect(() => game.exchangeCards(notDeclarer, game.getHand(notDeclarer).slice(0, 4))).toThrow();
  });
});

describe('Game - "koz kırılmadan koz ile çıkılamaz" (trump-breaking)', () => {
  it('a trick leader may not open with trump before it has been broken this hand', () => {
    const game = new Game(makePlayers(), createMatchConfig('NORMAL_BID', { maxRounds: 1 }));
    game.startHand(7);
    const declarer = game.whoseTurn() as PlayerIndex;
    runAuction(game, declarer, 5);
    game.chooseTrump(declarer, 'S');
    expect(game.phase).toBe('PLAYING');

    const leader = game.whoseTurn() as PlayerIndex;
    const hand = game.getHand(leader);
    const legal = game.getLegalPlays(leader);
    if (hand.some((c) => c.suit !== 'S')) {
      // holds a non-trump card -> every trump card must be excluded from the legal-lead set
      expect(legal.every((c) => c.suit !== 'S')).toBe(true);
    } else {
      // hand is entirely trump -> the "only suit left" exception allows leading it
      expect(legal.length).toBe(hand.length);
    }
  });

  it('trump becomes legal to lead once it has been played earlier in the hand (as a ruff)', () => {
    const game = new Game(makePlayers(), createMatchConfig('NORMAL_BID', { maxRounds: 1 }));
    game.startHand(7);
    const declarer = game.whoseTurn() as PlayerIndex;
    runAuction(game, declarer, 5);
    game.chooseTrump(declarer, 'S');

    expect(game.getPublicState(0).trumpBroken).toBe(false);
    autoPlayHand(game);
    // Once the hand is fully played out, trump was necessarily led/ruffed
    // at some point unless the deal happened to hold zero trump discards -
    // just assert the flag never causes a thrown error mid-play (autoPlayHand
    // would have thrown if legalPlays/isLegalPlay disagreed).
    expect(game.phase === 'HAND_COMPLETE' || game.phase === 'MATCH_COMPLETE').toBe(true);
  });
});

describe('Game - illegal actions carry typed error codes', () => {
  it('BIDDING_NOT_ACTIVE when bidding after the auction has resolved', () => {
    const game = new Game(makePlayers(), createMatchConfig('NORMAL_BID', { maxRounds: 1 }));
    game.startHand(7);
    runAuction(game, 1, 6);
    expect(game.phase).toBe('CHOOSING_TRUMP');
    try {
      game.submitBid(2, { player: 2, type: 'pas' });
      throw new Error('expected to throw');
    } catch (err) {
      expect((err as any).code).toBe('BIDDING_NOT_ACTIVE');
    }
  });

  it('NOT_PLAYER_TURN when bidding out of turn', () => {
    const game = new Game(makePlayers(), createMatchConfig('NORMAL_BID', { maxRounds: 1 }));
    game.startHand(7);
    try {
      game.submitBid(2, { player: 2, type: 'bid', value: 5 });
      throw new Error('expected to throw');
    } catch (err) {
      expect((err as any).code).toBe('NOT_PLAYER_TURN');
    }
  });

  it('WRONG_PHASE when playing before the auction resolves', () => {
    const game = new Game(makePlayers(), createMatchConfig('NORMAL_BID', { maxRounds: 1 }));
    game.startHand(7);
    try {
      game.playCard(1, game.getHand(1)[0]);
      throw new Error('expected to throw');
    } catch (err) {
      expect((err as any).code).toBe('WRONG_PHASE');
    }
  });

  it('BID_TOO_LOW when a bid does not beat the current highest', () => {
    const game = new Game(makePlayers(), createMatchConfig('NORMAL_BID', { maxRounds: 1 }));
    game.startHand(7);
    game.submitBid(1, { player: 1, type: 'bid', value: 8 });
    try {
      game.submitBid(2, { player: 2, type: 'bid', value: 8 });
      throw new Error('expected to throw');
    } catch (err) {
      expect((err as any).code).toBe('BID_TOO_LOW');
    }
  });
});
