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

describe('legalPlays - following suit, must beat if possible ("üstüne basma zorunluluğu")', () => {
  it('must play a higher card of the led suit if one is available', () => {
    const hand = [c(5, 'S'), c(10, 'H'), c(2, 'H')];
    const trick = [{ player: 0 as const, card: c(9, 'H') }];
    expect(legalPlays(hand, trick, null, false)).toEqual([c(10, 'H')]);
  });

  it('allows any card of the led suit when none can beat the current best', () => {
    const hand = [c(5, 'S'), c(8, 'H'), c(2, 'H')];
    const trick = [{ player: 0 as const, card: c(9, 'H') }];
    expect(legalPlays(hand, trick, null, false)).toEqual([c(8, 'H'), c(2, 'H')]);
  });

  it('following suit is unconstrained once a trump has already been played (cannot beat it anyway)', () => {
    const hand = [c(14, 'H'), c(2, 'H')];
    const trick = [
      { player: 0 as const, card: c(9, 'H') },
      { player: 1 as const, card: c(3, 'S') }, // trumped in
    ];
    expect(legalPlays(hand, trick, 'S', true)).toEqual(hand);
  });
});

describe('legalPlays - void in led suit, "zorunlu kesme" (must trump if you hold any)', () => {
  it('must play trump (any of it) when void in the led suit and nobody has trumped this trick yet', () => {
    const hand = [c(5, 'D'), c(3, 'S'), c(9, 'S')]; // no H, has S(trump): a cheap or a strong trump
    const trick = [{ player: 0 as const, card: c(9, 'H') }];
    expect(legalPlays(hand, trick, 'S', false)).toEqual([c(3, 'S'), c(9, 'S')]);
  });

  it('may discard anything (a third-suit sluff included) only when void in the led suit AND holding no trump at all', () => {
    const hand = [c(5, 'D'), c(3, 'C')]; // no H, no S(trump)
    const trick = [{ player: 0 as const, card: c(9, 'H') }];
    expect(legalPlays(hand, trick, 'S', false)).toEqual(hand);
  });

  it('must overtrump with a higher trump if one is held once trump has already been played this trick', () => {
    const hand = [c(5, 'D'), c(4, 'S'), c(9, 'S')];
    const trick = [
      { player: 0 as const, card: c(9, 'H') },
      { player: 1 as const, card: c(6, 'S') },
    ];
    expect(legalPlays(hand, trick, 'S', true)).toEqual([c(9, 'S')]);
  });

  it('may play any of its trumps (but not sluff a third suit) if none of them can overtrump the current best trump', () => {
    const hand = [c(5, 'D'), c(4, 'S'), c(2, 'S')];
    const trick = [
      { player: 0 as const, card: c(9, 'H') },
      { player: 1 as const, card: c(11, 'S') },
    ];
    expect(legalPlays(hand, trick, 'S', true)).toEqual([c(4, 'S'), c(2, 'S')]);
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
  it('rejects a play that violates the must-beat rule', () => {
    const hand = [c(5, 'S'), c(2, 'H'), c(10, 'H')];
    const trick = [{ player: 0 as const, card: c(9, 'H') }];
    expect(isLegalPlay(c(2, 'H'), hand, trick, null, false)).toBe(false);
    expect(isLegalPlay(c(10, 'H'), hand, trick, null, false)).toBe(true);
  });

  it('rejects leading trump before it is broken', () => {
    const hand = [c(5, 'S'), c(10, 'H')];
    expect(isLegalPlay(c(5, 'S'), hand, [], 'S', false)).toBe(false);
    expect(isLegalPlay(c(10, 'H'), hand, [], 'S', false)).toBe(true);
  });

  it('rejects sluffing/underplaying a low trump when a higher trump could overtrump (the reported "kupa/karo" scenario)', () => {
    // Led H(9). Void in H, trump is D. Someone already trumped with 4D.
    // Holding a higher trump (9D, the "joker") and a low one (2D) - must play the beater.
    const hand = [c(9, 'D'), c(2, 'D')];
    const trick = [
      { player: 0 as const, card: c(9, 'H') },
      { player: 1 as const, card: c(4, 'D') },
    ];
    expect(isLegalPlay(c(2, 'D'), hand, trick, 'D', true)).toBe(false);
    expect(isLegalPlay(c(9, 'D'), hand, trick, 'D', true)).toBe(true);
  });

  it('rejects sluffing a third suit while still holding trump ("zorunlu kesme")', () => {
    const hand = [c(5, 'C'), c(3, 'S')]; // no H, has S(trump)
    const trick = [{ player: 0 as const, card: c(9, 'H') }];
    expect(isLegalPlay(c(5, 'C'), hand, trick, 'S', false)).toBe(false);
    expect(isLegalPlay(c(3, 'S'), hand, trick, 'S', false)).toBe(true);
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
