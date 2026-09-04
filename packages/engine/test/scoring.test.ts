import { describe, expect, it } from 'vitest';
import { scoreHand } from '../src/scoring.js';
import { Contract, DEFAULT_MATCH_CONFIG } from '../src/types.js';

const config = DEFAULT_MATCH_CONFIG; // scoringMode: takenTricks, penaltyMode: negativeBid

describe('scoreHand - solo, takenTricks / negativeBid (defaults)', () => {
  it('a made contract scores the actual tricks taken (not just the bid)', () => {
    const contract: Contract = { declarer: 0, type: 'koz', target: 8, trumpSuit: 'S' };
    const tricksWon = { 0: 9, 1: 2, 2: 1, 3: 1 };
    const delta = scoreHand(contract, tricksWon, config);
    expect(delta[0]).toBe(9); // took 9, more than the bid of 8
    expect(delta[1]).toBe(2 * config.pointsPerTrick);
    expect(delta[2]).toBe(1 * config.pointsPerTrick);
    expect(delta[3]).toBe(1 * config.pointsPerTrick);
  });

  it('a failed contract loses the bid amount, regardless of scoringMode', () => {
    const contract: Contract = { declarer: 0, type: 'koz', target: 8, trumpSuit: 'S' };
    const tricksWon = { 0: 6, 1: 3, 2: 2, 3: 2 };
    const delta = scoreHand(contract, tricksWon, config);
    expect(delta[0]).toBe(-8);
  });

  it('kozsuz uses the same declarer formula as koz', () => {
    const contract: Contract = { declarer: 1, type: 'kozsuz', target: 6, trumpSuit: null };
    const tricksWon = { 0: 3, 1: 6, 2: 2, 3: 2 };
    const delta = scoreHand(contract, tricksWon, config);
    expect(delta[1]).toBe(6);
  });

  it('gizli (target = maxBid) succeeds only by taking every trick', () => {
    const contract: Contract = { declarer: 2, type: 'gizli', target: 13, trumpSuit: null };
    const tricksWon = { 0: 0, 1: 0, 2: 13, 3: 0 };
    const delta = scoreHand(contract, tricksWon, config);
    expect(delta[2]).toBe(13);
  });

  it('a failed gizli loses its (max) bid amount', () => {
    const contract: Contract = { declarer: 2, type: 'gizli', target: 13, trumpSuit: null };
    const tricksWon = { 0: 1, 1: 0, 2: 12, 3: 0 };
    const delta = scoreHand(contract, tricksWon, config);
    expect(delta[2]).toBe(-13);
  });

  it('elsiz (0 tricks) always uses the dedicated flat elsizPoints, made', () => {
    const contract: Contract = { declarer: 3, type: 'elsiz', target: 0, trumpSuit: null };
    const tricksWon = { 0: 5, 1: 4, 2: 4, 3: 0 };
    const delta = scoreHand(contract, tricksWon, config);
    expect(delta[3]).toBe(config.elsizPoints);
  });

  it('elsiz (0 tricks) failed', () => {
    const contract: Contract = { declarer: 3, type: 'elsiz', target: 0, trumpSuit: null };
    const tricksWon = { 0: 4, 1: 4, 2: 4, 3: 1 };
    const delta = scoreHand(contract, tricksWon, config);
    expect(delta[3]).toBe(-config.elsizPoints);
  });
});

describe('scoreHand - scoringMode variants', () => {
  const contract: Contract = { declarer: 0, type: 'koz', target: 7, trumpSuit: 'S' };
  const tricksWon = { 0: 9, 1: 2, 2: 1, 3: 1 };

  it('bidOnly ignores overtricks entirely', () => {
    const delta = scoreHand(contract, tricksWon, { ...config, scoringMode: 'bidOnly' });
    expect(delta[0]).toBe(7);
  });

  it('bidPlusOvertricks adds overtrickPoints per trick beyond the bid', () => {
    const delta = scoreHand(contract, tricksWon, {
      ...config,
      scoringMode: 'bidPlusOvertricks',
      overtrickPoints: 2,
    });
    expect(delta[0]).toBe(7 + (9 - 7) * 2);
  });
});

describe('scoreHand - penaltyMode variants', () => {
  const contract: Contract = { declarer: 0, type: 'koz', target: 8, trumpSuit: 'S' };
  const tricksWon = { 0: 5, 1: 3, 2: 3, 3: 2 };

  it('negativeTaken penalizes only the shortfall', () => {
    const delta = scoreHand(contract, tricksWon, { ...config, penaltyMode: 'negativeTaken' });
    expect(delta[0]).toBe(-(8 - 5));
  });

  it('fixedPenalty ignores the bid size entirely', () => {
    const delta = scoreHand(contract, tricksWon, {
      ...config,
      penaltyMode: 'fixedPenalty',
      fixedPenaltyPoints: 15,
    });
    expect(delta[0]).toBe(-15);
  });
});

describe('scoreHand - partnership (eşli)', () => {
  const teamConfig = { ...config, partnership: true };

  it('combines declarer + partner tricks against the contract, both get the same delta', () => {
    // declarer=0 (team 0&2), partner=2. combined tricks = 4+5=9 >= target 8 -> made
    const contract: Contract = { declarer: 0, type: 'koz', target: 8, trumpSuit: 'S' };
    const tricksWon = { 0: 4, 1: 2, 2: 5, 3: 2 };
    const delta = scoreHand(contract, tricksWon, teamConfig);
    expect(delta[0]).toBe(9); // takenTricks mode: combined tricks taken
    expect(delta[2]).toBe(delta[0]);
  });

  it('fails the contract when the combined team total falls short', () => {
    const contract: Contract = { declarer: 0, type: 'koz', target: 8, trumpSuit: 'S' };
    const tricksWon = { 0: 3, 1: 4, 2: 4, 3: 2 };
    const delta = scoreHand(contract, tricksWon, teamConfig);
    expect(delta[0]).toBe(-8);
    expect(delta[2]).toBe(delta[0]);
  });

  it('awards the opposing team pointsPerTrick on their combined tricks, split equally', () => {
    const contract: Contract = { declarer: 0, type: 'koz', target: 8, trumpSuit: 'S' };
    const tricksWon = { 0: 4, 1: 2, 2: 5, 3: 2 };
    const delta = scoreHand(contract, tricksWon, teamConfig);
    const expected = (tricksWon[1] + tricksWon[3]) * teamConfig.pointsPerTrick;
    expect(delta[1]).toBe(expected);
    expect(delta[3]).toBe(expected);
  });

  it('gizli requires the whole team to take all 13 tricks', () => {
    const contract: Contract = { declarer: 1, type: 'gizli', target: 13, trumpSuit: null };
    const tricksWon = { 0: 0, 1: 10, 2: 0, 3: 3 };
    const delta = scoreHand(contract, tricksWon, teamConfig);
    expect(delta[1]).toBe(13);
    expect(delta[3]).toBe(delta[1]);
  });
});
