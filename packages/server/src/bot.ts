/**
 * "Easy" bot AI (per BATAK_DETAYLI_KURALLAR_VE_OYUN_TIPLERI.md §22):
 * follows suit (via the engine's own legality checks), plays a random
 * legal card, and bids/commits using a small hand-strength heuristic. Kept
 * deliberately simple - this is the "Kolay" tier, not Normal/Zor/Uzman.
 */
import { Bid, Card, Game, PlayerIndex, Suit } from '@batak/engine';

function handStrength(hand: Card[]): number {
  let strength = 0;
  for (const c of hand) if (c.rank >= 13) strength += 1; // count K/A as strong cards

  const bySuit: Record<string, number> = { S: 0, H: 0, D: 0, C: 0 };
  for (const c of hand) bySuit[c.suit] += 1;
  const longestSuitLength = Math.max(...Object.values(bySuit));
  strength += Math.max(0, longestSuitLength - 3);
  return strength;
}

export function decideBotBid(game: Game, seat: PlayerIndex): Bid {
  const state = game.getPublicState(seat);
  const strength = handStrength(state.hand);

  if (game.config.biddingStyle === 'commitment') {
    // Koz Maça taahhütlü: always commits to a personal target, no pass.
    const value = Math.min(game.config.maximumBid, Math.max(game.config.minimumBid, Math.round(strength / 2)));
    return { player: seat, type: 'bid', value };
  }

  const value = Math.min(game.config.maximumBid, game.config.minimumBid + Math.max(0, strength - 1));
  const candidate: Bid = { player: seat, type: 'bid', value };

  const currentValue = state.highestBid?.value ?? game.config.minimumBid - 1;
  if (strength >= 3 && value > currentValue) {
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
