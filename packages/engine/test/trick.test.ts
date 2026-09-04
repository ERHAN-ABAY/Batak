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

describe('legalPlays - following suit, must beat if possible', () => {
  it('must play a higher card of the led suit if one is available', () => {
    const hand = [c(5, 'S'), c(10, 'H'), c(2, 'H')];
    const trick = [{ player: 0 as const, card: c(9, 'H') }];
    expect(legalPlays(hand, trick, null)).toEqual([c(10, 'H')]);
  });

  it('allows any card of the led suit when none can beat the current best', () => {
    const hand = [c(5, 'S'), c(8, 'H'), c(2, 'H')];
    const trick = [{ player: 0 as const, card: c(9, 'H') }];
    expect(legalPlays(hand, trick, null)).toEqual([c(8, 'H'), c(2, 'H')]);
  });

  it('following suit is unconstrained once a trump has already been played (cannot beat it anyway)', () => {
    const hand = [c(14, 'H'), c(2, 'H')];
    const trick = [
      { player: 0 as const, card: c(9, 'H') },
      { player: 1 as const, card: c(3, 'S') }, // trumped in
    ];
    expect(legalPlays(hand, trick, 'S')).toEqual(hand);
  });
});

describe('legalPlays - void in led suit', () => {
  it('must trump when holding trump ("zorunlu kesme"), cannot sluff a third suit', () => {
    const hand = [c(5, 'D'), c(3, 'S')]; // no H, has S(trump)
    const trick = [{ player: 0 as const, card: c(9, 'H') }];
    expect(legalPlays(hand, trick, 'S')).toEqual([c(3, 'S')]);
  });

  it('any trump is legal when first to trump the trick', () => {
    const hand = [c(5, 'D'), c(3, 'S'), c(9, 'S')];
    const trick = [{ player: 0 as const, card: c(9, 'H') }];
    expect(legalPlays(hand, trick, 'S')).toEqual([c(3, 'S'), c(9, 'S')]);
  });

  it('must overtrump if a higher trump is held once trump has already been played', () => {
    const hand = [c(5, 'D'), c(4, 'S'), c(9, 'S')];
    const trick = [
      { player: 0 as const, card: c(9, 'H') },
      { player: 1 as const, card: c(6, 'S') },
    ];
    expect(legalPlays(hand, trick, 'S')).toEqual([c(9, 'S')]);
  });

  it('may play any trump if none can overtrump the current best trump', () => {
    const hand = [c(5, 'D'), c(4, 'S'), c(2, 'S')];
    const trick = [
      { player: 0 as const, card: c(9, 'H') },
      { player: 1 as const, card: c(11, 'S') },
    ];
    expect(legalPlays(hand, trick, 'S')).toEqual([c(4, 'S'), c(2, 'S')]);
  });

  it('discards freely when void in led suit and has no trump', () => {
    const hand = [c(5, 'D'), c(3, 'C')];
    const trick = [{ player: 0 as const, card: c(9, 'H') }];
    expect(legalPlays(hand, trick, 'S')).toEqual(hand);
  });

  it('discards freely whenever there is no trump suit in play (kozsuz/gizli/elsiz)', () => {
    const hand = [c(5, 'D'), c(3, 'C'), c(14, 'S')];
    const trick = [{ player: 0 as const, card: c(9, 'H') }];
    expect(legalPlays(hand, trick, null)).toEqual(hand);
  });
});

describe('legalPlays - configurable rules', () => {
  it('mustTrumpWhenVoid=false allows sluffing a third suit even while holding trump', () => {
    const hand = [c(5, 'D'), c(3, 'S')];
    const trick = [{ player: 0 as const, card: c(9, 'H') }];
    const relaxed = legalPlays(hand, trick, 'S', { mustTrumpWhenVoid: false, mustOvertrumpOrBeat: true });
    expect(relaxed).toEqual(hand);
  });

  it('mustOvertrumpOrBeat=false allows playing a lower card even when a beating one is available', () => {
    const hand = [c(5, 'S'), c(10, 'H'), c(2, 'H')];
    const trick = [{ player: 0 as const, card: c(9, 'H') }];
    const relaxed = legalPlays(hand, trick, null, { mustTrumpWhenVoid: true, mustOvertrumpOrBeat: false });
    expect(relaxed).toEqual([c(10, 'H'), c(2, 'H')]);
  });
});

describe('isLegalPlay', () => {
  it('rejects a play that violates the must-beat rule', () => {
    const hand = [c(5, 'S'), c(2, 'H'), c(10, 'H')];
    const trick = [{ player: 0 as const, card: c(9, 'H') }];
    expect(isLegalPlay(c(2, 'H'), hand, trick, null)).toBe(false);
    expect(isLegalPlay(c(10, 'H'), hand, trick, null)).toBe(true);
  });
});

describe('trickWinner', () => {
  it('highest trump wins over any led-suit card', () => {
    const trick = [
      { player: 0 as const, card: c(14, 'H') },
      { player: 1 as const, card: c(2, 'S') },
      { player: 2 as const, card: c(3, 'H') },
      { player: 3 as const, card: c(4, 'H') },
    ];
    expect(trickWinner(trick, 'S')).toBe(1);
  });

  it('highest of led suit wins with no trump suit in play (kozsuz)', () => {
    const trick = [
      { player: 0 as const, card: c(9, 'H') },
      { player: 1 as const, card: c(14, 'S') }, // off-suit, irrelevant
      { player: 2 as const, card: c(13, 'H') },
      { player: 3 as const, card: c(2, 'H') },
    ];
    expect(trickWinner(trick, null)).toBe(2);
  });
});
