import { describe, expect, it } from 'vitest';
import { isLegalPlay, legalPlays, trickWinner } from '../src/trick.js';
import { Card } from '../src/types.js';

const c = (rank: Card['rank'], suit: Card['suit']): Card => ({ rank, suit });

describe('legalPlays - leading, no trump broken yet', () => {
  it('allows any non-trump card when leading', () => {
    const hand = [c(5, 'S'), c(10, 'H')];
    expect(legalPlays(hand, [], null, false)).toEqual(hand);
  });

  it('allows anything when there is no trump suit in play', () => {
    const hand = [c(5, 'S'), c(10, 'H')];
    expect(legalPlays(hand, [], null, false)).toEqual(hand);
  });
});

describe('legalPlays - following suit (§15)', () => {
  it('must follow suit when holding any card of the led suit, regardless of rank', () => {
    const hand = [c(5, 'S'), c(10, 'H'), c(2, 'H')];
    const trick = [{ player: 0 as const, card: c(9, 'H') }];
    expect(legalPlays(hand, trick, null, false)).toEqual([c(10, 'H'), c(2, 'H')]);
  });

  it('following suit is unaffected by trump-broken state', () => {
    const hand = [c(14, 'H'), c(2, 'H')];
    const trick = [
      { player: 0 as const, card: c(9, 'H') },
      { player: 1 as const, card: c(3, 'S') },
    ];
    expect(legalPlays(hand, trick, 'S', true)).toEqual(hand);
  });
});

describe('legalPlays - void in led suit (§15: "koz atabilir veya başka renk oynayabilir")', () => {
  it('may play trump or any other card - no forced trump, no forced overtrump', () => {
    const hand = [c(5, 'D'), c(3, 'S'), c(2, 'C')];
    const trick = [{ player: 0 as const, card: c(9, 'H') }];
    expect(legalPlays(hand, trick, 'S', false)).toEqual(hand);
  });

  it('discards freely when there is no trump suit in play (trumpSuit=null)', () => {
    const hand = [c(5, 'D'), c(3, 'C'), c(14, 'S')];
    const trick = [{ player: 0 as const, card: c(9, 'H') }];
    expect(legalPlays(hand, trick, null, false)).toEqual(hand);
  });
});

describe('legalPlays - "koz kırılmadan koz ile çıkılamaz" (trump-breaking, leading only)', () => {
  it('may not lead trump before it has been broken, if a non-trump card is available', () => {
    const hand = [c(5, 'S'), c(10, 'H'), c(2, 'H')]; // S is trump
    expect(legalPlays(hand, [], 'S', false)).toEqual([c(10, 'H'), c(2, 'H')]);
  });

  it('may lead trump once it has been broken', () => {
    const hand = [c(5, 'S'), c(10, 'H'), c(2, 'H')];
    expect(legalPlays(hand, [], 'S', true)).toEqual(hand);
  });

  it('may lead trump even when unbroken if it is the only suit left in hand', () => {
    const hand = [c(5, 'S'), c(9, 'S')];
    expect(legalPlays(hand, [], 'S', false)).toEqual(hand);
  });

  it('does not restrict leading when there is no trump suit in play', () => {
    const hand = [c(5, 'S'), c(10, 'H')];
    expect(legalPlays(hand, [], null, false)).toEqual(hand);
  });
});

describe('isLegalPlay', () => {
  it('rejects a card of a suit other than the led one when the led suit is held', () => {
    const hand = [c(5, 'S'), c(2, 'H'), c(10, 'H')];
    const trick = [{ player: 0 as const, card: c(9, 'H') }];
    expect(isLegalPlay(c(5, 'S'), hand, trick, null, false)).toBe(false);
    expect(isLegalPlay(c(2, 'H'), hand, trick, null, false)).toBe(true);
  });

  it('rejects leading trump before it is broken', () => {
    const hand = [c(5, 'S'), c(10, 'H')];
    expect(isLegalPlay(c(5, 'S'), hand, [], 'S', false)).toBe(false);
    expect(isLegalPlay(c(10, 'H'), hand, [], 'S', false)).toBe(true);
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
