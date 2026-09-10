/**
 * Concrete `IBatakRuleSet` implementations for the seven variants in §27,
 * and the `createMatchConfig()` factory that turns a `VariantId` plus a
 * handful of table-level overrides into a full `MatchConfig` (§31).
 *
 * §70 ("Kural Çakışması Yönetimi") puts room-level custom rules above the
 * variant's own defaults; `createMatchConfig`'s `overrides` argument is that
 * "Room Custom Rules" layer - it only ever touches the tunable extras
 * (minimumBid/maximumBid/scoreMode/targetScore/...), never a variant's core
 * identity (playerCount, isTeamGame, fixedTrump, ...), so a table can never
 * end up in an inconsistent shape (e.g. "team game with no fixed trump but
 * open bidding" isn't representable except by picking TEAM_OPEN_BID).
 */
import { BiddingStyle, IBatakRuleSet, MatchConfig, ScoreMode, TeamBidMode, VariantId, AllPassAction, GameEndMode } from './types.js';

function normalBid(): IBatakRuleSet {
  return {
    playerCount: 4,
    cardsPerPlayer: 13,
    totalTricks: 13,
    minimumBid: 5,
    maximumBid: 13,
    isTeamGame: false,
    isOpenBidding: false,
    mustFollowSuit: true,
    canPass: true,
    bidWinnerChoosesTrump: true,
    bidWinnerStarts: true,
    fixedTrump: null,
  };
}

function openBid(): IBatakRuleSet {
  return { ...normalBid(), isOpenBidding: true };
}

function teamBid(): IBatakRuleSet {
  return { ...normalBid(), minimumBid: 8, isTeamGame: true };
}

function teamOpenBid(): IBatakRuleSet {
  return { ...teamBid(), isOpenBidding: true };
}

function spades(): IBatakRuleSet {
  return {
    playerCount: 4,
    cardsPerPlayer: 13,
    totalTricks: 13,
    minimumBid: 1,
    maximumBid: 13,
    isTeamGame: false,
    isOpenBidding: false,
    mustFollowSuit: true,
    canPass: false, // Mod B (taahhütlü) is a simultaneous personal commitment, not a competitive auction - see §8.
    bidWinnerChoosesTrump: false, // trump is always ♠, nobody "wins" and picks it.
    bidWinnerStarts: false, // no single auction winner - the player left of the dealer always leads.
    fixedTrump: 'S',
  };
}

function teamSpades(): IBatakRuleSet {
  return { ...spades(), isTeamGame: true };
}

/** buriedCardCount must divide 52 into 4 equal hands, so it's constrained to a multiple of 4 (§10). */
function buriedBid(buriedCardCount: number): IBatakRuleSet {
  const cardsPerPlayer = (52 - buriedCardCount) / 4;
  return {
    playerCount: 4,
    cardsPerPlayer,
    totalTricks: cardsPerPlayer,
    minimumBid: 5,
    maximumBid: cardsPerPlayer,
    isTeamGame: false,
    isOpenBidding: false,
    mustFollowSuit: true,
    canPass: true,
    bidWinnerChoosesTrump: true,
    bidWinnerStarts: true,
    fixedTrump: null,
  };
}

function baseRuleSet(variantId: VariantId, buriedCardCount: number): IBatakRuleSet {
  switch (variantId) {
    case 'NORMAL_BID':
      return normalBid();
    case 'OPEN_BID':
      return openBid();
    case 'TEAM_BID':
      return teamBid();
    case 'TEAM_OPEN_BID':
      return teamOpenBid();
    case 'SPADES':
      return spades();
    case 'TEAM_SPADES':
      return teamSpades();
    case 'BURIED_BID':
      return buriedBid(buriedCardCount);
  }
}

export interface MatchConfigOverrides {
  minimumBid?: number;
  maximumBid?: number;
  scoreMode?: ScoreMode;
  targetScore?: number;
  maxRounds?: number;
  gameEndMode?: GameEndMode;
  allPassAction?: AllPassAction;
  /** BURIED_BID only - kitty size, must be a multiple of 4 (§10). */
  buriedCardCount?: number;
  /** SPADES/TEAM_SPADES only - true = Mod B taahhütlü (default), false = Mod A ihalesiz (§8). */
  spadesBiddingEnabled?: boolean;
  /** TEAM_SPADES only (§9). */
  teamBidMode?: TeamBidMode;
  reconnectSeconds?: number;
  botTakeoverSeconds?: number;
}

export function createMatchConfig(variantId: VariantId, overrides: MatchConfigOverrides = {}): MatchConfig {
  const buriedCardCount = variantId === 'BURIED_BID' ? overrides.buriedCardCount ?? 4 : 4;
  const ruleSet = baseRuleSet(variantId, buriedCardCount);

  const isSpadesVariant = variantId === 'SPADES' || variantId === 'TEAM_SPADES';
  const spadesBiddingEnabled = overrides.spadesBiddingEnabled ?? true;
  const biddingStyle: BiddingStyle = isSpadesVariant ? (spadesBiddingEnabled ? 'commitment' : 'none') : 'auction';

  return {
    ...ruleSet,
    minimumBid: overrides.minimumBid ?? ruleSet.minimumBid,
    maximumBid: overrides.maximumBid ?? ruleSet.maximumBid,

    variantId,
    biddingStyle,

    scoreMode: overrides.scoreMode ?? 'TakenMinusBidOnFail',
    gameEndMode: overrides.gameEndMode ?? 'targetScore',
    targetScore: overrides.targetScore ?? 101,
    maxRounds: overrides.maxRounds ?? 8,
    allPassAction: overrides.allPassAction ?? 'dealerTakesMinimum',

    buriedCards: variantId === 'BURIED_BID',
    buriedCardCount,

    spadesBiddingEnabled,
    teamBidMode: overrides.teamBidMode ?? 'individualSum',

    reconnectSeconds: overrides.reconnectSeconds ?? 30,
    botTakeoverSeconds: overrides.botTakeoverSeconds ?? 1,
  };
}

// Named factories per §26 ("Implementasyonlar").
export const NormalBidRuleSet = (overrides?: MatchConfigOverrides): MatchConfig => createMatchConfig('NORMAL_BID', overrides);
export const OpenBidRuleSet = (overrides?: MatchConfigOverrides): MatchConfig => createMatchConfig('OPEN_BID', overrides);
export const TeamBidRuleSet = (overrides?: MatchConfigOverrides): MatchConfig => createMatchConfig('TEAM_BID', overrides);
export const TeamOpenBidRuleSet = (overrides?: MatchConfigOverrides): MatchConfig => createMatchConfig('TEAM_OPEN_BID', overrides);
export const SpadesRuleSet = (overrides?: MatchConfigOverrides): MatchConfig => createMatchConfig('SPADES', overrides);
export const TeamSpadesRuleSet = (overrides?: MatchConfigOverrides): MatchConfig => createMatchConfig('TEAM_SPADES', overrides);
export const BuriedBidRuleSet = (overrides?: MatchConfigOverrides): MatchConfig => createMatchConfig('BURIED_BID', overrides);
