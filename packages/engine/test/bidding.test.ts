import { describe, expect, it } from 'vitest';
import { validateAuctionBid, validateCommitment } from '../src/bidding.js';
import { createMatchConfig } from '../src/ruleSets.js';

const config = createMatchConfig('NORMAL_BID'); // minimumBid=5, maximumBid=13

describe('validateAuctionBid', () => {
  it('accepts a pass regardless of context', () => {
    expect(validateAuctionBid({ player: 0, type: 'pas' }, null, config).valid).toBe(true);
  });

  it('rejects a pass when the variant disallows it (Koz Maça taahhütlü)', () => {
    const spades = createMatchConfig('SPADES');
    const r = validateAuctionBid({ player: 0, type: 'pas' }, null, spades);
    expect(r.valid).toBe(false);
  });

  it('rejects a bid below minimumBid', () => {
    const r = validateAuctionBid({ player: 0, type: 'bid', value: config.minimumBid - 1 }, null, config);
    expect(r.valid).toBe(false);
    expect(r.code).toBe('BID_TOO_LOW');
  });

  it('rejects a bid above maximumBid', () => {
    const r = validateAuctionBid({ player: 0, type: 'bid', value: 14 }, null, config);
    expect(r.valid).toBe(false);
    expect(r.code).toBe('BID_TOO_HIGH');
  });

  it('rejects a bid that does not exceed the current highest', () => {
    const r = validateAuctionBid({ player: 1, type: 'bid', value: 8 }, 8, config);
    expect(r.valid).toBe(false);
    expect(r.code).toBe('BID_TOO_LOW');
  });

  it('accepts a higher bid', () => {
    const r = validateAuctionBid({ player: 1, type: 'bid', value: 9 }, 8, config);
    expect(r.valid).toBe(true);
  });

  it('rejects an equal-value bid (must strictly beat the standing bid, §13)', () => {
    const r = validateAuctionBid({ player: 1, type: 'bid', value: 8 }, 8, config);
    expect(r.valid).toBe(false);
  });

  it('the first bid of an auction only needs to clear minimumBid', () => {
    const r = validateAuctionBid({ player: 0, type: 'bid', value: config.minimumBid }, null, config);
    expect(r.valid).toBe(true);
  });
});

describe('validateCommitment (Koz Maça taahhütlü, §8 Mod B)', () => {
  const spades = createMatchConfig('SPADES'); // minimumBid=1, maximumBid=13

  it('accepts any value within the variant range, independent of other players', () => {
    expect(validateCommitment(1, spades).valid).toBe(true);
    expect(validateCommitment(13, spades).valid).toBe(true);
  });

  it('rejects a value below minimumBid', () => {
    expect(validateCommitment(0, spades).valid).toBe(false);
  });

  it('rejects a value above maximumBid', () => {
    expect(validateCommitment(14, spades).valid).toBe(false);
  });

  it('rejects a non-integer / missing value', () => {
    expect(validateCommitment(undefined, spades).valid).toBe(false);
  });
});
