import { describe, expect, it } from 'vitest';
import { isLegalPlay, legalPlays, trickWinner } from '../src/trick.js';
import { Card } from '../src/types.js';

const c = (rank: Card['rank'], suit: Card['suit']): Card => ({ rank, suit });

describe('legalPlays - leading', () => {
  it('allows any card when leading', () => {
    const hand = [c(5, 'S'), c(10, 'H')];
    expect(legalPlays(hand, [], null)).toEqual(hand);
  });
});

describe('legalPlays - following suit (§15)', () => {
  it('must follow suit when holding any card of the led suit, regardless of rank', () => {
    const hand = [c(5, 'S'), c(10, 'H'), c(2, 'H')];
    const trick = [{ player: 0 as const, card: c(9, 'H') }];
    expect(legalPlays(hand, trick, null)).toEqual([c(10, 'H'), c(2, 'H')]);
  });

  it('following suit is unaffected by a trump already played elsewhere in the trick', () => {
    const hand = [c(14, 'H'), c(2, 'H')];
    const trick = [
      { player: 0 as const, card: c(9, 'H') },
      { player: 1 as const, card: c(3, 'S') },
    ];
    expect(legalPlays(hand, trick, 'S')).toEqual(hand);
  });
});

describe('legalPlays - void in led suit (§15: "koz atabilir veya başka renk oynayabilir")', () => {
  it('may play trump or any other card - no forced trump, no forced overtrump', () => {
    const hand = [c(5, 'D'), c(3, 'S'), c(2, 'C')];
    const trick = [{ player: 0 as const, card: c(9, 'H') }];
    expect(legalPlays(hand, trick, 'S')).toEqual(hand);
  });

  it('discards freely when there is no trump suit in play (trumpSuit=null)', () => {
    const hand = [c(5, 'D'), c(3, 'C'), c(14, 'S')];
    const trick = [{ player: 0 as const, card: c(9, 'H') }];
    expect(legalPlays(hand, trick, null)).toEqual(hand);
  });
});

describe('isLegalPlay', () => {
  it('rejects a card of a suit other than the led one when the led suit is held', () => {
    const hand = [c(5, 'S'), c(2, 'H'), c(10, 'H')];
    const trick = [{ player: 0 as const, card: c(9, 'H') }];
    expect(isLegalPlay(c(5, 'S'), hand, trick, null)).toBe(false);
    expect(isLegalPlay(c(2, 'H'), hand, trick, null)).toBe(true);
  });
});

describe('trickWinner (§3, §10)', () => {
  it('highest trump wins over any led-suit card', () => {
    const trick = [
      { player: 0 as const, card: c(14, 'H') },
      { player: 1 as const, card: c(2, 'S') },
      { player: 2 as const, card: c(3, 'H') },
      { player: 3 as const, card: c(4, 'H') },
    ];
    expect(trickWinner(trick, 'S')).toBe(1);
  });

  it('highest of led suit wins with no trump suit in play (trumpSuit=null)', () => {
    const trick = [
      { player: 0 as const, card: c(9, 'H') },
      { player: 1 as const, card: c(14, 'S') }, // off-suit, irrelevant
      { player: 2 as const, card: c(13, 'H') },
      { player: 3 as const, card: c(2, 'H') },
    ];
    expect(trickWinner(trick, null)).toBe(2);
  });

  it('the worked example from §3: koz ♠, highest played is 2♠', () => {
    const trick = [
      { player: 0 as const, card: c(14, 'H') },
      { player: 1 as const, card: c(10, 'H') },
      { player: 2 as const, card: c(2, 'S') },
      { player: 3 as const, card: c(13, 'H') },
    ];
    expect(trickWinner(trick, 'S')).toBe(2);
  });
});
