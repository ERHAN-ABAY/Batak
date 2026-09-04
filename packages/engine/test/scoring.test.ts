import { describe, expect, it } from 'vitest';
import { scoreHand } from '../src/scoring.js';
import { Contract, DEFAULT_MATCH_CONFIG } from '../src/types.js';

const config = DEFAULT_MATCH_CONFIG;

describe('scoreHand', () => {
  it('rewards a declarer who makes a koz contract, and pays others per trick', () => {
    const contract: Contract = { declarer: 0, type: 'koz', target: 8, trumpSuit: 'S' };
    const tricksWon = { 0: 8, 1: 2, 2: 1, 3: 2 };
    const delta = scoreHand(contract, tricksWon, config);
    expect(delta[0]).toBe(8 * config.kozMultiplier);
    expect(delta[1]).toBe(2 * config.pointsPerTrick);
    expect(delta[2]).toBe(1 * config.pointsPerTrick);
    expect(delta[3]).toBe(2 * config.pointsPerTrick);
  });

  it('penalizes a declarer who fails a koz contract', () => {
    const contract: Contract = { declarer: 0, type: 'koz', target: 8, trumpSuit: 'S' };
    const tricksWon = { 0: 6, 1: 3, 2: 2, 3: 2 };
    const delta = scoreHand(contract, tricksWon, config);
    expect(delta[0]).toBe(-8 * config.kozMultiplier);
  });

  it('applies the kozsuz multiplier', () => {
    const contract: Contract = { declarer: 1, type: 'kozsuz', target: 6, trumpSuit: null };
    const tricksWon = { 0: 3, 1: 6, 2: 2, 3: 2 };
    const delta = scoreHand(contract, tricksWon, config);
    expect(delta[1]).toBe(6 * config.kozsuzMultiplier);
  });

  it('rewards a successful gizli (all 13 tricks) heavily', () => {
    const contract: Contract = { declarer: 2, type: 'gizli', target: 13, trumpSuit: null };
    const tricksWon = { 0: 0, 1: 0, 2: 13, 3: 0 };
    const delta = scoreHand(contract, tricksWon, config);
    expect(delta[2]).toBe(13 * config.gizliMultiplier);
  });

  it('punishes a failed gizli just as heavily', () => {
    const contract: Contract = { declarer: 2, type: 'gizli', target: 13, trumpSuit: null };
    const tricksWon = { 0: 1, 1: 0, 2: 12, 3: 0 };
    const delta = scoreHand(contract, tricksWon, config);
    expect(delta[2]).toBe(-13 * config.gizliMultiplier);
  });

  it('rewards a successful elsiz (zero tricks) with flat points', () => {
    const contract: Contract = { declarer: 3, type: 'elsiz', target: 0, trumpSuit: null };
    const tricksWon = { 0: 5, 1: 4, 2: 4, 3: 0 };
    const delta = scoreHand(contract, tricksWon, config);
    expect(delta[3]).toBe(config.elsizPoints);
  });

  it('punishes a failed elsiz with flat negative points', () => {
    const contract: Contract = { declarer: 3, type: 'elsiz', target: 0, trumpSuit: null };
    const tricksWon = { 0: 4, 1: 4, 2: 4, 3: 1 };
    const delta = scoreHand(contract, tricksWon, config);
    expect(delta[3]).toBe(-config.elsizPoints);
  });
});

describe('scoreHand - partnership (eşli)', () => {
  const teamConfig = { ...config, partnership: true };

  it('combines declarer + partner tricks against the contract, both get the same delta', () => {
    // declarer=0 (team 0&2), partner=2. combined tricks = 4+5=9 >= target 8 -> made
    const contract: Contract = { declarer: 0, type: 'koz', target: 8, trumpSuit: 'S' };
    const tricksWon = { 0: 4, 1: 2, 2: 5, 3: 2 };
    const delta = scoreHand(contract, tricksWon, teamConfig);
    expect(delta[0]).toBe(8 * teamConfig.kozMultiplier);
    expect(delta[2]).toBe(delta[0]);
  });

  it('fails the contract when the combined team total falls short', () => {
    const contract: Contract = { declarer: 0, type: 'koz', target: 8, trumpSuit: 'S' };
    const tricksWon = { 0: 3, 1: 4, 2: 4, 3: 2 };
    const delta = scoreHand(contract, tricksWon, teamConfig);
    expect(delta[0]).toBe(-8 * teamConfig.kozMultiplier);
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
    expect(delta[1]).toBe(13 * teamConfig.gizliMultiplier);
    expect(delta[3]).toBe(delta[1]);
  });
});
