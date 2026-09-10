import { Card, PlayerIndex, Suit, TrickCard } from './types.js';

/**
 * Legal cards for whoever is now to act (§3 "El kazanma", §15 "Renk takip
 * zorunluluğu", plus the standard "koz kırılmadan koz ile çıkılamaz" trump-
 * breaking rule):
 *  1. Following a trick already in progress: you must follow the led suit
 *     if you hold any card of it; if you're void, you're free to play
 *     trump OR any other suit (§15: "♥ yoksa koz atabilir veya başka renk
 *     oynayabilir") - there is no forced trump-when-void and no
 *     must-overtrump rule.
 *  2. Leading a trick: any non-trump card is always legal. A trump card
 *     may only be led once trump has been "broken" this hand - i.e. once
 *     some earlier trick has had a trump card played on it (necessarily as
 *     a ruff, since leading trump before it's broken is exactly what this
 *     rule forbids) - or if trump is the only suit left in the leader's
 *     hand (otherwise they'd be unable to lead at all).
 */
export function legalPlays(hand: Card[], trick: TrickCard[], trumpSuit: Suit | null, trumpBroken: boolean): Card[] {
  if (trick.length === 0) {
    if (!trumpSuit) return hand.slice();
    if (trumpBroken || hand.every((c) => c.suit === trumpSuit)) return hand.slice();
    const nonTrump = hand.filter((c) => c.suit !== trumpSuit);
    return nonTrump.length > 0 ? nonTrump : hand.slice();
  }

  const ledSuit = trick[0].card.suit;
  const cardsOfLedSuit = hand.filter((c) => c.suit === ledSuit);
  return cardsOfLedSuit.length > 0 ? cardsOfLedSuit.slice() : hand.slice();
}

export function isLegalPlay(
  card: Card,
  hand: Card[],
  trick: TrickCard[],
  trumpSuit: Suit | null,
  trumpBroken: boolean
): boolean {
  const legal = legalPlays(hand, trick, trumpSuit, trumpBroken);
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
