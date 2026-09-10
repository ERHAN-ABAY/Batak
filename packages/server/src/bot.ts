/**
 * "Easy" bot AI (per BATAK_DETAYLI_KURALLAR_VE_OYUN_TIPLERI.md §22):
 * follows suit (via the engine's own legality checks), plays a random
 * legal card, and bids/commits using a small hand-strength heuristic. Kept
 * deliberately simple - this is the "Kolay" tier, not Normal/Zor/Uzman.
 */
import { Bid, Card, Game, MatchConfig, PlayerIndex, Suit } from '@batak/engine';

const SUITS: Suit[] = ['S', 'H', 'D', 'C'];

/**
 * Rough "playing tricks" estimate for one hand - how many tricks this hand
 * could realistically take if its longest suit becomes trump:
 *  - each Ace is a near-certain trick, each King close behind, a Queen
 *    backed by at least one more card of that suit is a slim half-trick
 *  - the single longest suit (the one a bot would actually choose as
 *    trump) also earns a length bonus for cards beyond the first four,
 *    since a long trump suit keeps winning tricks once the short suits
 *    run out. Off-suits don't get this bonus - without trump backing,
 *    length alone rarely turns into tricks.
 */
function estimateTricks(hand: Card[]): number {
  const bySuit: Record<Suit, number[]> = { S: [], H: [], D: [], C: [] };
  for (const c of hand) bySuit[c.suit].push(c.rank);

  const longestSuit = SUITS.reduce((best, s) => (bySuit[s].length > bySuit[best].length ? s : best), SUITS[0]);

  let total = 0;
  for (const suit of SUITS) {
    const ranks = bySuit[suit];
    if (ranks.includes(14)) total += 1; // As
    if (ranks.includes(13)) total += 1; // Papaz
    if (ranks.includes(12) && ranks.length >= 2) total += 0.5; // Kız, desteklenmişse
    if (suit === longestSuit) total += Math.max(0, ranks.length - 4) * 0.75;
  }
  return total;
}

/** The highest trick count this bot realistically believes it (or its team) can deliver. */
function estimatedCeiling(config: MatchConfig, hand: Card[]): number {
  let tricks = estimateTricks(hand);
  if (config.isTeamGame) tricks += 3; // partner's hand is unknown - assume a modest average contribution
  return Math.min(config.maximumBid, Math.max(0, Math.round(tricks)));
}

export function decideBotBid(game: Game, seat: PlayerIndex): Bid {
  const hand = game.getPublicState(seat).hand;

  if (game.config.biddingStyle === 'commitment') {
    // Koz Maça taahhütlü: a personal target, always required, no pass.
    const value = Math.min(game.config.maximumBid, Math.max(game.config.minimumBid, Math.round(estimateTricks(hand))));
    return { player: seat, type: 'bid', value };
  }

  const ceiling = estimatedCeiling(game.config, hand);
  const currentValue = game.getPublicState(seat).highestBid?.value ?? game.config.minimumBid - 1;
  const nextValue = Math.max(currentValue + 1, game.config.minimumBid);

  // Raise by the minimum needed step, never straight to the ceiling - this
  // keeps the winning bid close to what's actually required instead of
  // bots jumping to (and overshooting) their own estimate immediately.
  if (nextValue <= ceiling && nextValue <= game.config.maximumBid) {
    return { player: seat, type: 'bid', value: nextValue };
  }
  return { player: seat, type: 'pas' };
}

export function decideBotTrumpSuit(game: Game, seat: PlayerIndex): Suit {
  const hand = game.getPublicState(seat).hand;
  const bySuit: Record<Suit, number> = { S: 0, H: 0, D: 0, C: 0 };
  for (const c of hand) bySuit[c.suit] += 1;
  return SUITS.reduce((best, s) => (bySuit[s] > bySuit[best] ? s : best), SUITS[0]);
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
