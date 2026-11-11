/**
 * "Normal" bot AI (per BATAK_DETAYLI_KURALLAR_VE_OYUN_TIPLERI.md §22):
 * follows suit (via the engine's own legality checks), plays economically
 * (cheapest legal card, cash aces/kings when leading), and bids/commits using a small hand-strength heuristic. Kept
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
  const state = game.getPublicState(seat);
  const trump = state.contract?.trumpSuit ?? null;
  const asc = legal.slice().sort((a, b) => a.rank - b.rank);

  // Following (or ruffing / discarding): the engine already forces beating cards when
  // possible, so the cheapest legal card is always the right economy play.
  if (state.currentTrick.length > 0) return asc[0];

  // Leading: cash sure winners first (aces, then kings of a side suit; top trump once trump is broken).
  const sideAces = legal.filter((c) => c.rank === 14 && c.suit !== trump);
  if (sideAces.length > 0) return sideAces[0];
  if (trump && state.trumpBroken) {
    const topTrump = legal.filter((c) => c.suit === trump).sort((a, b) => b.rank - a.rank)[0];
    if (topTrump && topTrump.rank >= 13) return topTrump;
  }
  const sideKings = legal.filter((c) => c.rank === 13 && c.suit !== trump);
  if (sideKings.length > 0) return sideKings[0];

  // Otherwise lead low from the longest side suit to keep the high cards for later.
  const count: Record<string, number> = {};
  for (const c of legal) count[c.suit] = (count[c.suit] ?? 0) + 1;
  return asc.slice().sort((a, b) => (a.suit === trump ? 1 : 0) - (b.suit === trump ? 1 : 0) || count[b.suit] - count[a.suit] || a.rank - b.rank)[0];
}

/** Gömmeli mode: discard the lowest-ranked cards - a simple, safe default. */
export function decideBotExchange(game: Game, seat: PlayerIndex): Card[] {
  const hand = game.getPublicState(seat).hand;
  return hand
    .slice()
    .sort((a, b) => a.rank - b.rank)
    .slice(0, game.config.buriedCardCount);
}
