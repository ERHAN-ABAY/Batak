import { Card, PlayerIndex, Suit, TrickCard } from './types.js';

export interface TrickRules {
  /** Must a player void in the led suit play trump if they hold one? */
  mustTrumpWhenVoid: boolean;
  /** Must a player play a beating card from their eligible category if they have one? */
  mustOvertrumpOrBeat: boolean;
}

export const DEFAULT_TRICK_RULES: TrickRules = {
  mustTrumpWhenVoid: true,
  mustOvertrumpOrBeat: true,
};

/** The card currently winning a trick (complete or partial - trick must be non-empty). */
function currentBestTrickCard(trick: TrickCard[], trumpSuit: Suit | null): TrickCard {
  const ledSuit = trick[0].card.suit;
  const trumpsPlayed = trumpSuit ? trick.filter((tc) => tc.card.suit === trumpSuit) : [];
  const pool = trumpsPlayed.length > 0 ? trumpsPlayed : trick.filter((tc) => tc.card.suit === ledSuit);
  return pool.reduce((best, tc) => (tc.card.rank > best.card.rank ? tc : best), pool[0]);
}

/**
 * Legal cards for whoever is now to act, given their hand, the cards
 * already played in the current trick, the trump suit, and the table's
 * trick rules.
 *
 * Rules enforced (each individually configurable via `rules`):
 *  1. Leading a trick is always unrestricted.
 *  2. Otherwise you must follow the led suit if you hold any card of it.
 *  3. If you cannot follow suit but hold a trump card and
 *     `mustTrumpWhenVoid` is on, you must play trump ("zorunlu kesme") -
 *     you may not discard a card of a third suit while still holding
 *     trump. When off, void players may discard anything freely.
 *  4. When `mustOvertrumpOrBeat` is on: within whichever category (2) or
 *     (3) applies, if any of your cards in that category would beat the
 *     current best card of the trick, you are required to play one of
 *     those beating cards ("üstüne basma zorunluluğu"). Only when none of
 *     your cards in that category can beat the current best are you free
 *     to play any card from it. When off, any card from the category is
 *     always legal.
 *  5. If neither (2) nor (3) applies (void in the led suit, no trump suit
 *     in play, or no trump cards left), any card may be discarded freely.
 */
export function legalPlays(
  hand: Card[],
  trick: TrickCard[],
  trumpSuit: Suit | null,
  rules: TrickRules = DEFAULT_TRICK_RULES
): Card[] {
  if (trick.length === 0) return hand.slice();

  const ledSuit = trick[0].card.suit;
  const cardsOfLedSuit = hand.filter((c) => c.suit === ledSuit);
  const trumpCards = trumpSuit ? hand.filter((c) => c.suit === trumpSuit) : [];

  const eligible =
    cardsOfLedSuit.length > 0
      ? cardsOfLedSuit
      : rules.mustTrumpWhenVoid && trumpCards.length > 0
        ? trumpCards
        : hand;

  if (!rules.mustOvertrumpOrBeat) return eligible.slice();

  const currentBest = currentBestTrickCard(trick, trumpSuit).card;
  const beating = eligible.filter((c) => c.suit === currentBest.suit && c.rank > currentBest.rank);

  return beating.length > 0 ? beating : eligible.slice();
}

export function isLegalPlay(
  card: Card,
  hand: Card[],
  trick: TrickCard[],
  trumpSuit: Suit | null,
  rules: TrickRules = DEFAULT_TRICK_RULES
): boolean {
  const legal = legalPlays(hand, trick, trumpSuit, rules);
  return legal.some((c) => c.suit === card.suit && c.rank === card.rank);
}

/** Determines which player won a completed (4-card) trick. */
export function trickWinner(trick: TrickCard[], trumpSuit: Suit | null): PlayerIndex {
  if (trick.length === 0) {
    throw new Error('cannot determine winner of an empty trick');
  }
  return currentBestTrickCard(trick, trumpSuit).player;
}
