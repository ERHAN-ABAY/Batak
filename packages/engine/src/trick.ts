import { Card, PlayerIndex, Suit, TrickCard } from './types.js';

/**
 * Legal cards for whoever is now to act (§3 "El kazanma", §15 "Renk takip
 * zorunluluğu"). The document's rule is deliberately simple and is not
 * configurable per variant:
 *  1. Leading a trick is always unrestricted.
 *  2. Otherwise you must follow the led suit if you hold any card of it.
 *  3. If you're void in the led suit, you're free to play trump OR any
 *     other suit (§15: "♥ yoksa koz atabilir veya başka renk oynayabilir") -
 *     there is no forced trump-when-void and no must-overtrump rule.
 */
export function legalPlays(hand: Card[], trick: TrickCard[], _trumpSuit: Suit | null): Card[] {
  if (trick.length === 0) return hand.slice();

  const ledSuit = trick[0].card.suit;
  const cardsOfLedSuit = hand.filter((c) => c.suit === ledSuit);
  return cardsOfLedSuit.length > 0 ? cardsOfLedSuit.slice() : hand.slice();
}

export function isLegalPlay(card: Card, hand: Card[], trick: TrickCard[], trumpSuit: Suit | null): boolean {
  const legal = legalPlays(hand, trick, trumpSuit);
  return legal.some((c) => c.suit === card.suit && c.rank === card.rank);
}

/**
 * Determines which player won a completed trick (§3, §10):
 *  1. If any trump was played, the highest trump wins.
 *  2. Otherwise the highest card of the led suit wins.
 */
export function trickWinner(trick: TrickCard[], trumpSuit: Suit | null): PlayerIndex {
  if (trick.length === 0) {
    throw new Error('cannot determine winner of an empty trick');
  }
  const ledSuit = trick[0].card.suit;
  const trumpsPlayed = trumpSuit ? trick.filter((tc) => tc.card.suit === trumpSuit) : [];
  const pool = trumpsPlayed.length > 0 ? trumpsPlayed : trick.filter((tc) => tc.card.suit === ledSuit);
  return pool.reduce((best, tc) => (tc.card.rank > best.card.rank ? tc : best), pool[0]).player;
}
