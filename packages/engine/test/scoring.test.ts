import { describe, expect, it } from 'vitest';
import { createMatchConfig } from '../src/ruleSets.js';
import { scoreHand } from '../src/scoring.js';
import { Contract } from '../src/types.js';

describe('scoreHand - solo, TakenMinusBidOnFail (default, §19)', () => {
  const config = createMatchConfig('NORMAL_BID');

  it('a made contract scores the actual tricks taken (not just the bid), §4 example', () => {
    const contract: Contract = { declarer: 0, trumpSuit: 'S', targets: { 0: 8 }, teamTargets: {} };
    const tricksWon = { 0: 9, 1: 2, 2: 1, 3: 1 };
    const delta = scoreHand(contract, tricksWon, config);
    expect(delta[0]).toBe(9); // İhale=8, alınan=9 -> +9
    expect(delta[1]).toBe(2); // no target -> flat tricks taken
    expect(delta[2]).toBe(1);
    expect(delta[3]).toBe(1);
  });

  it('a failed contract loses the target amount, §4 example (ihale 7, alınan 6 -> -7)', () => {
    const contract: Contract = { declarer: 0, trumpSuit: 'S', targets: { 0: 7 }, teamTargets: {} };
    const tricksWon = { 0: 6, 1: 3, 2: 2, 3: 2 };
    const delta = scoreHand(contract, tricksWon, config);
    expect(delta[0]).toBe(-7);
  });

  it('a player/team with no target for the hand banks tricks taken 1-for-1 (Koz Maça Mod A)', () => {
    const contract: Contract = { declarer: null, trumpSuit: 'S', targets: {}, teamTargets: {} };
    const tricksWon = { 0: 4, 1: 3, 2: 4, 3: 2 };
    const delta = scoreHand(contract, tricksWon, config);
    expect(delta).toEqual(tricksWon);
  });
});

describe('scoreHand - scoreMode variants (§19)', () => {
  const contract: Contract = { declarer: 0, trumpSuit: 'S', targets: { 0: 7 }, teamTargets: {} };
  const tricksWon = { 0: 9, 1: 2, 2: 1, 3: 1 };

  it('BidOnly ignores overtricks entirely (§16 Mod B)', () => {
    const config = createMatchConfig('NORMAL_BID', { scoreMode: 'BidOnly' });
    const delta = scoreHand(contract, tricksWon, config);
    expect(delta[0]).toBe(7);
  });

  it('Multiplier10 scores target*10 plus overtricks when made', () => {
    const config = createMatchConfig('NORMAL_BID', { scoreMode: 'Multiplier10' });
    const delta = scoreHand(contract, tricksWon, config);
    expect(delta[0]).toBe(7 * 10 + (9 - 7)); // §19 example: bid 8 taken 10 -> 82
  });

  it('Multiplier10 example from §19: bid 8, taken 10 -> 82', () => {
    const config = createMatchConfig('NORMAL_BID', { scoreMode: 'Multiplier10' });
    const c: Contract = { declarer: 0, trumpSuit: 'S', targets: { 0: 8 }, teamTargets: {} };
    const delta = scoreHand(c, { 0: 10, 1: 1, 2: 1, 3: 1 }, config);
    expect(delta[0]).toBe(82);
  });

  it('Multiplier10 example from §19: bid 8, taken 7 -> -80', () => {
    const config = createMatchConfig('NORMAL_BID', { scoreMode: 'Multiplier10' });
    const c: Contract = { declarer: 0, trumpSuit: 'S', targets: { 0: 8 }, teamTargets: {} };
    const delta = scoreHand(c, { 0: 7, 1: 2, 2: 2, 3: 2 }, config);
    expect(delta[0]).toBe(-80);
  });

  it('every scoreMode penalizes a failed contract by -target', () => {
    const failedTricks = { 0: 5, 1: 3, 2: 3, 3: 2 };
    const failedContract: Contract = { declarer: 0, trumpSuit: 'S', targets: { 0: 8 }, teamTargets: {} };
    for (const scoreMode of ['TakenMinusBidOnFail', 'BidOnly'] as const) {
      const config = createMatchConfig('NORMAL_BID', { scoreMode });
      expect(scoreHand(failedContract, failedTricks, config)[0]).toBe(-8);
    }
  });
});

describe('scoreHand - team variants (§6, §9)', () => {
  it('combines declarer + partner tricks against the team target, both get the same delta', () => {
    const config = createMatchConfig('TEAM_BID');
    // declarer=3 (team 1&3), partner=1. combined tricks = 5+6=11 >= target 10 -> made (§6 example)
    const contract: Contract = { declarer: 3, trumpSuit: 'S', targets: { 3: 10 }, teamTargets: { 1: 10 } };
    const tricksWon = { 0: 1, 1: 6, 2: 1, 3: 5 };
    const delta = scoreHand(contract, tricksWon, config);
    expect(delta[3]).toBe(11);
    expect(delta[1]).toBe(delta[3]);
  });

  it('fails the contract when the combined team total falls short', () => {
    const config = createMatchConfig('TEAM_BID');
    const contract: Contract = { declarer: 0, trumpSuit: 'S', targets: { 0: 10 }, teamTargets: { 0: 10 } };
    const tricksWon = { 0: 3, 1: 4, 2: 4, 3: 2 };
    const delta = scoreHand(contract, tricksWon, config);
    expect(delta[0]).toBe(-10);
    expect(delta[2]).toBe(delta[0]);
  });

  it('the opposing team with no target of its own banks its combined tricks 1-for-1', () => {
    const config = createMatchConfig('TEAM_BID');
    const contract: Contract = { declarer: 0, trumpSuit: 'S', targets: { 0: 8 }, teamTargets: { 0: 8 } };
    const tricksWon = { 0: 4, 1: 2, 2: 5, 3: 2 };
    const delta = scoreHand(contract, tricksWon, config);
    expect(delta[1]).toBe(tricksWon[1] + tricksWon[3]);
    expect(delta[3]).toBe(delta[1]);
  });

  it('Eşli Koz Maça: both teams have their own target and are scored independently (§9)', () => {
    const config = createMatchConfig('TEAM_SPADES');
    const contract: Contract = {
      declarer: null,
      trumpSuit: 'S',
      targets: { 0: 3, 1: 4, 2: 2, 3: 2 },
      teamTargets: { 0: 5, 1: 6 },
    };
    const tricksWon = { 0: 3, 1: 3, 2: 3, 3: 4 };
    const delta = scoreHand(contract, tricksWon, config);
    expect(delta[0]).toBe(6); // team0 (seats 0&2) took 3+3=6 >= target 5 -> made
    expect(delta[2]).toBe(delta[0]);
    expect(delta[1]).toBe(7); // team1 (seats 1&3) took 3+4=7 >= target 6 -> made
    expect(delta[3]).toBe(delta[1]);
  });
});
