import { Card, PLAYER_INDICES, PlayerIndex, RANKS, SUITS } from './types.js';

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  return deck;
}

/** Simple linear-congruential PRNG so hands can be reproduced from a seed in tests. */
function seededRng(seed: number): () => number {
  let state = seed % 2147483647;
  if (state <= 0) state += 2147483646;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

export function shuffle<T>(items: T[], seed?: number): T[] {
  const rng = seed === undefined ? Math.random : seededRng(seed);
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Deals a shuffled 52-card deck into 4 hands of 13, starting left of the dealer. */
export function deal(dealer: PlayerIndex, seed?: number): Record<PlayerIndex, Card[]> {
  const deck = shuffle(createDeck(), seed);
  const hands: Record<PlayerIndex, Card[]> = { 0: [], 1: [], 2: [], 3: [] };
  const startIndex = (dealer + 1) % 4;
  for (let i = 0; i < deck.length; i++) {
    const player = ((startIndex + i) % 4) as PlayerIndex;
    hands[player].push(deck[i]);
  }
  return hands;
}

export function sortHand(hand: Card[]): Card[] {
  const suitOrder: Record<string, number> = { S: 0, H: 1, D: 2, C: 3 };
  return hand
    .slice()
    .sort((a, b) => suitOrder[a.suit] - suitOrder[b.suit] || b.rank - a.rank);
}

export { PLAYER_INDICES };
