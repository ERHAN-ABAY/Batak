export type BatakErrorCode =
  | 'NOT_PLAYER_TURN'
  | 'CARD_NOT_IN_HAND'
  | 'MUST_FOLLOW_SUIT'
  | 'BID_TOO_LOW'
  | 'BID_TOO_HIGH'
  | 'INVALID_BID'
  | 'ALREADY_PASSED'
  | 'INVALID_TRUMP'
  | 'GAME_NOT_STARTED'
  | 'BIDDING_NOT_ACTIVE'
  | 'TRUMP_ALREADY_SELECTED'
  | 'NOT_CHOOSING_TRUMP'
  | 'NOT_DECLARER'
  | 'NOT_EXCHANGE_PHASE'
  | 'INVALID_EXCHANGE'
  | 'TRICK_ALREADY_COMPLETE'
  | 'PLAYER_DISCONNECTED'
  | 'MATCH_ALREADY_COMPLETE'
  | 'WRONG_PHASE';

/** A domain error carrying a stable machine-readable `code` alongside a human message. */
export class BatakError extends Error {
  readonly code: BatakErrorCode;
  constructor(code: BatakErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'BatakError';
    this.code = code;
  }
}
