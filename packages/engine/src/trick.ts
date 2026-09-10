import { Card, PlayerIndex, Suit, TrickCard } from './types.js';

/** The card currently winning a trick (complete or partial - trick must be non-empty). */
function bestCardInTrick(trick: TrickCard[], trumpSuit: Suit | null): TrickCard {
  const ledSuit = trick[0].card.suit;
  const trumpsPlayed = trumpSuit ? trick.filter((tc) => tc.card.suit === trumpSuit) : [];
  const pool = trumpsPlayed.length > 0 ? trumpsPlayed : trick.filter((tc) => tc.card.suit === ledSuit);
  return pool.reduce((best, tc) => (tc.card.rank > best.card.rank ? tc : best), pool[0]);
}

/**
 * Legal cards for whoever is now to act (§3 "El kazanma", §15 "Renk takip
 * zorunluluğu", plus real-table rules the source document doesn't spell
 * out in full but that a live game must enforce):
 *
 *  1. Following a trick already in progress: you must follow the led suit
 *     if you hold any card of it.
 *  2. "Zorunlu kesme": if you're void in the led suit but hold trump, you
 *     must play trump - you may not sluff a card of some third suit while
 *     still holding trump. Only when you're void in the led suit AND hold
 *     no trump at all are you free to discard anything.
 *  3. "Üstüne basma zorunluluğu" (must-beat): within whichever set (1) or
 *     (2) leaves you - your led-suit cards, or your trump cards if void -
 *     if any of those cards would beat the trick's current best card (same
 *     suit, higher rank), you must play one of those beating cards. Only
 *     when none of your eligible cards can beat the current best are you
 *     free to play anything from that set (e.g. you may trump in cheaply
 *     with your lowest trump when you're the first to trump the trick,
 *     since nothing there yet has your trump's suit to "beat"; but once
 *     someone else has already trumped, you may not sit on a low trump if
 *     you're holding a higher one that would take it).
 *  4. Leading a trick: any non-trump card is always legal. A trump card
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
  const trumpCards = trumpSuit ? hand.filter((c) => c.suit === trumpSuit) : [];
  const eligible = cardsOfLedSuit.length > 0 ? cardsOfLedSuit : trumpCards.length > 0 ? trumpCards : hand;

  const currentBest = bestCardInTrick(trick, trumpSuit).card;
  const beating = eligible.filter((c) => c.suit === currentBest.suit && c.rank > currentBest.rank);

  return (beating.length > 0 ? beating : eligible).slice();
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
  return bestCardInTrick(trick, trumpSuit).player;
}
