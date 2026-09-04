import { describe, expect, it } from 'vitest';
import { createDeck, deal, shuffle } from '../src/deck.js';

describe('deck', () => {
  it('creates 52 unique cards', () => {
    const deck = createDeck();
    expect(deck.length).toBe(52);
    const ids = new Set(deck.map((c) => `${c.rank}${c.suit}`));
    expect(ids.size).toBe(52);
  });

  it('shuffle is deterministic given the same seed', () => {
    const a = shuffle(createDeck(), 42);
    const b = shuffle(createDeck(), 42);
    expect(a).toEqual(b);
  });

  it('shuffle with different seeds differs', () => {
    const a = shuffle(createDeck(), 1);
    const b = shuffle(createDeck(), 2);
    expect(a).not.toEqual(b);
  });

  it('deals 13 cards to each of 4 players with no overlap and an empty kitty', () => {
    const { hands, kitty } = deal(0, 13, 7);
    for (const p of [0, 1, 2, 3] as const) {
      expect(hands[p].length).toBe(13);
    }
    expect(kitty.length).toBe(0);
    const all = [...hands[0], ...hands[1], ...hands[2], ...hands[3]];
    const ids = new Set(all.map((c) => `${c.rank}${c.suit}`));
    expect(ids.size).toBe(52);
  });

  it('deal starts with the player left of the dealer', () => {
    const { hands } = deal(0, 13, 7);
    // player 1 (left of dealer 0) should receive the very first shuffled card
    const deck = shuffle(createDeck(), 7);
    expect(hands[1][0]).toEqual(deck[0]);
  });

  it('supports a smaller hand size with a kitty (Gömmeli mode)', () => {
    const { hands, kitty } = deal(0, 12, 7);
    for (const p of [0, 1, 2, 3] as const) {
      expect(hands[p].length).toBe(12);
    }
    expect(kitty.length).toBe(4);
    const all = [...hands[0], ...hands[1], ...hands[2], ...hands[3], ...kitty];
    const ids = new Set(all.map((c) => `${c.rank}${c.suit}`));
    expect(ids.size).toBe(52);
  });
});
