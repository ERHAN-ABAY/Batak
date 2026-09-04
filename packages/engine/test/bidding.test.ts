import { describe, expect, it } from 'vitest';
import { bidStrength, targetForBid, validateBid } from '../src/bidding.js';
import { DEFAULT_MATCH_CONFIG } from '../src/types.js';

const config = DEFAULT_MATCH_CONFIG;

describe('bidStrength ordering', () => {
  it('ranks elsiz above the highest koz bid', () => {
    expect(bidStrength({ player: 0, type: 'elsiz' }, config)).toBeGreaterThan(
      bidStrength({ player: 0, type: 'koz', value: config.maxBid }, config)
    );
  });

  it('ranks gizli as the strongest contract', () => {
    expect(bidStrength({ player: 0, type: 'gizli' }, config)).toBeGreaterThan(
      bidStrength({ player: 0, type: 'elsiz' }, config)
    );
  });
});

describe('validateBid', () => {
  it('accepts a pass regardless of context', () => {
    expect(validateBid({ player: 0, type: 'pas' }, null, config).valid).toBe(true);
  });

  it('rejects a koz bid below minBid', () => {
    const r = validateBid({ player: 0, type: 'koz', value: config.minBid - 1 }, null, config);
    expect(r.valid).toBe(false);
  });

  it('rejects a koz bid above 13', () => {
    const r = validateBid({ player: 0, type: 'koz', value: 14 }, null, config);
    expect(r.valid).toBe(false);
  });

  it('rejects a bid that does not exceed the current highest', () => {
    const current = { player: 0, type: 'koz' as const, value: 8 };
    const r = validateBid({ player: 1, type: 'koz', value: 8 }, current, config);
    expect(r.valid).toBe(false);
  });

  it('accepts a higher bid', () => {
    const current = { player: 0, type: 'koz' as const, value: 8 };
    const r = validateBid({ player: 1, type: 'koz', value: 9 }, current, config);
    expect(r.valid).toBe(true);
  });

  it('rejects an equal-value koz bid (must strictly beat the standing bid)', () => {
    const current = { player: 0, type: 'koz' as const, value: 8 };
    const r = validateBid({ player: 1, type: 'koz', value: 8 }, current, config);
    expect(r.valid).toBe(false);
  });
});

describe('targetForBid', () => {
  it('gizli targets maxBid tricks (the whole hand)', () => {
    expect(targetForBid({ player: 0, type: 'gizli' }, config)).toBe(config.maxBid);
  });
  it('elsiz targets 0 tricks', () => {
    expect(targetForBid({ player: 0, type: 'elsiz' }, config)).toBe(0);
  });
  it('koz targets its declared value', () => {
    expect(targetForBid({ player: 0, type: 'koz', value: 9 }, config)).toBe(9);
  });
});
