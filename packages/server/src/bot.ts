/**
 * "Easy" bot AI (per BATAK_OYUN_KURALLARI_VE_TEKNIK_SPEK.md §20.1):
 * follows suit (via the engine's own legality checks), plays a random
 * legal card, and bids using a small hand-strength heuristic. Kept
 * deliberately simple - this is the "Easy" tier, not Normal/Hard/Expert.
 */
import { Bid, Card, Game, PlayerIndex, Suit, bidStrength } from '@batak/engine';

export function decideBotBid(game: Game, seat: PlayerIndex): Bid {
  const state = game.getPublicState(seat);
  const hand = state.hand;

  let strength = 0;
  for (const c of hand) if (c.rank >= 13) strength += 1; // count K/A as strong cards

  const bySuit: Record<string, number> = { S: 0, H: 0, D: 0, C: 0 };
  for (const c of hand) bySuit[c.suit] += 1;
  const longestSuitLength = Math.max(...Object.values(bySuit));
  strength += Math.max(0, longestSuitLength - 3);

  const value = Math.min(game.config.maxBid, game.config.minBid + Math.max(0, strength - 1));
  const candidate: Bid = { player: seat, type: 'koz', value };

  const currentStrength = state.highestBid ? bidStrength(state.highestBid, game.config) : -1;
  if (strength >= 3 && bidStrength(candidate, game.config) > currentStrength) {
    return candidate;
  }
  return { player: seat, type: 'pas' };
}

export function decideBotTrumpSuit(game: Game, seat: PlayerIndex): Suit {
  const hand = game.getPublicState(seat).hand;
  const bySuit: Record<Suit, number> = { S: 0, H: 0, D: 0, C: 0 };
  for (const c of hand) bySuit[c.suit] += 1;
  const suits: Suit[] = ['S', 'H', 'D', 'C'];
  return suits.reduce((best, s) => (bySuit[s] > bySuit[best] ? s : best), suits[0]);
}

export function decideBotPlay(game: Game, seat: PlayerIndex): Card {
  const legal = game.getLegalPlays(seat);
  return legal[Math.floor(Math.random() * legal.length)];
}

/** Gömmeli mode: discard the lowest-ranked cards - a simple, safe default. */
export function decideBotExchange(game: Game, seat: PlayerIndex): Card[] {
  const hand = game.getPublicState(seat).hand;
  return hand
    .slice()
    .sort((a, b) => a.rank - b.rank)
    .slice(0, game.config.buriedCardCount);
}
