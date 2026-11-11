/**
 * Bot AI. Plays only from information a human at the table would have: its
 * own hand, the cards already played (card counting), the current trick, the
 * contract and - in team games - its partner's seat. The engine already
 * forces follow-suit / ruff / must-beat, so the bot only chooses among legal cards.
 */
import { Bid, Card, Game, PlayerIndex, PublicState, Suit, TrickCard, partnerOf, teamOf } from '@batak/engine';

const SUITS: Suit[] = ['S', 'H', 'D', 'C'];
const HONOR_WEIGHT: Record<number, number> = { 14: 1, 13: 0.85, 12: 0.55, 11: 0.3 };

// ---------- Hand evaluation (bidding + trump choice) ----------

function bySuit(hand: Card[]): Record<Suit, number[]> {
  const m: Record<Suit, number[]> = { S: [], H: [], D: [], C: [] };
  for (const c of hand) m[c.suit].push(c.rank);
  for (const s of SUITS) m[s].sort((a, b) => b - a);
  return m;
}

/** Expected tricks if `trump` is trump: top trumps + trump length, side-suit winners, and ruffs from short suits. */
function estimateWithTrump(hand: Card[], trump: Suit): number {
  const m = bySuit(hand);
  const t = m[trump];
  let total = 0;

  // Trump: honours count, and every trump beyond the 3 the opponents typically split counts as a long-card trick.
  for (const r of t) total += HONOR_WEIGHT[r] ?? 0;
  total += Math.max(0, t.length - 3) * 0.7;

  let ruffs = 0;
  for (const s of SUITS) {
    if (s === trump) continue;
    const ranks = m[s];
    const len = ranks.length;
    if (ranks.includes(14)) total += 1;
    if (ranks.includes(13)) total += len >= 2 ? 0.8 : 0.4; // a bare king is easily caught
    if (ranks.includes(12) && len >= 3) total += ranks.includes(14) || ranks.includes(13) ? 0.5 : 0.25;
    if (len >= 6) total += 0.5; // a long side suit eventually cashes
    if (t.length >= 3) ruffs += len === 0 ? 1.2 : len === 1 ? 0.8 : len === 2 ? 0.4 : 0;
  }
  total += Math.min(ruffs, Math.max(0, t.length - 1));
  return total;
}

function bestTrump(hand: Card[]): { suit: Suit; tricks: number } {
  let best = { suit: SUITS[0], tricks: -1 };
  for (const s of SUITS) {
    const tricks = estimateWithTrump(hand, s);
    if (tricks > best.tricks) best = { suit: s, tricks };
  }
  return best;
}

export function decideBotBid(game: Game, seat: PlayerIndex): Bid {
  const state = game.getPublicState(seat);
  const hand = state.hand;
  const cfg = game.config;

  if (cfg.biddingStyle === 'commitment') {
    // Koz Maça taahhütlü: a personal target - bid slightly under the estimate, a miss costs a lot.
    const est = estimateWithTrump(hand, cfg.fixedTrump ?? 'S');
    const value = Math.min(cfg.maximumBid, Math.max(cfg.minimumBid, Math.floor(est + 0.2)));
    return { player: seat, type: 'bid', value };
  }

  let est = bestTrump(hand).tricks;
  if (cfg.isTeamGame) {
    // The team contract counts the partner's tricks too (and in open bidding the declarer plays both hands).
    est += 2.6;
    if (cfg.isOpenBidding) est += 0.4;
  }
  const ceiling = Math.min(cfg.maximumBid, Math.floor(est + 0.25));
  const current = state.highestBid?.value ?? cfg.minimumBid - 1;
  const next = Math.max(current + 1, cfg.minimumBid);

  if (next > ceiling) return { player: seat, type: 'pas' };
  // Raise by the minimum step - never jump past what is needed to win the auction.
  return { player: seat, type: 'bid', value: next };
}

export function decideBotTrumpSuit(game: Game, seat: PlayerIndex): Suit {
  return bestTrump(game.getPublicState(seat).hand).suit;
}

// ---------- Card play ----------

interface Ctx {
  hand: Card[];
  trump: Suit | null;
  trick: TrickCard[];
  seen: Set<string>; // played + in my hand + in the current trick + face-up open hand
  needTricks: number | null; // tricks my side still needs for its contract (null = no target)
}

const key = (c: Card) => `${c.rank}${c.suit}`;

/** True if no unseen card of the same suit outranks `card`. */
function isTopCard(card: Card, ctx: Ctx): boolean {
  for (let r = card.rank + 1; r <= 14; r++) {
    if (!ctx.seen.has(`${r}${card.suit}`)) return false;
  }
  return true;
}

function unseenCount(suit: Suit, ctx: Ctx): number {
  let n = 0;
  for (let r = 2; r <= 14; r++) if (!ctx.seen.has(`${r}${suit}`)) n++;
  return n;
}

function currentBest(trick: TrickCard[], trump: Suit | null): TrickCard {
  const led = trick[0].card.suit;
  const trumps = trump ? trick.filter((t) => t.card.suit === trump) : [];
  const pool = trumps.length ? trumps : trick.filter((t) => t.card.suit === led);
  return pool.reduce((b, t) => (t.card.rank > b.card.rank ? t : b), pool[0]);
}

function buildCtx(state: PublicState, owner: PlayerIndex): Ctx {
  const seen = new Set<string>();
  for (const c of state.hand) seen.add(key(c));
  for (const c of state.playedCards) seen.add(key(c));
  for (const t of state.currentTrick) seen.add(key(t.card));
  if (state.openHand) for (const c of state.openHand.cards) seen.add(key(c));

  const contract = state.contract;
  let need: number | null = null;
  if (contract) {
    const team = state.ruleSet.isTeamGame;
    const target = team ? contract.teamTargets[teamOf(owner)] : contract.targets[owner];
    if (target !== undefined) {
      const won = team ? state.tricksWon[owner] + state.tricksWon[partnerOf(owner)] : state.tricksWon[owner];
      need = target - won;
    }
  }
  return { hand: state.hand, trump: contract?.trumpSuit ?? null, trick: state.currentTrick, seen, needTricks: need };
}

/**
 * `owner` is the seat whose card is being played. In open bidding the
 * declarer plays the face-up partner's cards, so the decision is made from
 * that hand (which is public anyway).
 */
export function decideBotPlay(game: Game, owner: PlayerIndex): Card {
  const legal = game.getLegalPlays(owner);
  if (legal.length === 1) return legal[0];
  const state = game.getPublicState(owner);
  const ctx = buildCtx(state, owner);
  const asc = legal.slice().sort((a, b) => a.rank - b.rank);

  const contract = state.contract;
  const declaring =
    !!contract &&
    (contract.declarer === null ||
      (state.ruleSet.isTeamGame ? teamOf(contract.declarer) === teamOf(owner) : contract.declarer === owner));

  return ctx.trick.length === 0 ? chooseLead(asc, ctx, declaring) : chooseFollow(asc, ctx, state, owner);
}

function chooseFollow(asc: Card[], ctx: Ctx, state: PublicState, owner: PlayerIndex): Card {
  const best = currentBest(ctx.trick, ctx.trump);
  const beating = asc.filter((c) => c.suit === best.card.suit && c.rank > best.card.rank);
  const playersAfterMe = 3 - ctx.trick.length;
  const partnerWinning = state.ruleSet.isTeamGame && best.player === partnerOf(owner);

  if (beating.length > 0) {
    // The engine only offers beating cards here (must-beat). Win as cheaply as is safe.
    if (playersAfterMe === 0) return beating[0];
    const safe = beating.find((c) => cannotBeOvertaken(c, ctx, playersAfterMe));
    if (safe) return safe;
    if (partnerWinning) return beating[0];
    // Nothing is safe: commit a strong card if I hold one, otherwise stay cheap.
    const top = beating[beating.length - 1];
    return top.rank >= 13 ? top : beating[0];
  }

  // Cannot beat the trick.
  const led = ctx.trick[0].card.suit;
  if (asc.every((c) => c.suit === led)) return asc[0]; // following suit: play low
  if (ctx.trump && asc.every((c) => c.suit === ctx.trump)) return asc[0]; // forced ruff: lowest trump
  return pickDiscard(asc, ctx);
}

function cannotBeOvertaken(card: Card, ctx: Ctx, playersAfterMe: number): boolean {
  if (ctx.trump && card.suit === ctx.trump) {
    for (let r = card.rank + 1; r <= 14; r++) if (!ctx.seen.has(`${r}${ctx.trump}`)) return false;
    return true;
  }
  if (!isTopCard(card, ctx)) return false;
  // A later player void in this suit could still ruff; treat it as safe only when no trump is left outside
  // or when the suit is still plentiful (so a void is unlikely).
  if (ctx.trump && unseenCount(ctx.trump, ctx) > 0) {
    return unseenCount(card.suit, ctx) >= playersAfterMe * 2;
  }
  return true;
}

/** Discard: keep trump and winners; throw the lowest card, preferring the suit I hold most of. */
function pickDiscard(asc: Card[], ctx: Ctx): Card {
  const side = asc.filter((c) => c.suit !== ctx.trump);
  const pool = side.length > 0 ? side : asc;
  const count: Record<string, number> = {};
  for (const c of ctx.hand) count[c.suit] = (count[c.suit] ?? 0) + 1;
  return pool
    .slice()
    .sort((a, b) => {
      const wa = isTopCard(a, ctx) ? 1 : 0;
      const wb = isTopCard(b, ctx) ? 1 : 0;
      return wa - wb || a.rank - b.rank || (count[b.suit] ?? 0) - (count[a.suit] ?? 0);
    })[0];
}

function chooseLead(asc: Card[], ctx: Ctx, declaring: boolean): Card {
  const trump = ctx.trump;
  const side = asc.filter((c) => c.suit !== trump);
  const trumps = asc.filter((c) => c.suit === trump);
  const sideWinners = side.filter((c) => isTopCard(c, ctx)).sort((a, b) => b.rank - a.rank);
  const trumpWinners = trumps.filter((c) => isTopCard(c, ctx)).sort((a, b) => b.rank - a.rank);
  const made = ctx.needTricks !== null && ctx.needTricks <= 0;
  const count: Record<string, number> = {};
  for (const c of ctx.hand) count[c.suit] = (count[c.suit] ?? 0) + 1;

  if (made) {
    // Contract already safe: cash sure winners for extra points, otherwise throw the cheapest card.
    if (sideWinners.length > 0) return sideWinners[0];
    return asc.slice().sort((a, b) => (a.suit === trump ? 1 : 0) - (b.suit === trump ? 1 : 0) || a.rank - b.rank)[0];
  }

  if (declaring) {
    // Draw the opponents' trumps while I own the top ones, then cash side winners.
    if (trump && trumpWinners.length > 0 && unseenCount(trump, ctx) > 0 && trumps.length >= 3) return trumpWinners[0];
    if (sideWinners.length > 0) return sideWinners[0];
    if (trumpWinners.length > 0) return trumpWinners[0];
    // Establish the longest side suit: lead a high card from it, else the lowest.
    const pool = side.length ? side : asc;
    const suit = pool.slice().sort((a, b) => count[b.suit] - count[a.suit] || b.rank - a.rank)[0].suit;
    const ofSuit = pool.filter((c) => c.suit === suit).sort((a, b) => b.rank - a.rank);
    return ofSuit[0].rank >= 12 ? ofSuit[0] : ofSuit[ofSuit.length - 1];
  }

  // Defending: take certain tricks, otherwise lead low from my shortest side suit (sets up ruffs / forces the declarer).
  if (sideWinners.length > 0) return sideWinners[0];
  if (side.length > 0) return side.slice().sort((a, b) => count[a.suit] - count[b.suit] || a.rank - b.rank)[0];
  return asc[0];
}

/** Gömmeli mode: discard the lowest-ranked cards - a simple, safe default. */
export function decideBotExchange(game: Game, seat: PlayerIndex): Card[] {
  const hand = game.getPublicState(seat).hand;
  return hand
    .slice()
    .sort((a, b) => a.rank - b.rank)
    .slice(0, game.config.buriedCardCount);
}
