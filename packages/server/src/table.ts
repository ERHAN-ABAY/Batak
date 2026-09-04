import { randomBytes } from 'node:crypto';
import { Game, GameEndMode, MatchConfig, PenaltyMode, PlayerIndex, ScoringMode } from '@batak/engine';

export interface Seat {
  playerId: string;
  name: string;
  socketId: string | null;
  connected: boolean;
  reconnectToken: string;
  isBot: boolean;
  disconnectedAt: number | null;
}

export interface Spectator {
  playerId: string;
  name: string;
  socketId: string | null;
  connected: boolean;
  reconnectToken: string;
}

export interface TableModes {
  partnership: boolean;
  openHand: boolean;
  fixedSpadesTrump: boolean;
  strictTrumpRules: boolean;
  buriedCards: boolean;
  allowSpectators: boolean;
}

export interface TableRules {
  scoringMode: ScoringMode;
  penaltyMode: PenaltyMode;
  gameEndMode: GameEndMode;
  targetScore: number;
  handsPerMatch: number;
  minBid: number;
}

const SEAT_INDICES: PlayerIndex[] = [0, 1, 2, 3];
const BOT_NAMES = ['Bot Ayşe', 'Bot Veli', 'Bot Cem', 'Bot Zeynep', 'Bot Kaan', 'Bot Deniz', 'Bot Elif', 'Bot Onur'];
let botNameCursor = 0;

function genToken(): string {
  return randomBytes(16).toString('hex');
}

function genBotPlayerId(): string {
  return `bot_${randomBytes(6).toString('hex')}`;
}

export class Table {
  readonly id: string;
  readonly name: string;
  readonly modes: TableModes;
  readonly rules: TableRules;
  seats: (Seat | null)[] = [null, null, null, null];
  spectators: Spectator[] = [];
  hostPlayerId: string | null = null;
  game: Game | null = null;
  createdAt = Date.now();
  chatHistory: { name: string; text: string; ts: number }[] = [];

  constructor(id: string, name: string, modes: Partial<TableModes> = {}, rules: Partial<TableRules> = {}) {
    this.id = id;
    this.name = name;
    this.modes = {
      partnership: !!modes.partnership,
      openHand: !!modes.partnership && !!modes.openHand,
      fixedSpadesTrump: !!modes.fixedSpadesTrump,
      strictTrumpRules: modes.strictTrumpRules ?? true,
      buriedCards: !!modes.buriedCards,
      allowSpectators: modes.allowSpectators ?? true,
    };
    this.rules = {
      scoringMode: rules.scoringMode ?? 'takenTricks',
      penaltyMode: rules.penaltyMode ?? 'negativeBid',
      gameEndMode: rules.gameEndMode ?? 'targetScore',
      targetScore: clampNumber(rules.targetScore, 20, 2000, 101),
      handsPerMatch: clampNumber(rules.handsPerMatch, 1, 100, 8),
      minBid: clampNumber(rules.minBid, 1, 13, 5),
    };
  }

  get seatedCount(): number {
    return this.seats.filter((s) => s !== null).length;
  }

  findSeatByPlayerId(playerId: string): PlayerIndex | null {
    const idx = this.seats.findIndex((s) => s?.playerId === playerId);
    return idx === -1 ? null : (idx as PlayerIndex);
  }

  findSeatBySocketId(socketId: string): PlayerIndex | null {
    const idx = this.seats.findIndex((s) => s?.socketId === socketId);
    return idx === -1 ? null : (idx as PlayerIndex);
  }

  findSpectatorByPlayerId(playerId: string): Spectator | undefined {
    return this.spectators.find((s) => s.playerId === playerId);
  }

  findSpectatorBySocketId(socketId: string): Spectator | undefined {
    return this.spectators.find((s) => s.socketId === socketId);
  }

  isFull(): boolean {
    return this.seatedCount === 4;
  }

  /**
   * Seats a (possibly reconnecting) player, or - if the table is full and
   * spectators are allowed - adds/reconnects them as a spectator instead.
   * A reconnecting playerId MUST present the matching reconnectToken
   * (issued on first join) or the reclaim is rejected - this is what
   * stops a guessed/leaked playerId from hijacking someone else's seat.
   */
  join(
    playerId: string,
    name: string,
    socketId: string,
    reconnectToken?: string
  ): { seat: PlayerIndex | null; reconnectToken: string; isSpectator: boolean } {
    const existingSeatIdx = this.findSeatByPlayerId(playerId);
    if (existingSeatIdx !== null) {
      const seat = this.seats[existingSeatIdx]!;
      if (seat.reconnectToken !== reconnectToken) {
        throw new Error('invalid reconnect token for this seat');
      }
      seat.socketId = socketId;
      seat.connected = true;
      seat.disconnectedAt = null;
      seat.isBot = false; // a human reclaiming their seat always regains control from any bot takeover
      seat.name = name || seat.name;
      return { seat: existingSeatIdx, reconnectToken: seat.reconnectToken, isSpectator: false };
    }

    const existingSpectator = this.findSpectatorByPlayerId(playerId);
    if (existingSpectator) {
      if (existingSpectator.reconnectToken !== reconnectToken) {
        throw new Error('invalid reconnect token for this spectator slot');
      }
      existingSpectator.socketId = socketId;
      existingSpectator.connected = true;
      return { seat: null, reconnectToken: existingSpectator.reconnectToken, isSpectator: true };
    }

    const freeIdx = this.seats.findIndex((s) => s === null);
    if (freeIdx !== -1 && !this.game) {
      const seatIdx = freeIdx as PlayerIndex;
      const token = genToken();
      this.seats[seatIdx] = {
        playerId,
        name,
        socketId,
        connected: true,
        reconnectToken: token,
        isBot: false,
        disconnectedAt: null,
      };
      if (!this.hostPlayerId) this.hostPlayerId = playerId;
      return { seat: seatIdx, reconnectToken: token, isSpectator: false };
    }

    if (!this.modes.allowSpectators) throw new Error('table is full');
    const token = genToken();
    this.spectators.push({ playerId, name, socketId, connected: true, reconnectToken: token });
    return { seat: null, reconnectToken: token, isSpectator: true };
  }

  /** Fills the first empty seat with a bot player. Returns the seat index. */
  addBot(): PlayerIndex {
    if (this.game) throw new Error('cannot add a bot after the game has started');
    const freeIdx = this.seats.findIndex((s) => s === null);
    if (freeIdx === -1) throw new Error('table is full');
    const seatIdx = freeIdx as PlayerIndex;
    const name = BOT_NAMES[botNameCursor % BOT_NAMES.length];
    botNameCursor += 1;
    this.seats[seatIdx] = {
      playerId: genBotPlayerId(),
      name,
      socketId: null,
      connected: true,
      reconnectToken: genToken(),
      isBot: true,
      disconnectedAt: null,
    };
    return seatIdx;
  }

  disconnectSocket(socketId: string): PlayerIndex | null {
    const idx = this.findSeatBySocketId(socketId);
    if (idx !== null) {
      const seat = this.seats[idx]!;
      seat.connected = false;
      seat.socketId = null;
      seat.disconnectedAt = Date.now();
      this.migrateHostIfNeeded();
      return idx;
    }
    const spectator = this.findSpectatorBySocketId(socketId);
    if (spectator) {
      spectator.connected = false;
      spectator.socketId = null;
    }
    return null;
  }

  private migrateHostIfNeeded(): void {
    if (!this.hostPlayerId) return;
    const hostSeatIdx = this.findSeatByPlayerId(this.hostPlayerId);
    const hostSeat = hostSeatIdx !== null ? this.seats[hostSeatIdx] : null;
    if (hostSeat && hostSeat.connected) return; // host is still here
    const candidate = this.seats.find((s) => s && s.connected && !s.isBot);
    this.hostPlayerId = candidate ? candidate.playerId : null;
  }

  startGame(): void {
    if (!this.isFull()) throw new Error('table needs 4 players to start');
    const players: Record<PlayerIndex, { id: string; name: string }> = {} as any;
    for (const i of SEAT_INDICES) {
      const seat = this.seats[i]!;
      players[i] = { id: seat.playerId, name: seat.name };
    }
    const config: Partial<MatchConfig> = {
      partnership: this.modes.partnership,
      openHand: this.modes.openHand,
      fixedSpadesTrump: this.modes.fixedSpadesTrump,
      mustTrumpWhenVoid: this.modes.strictTrumpRules,
      mustOvertrumpOrBeat: this.modes.strictTrumpRules,
      buriedCards: this.modes.buriedCards,
      scoringMode: this.rules.scoringMode,
      penaltyMode: this.rules.penaltyMode,
      gameEndMode: this.rules.gameEndMode,
      targetScore: this.rules.targetScore,
      handsPerMatch: this.rules.handsPerMatch,
      minBid: this.rules.minBid,
    };
    this.game = new Game(players, config);
    this.game.startHand();
  }

  toLobbySummary() {
    return {
      id: this.id,
      name: this.name,
      seatedCount: this.seatedCount,
      inProgress: this.game !== null,
      modes: this.modes,
    };
  }
}

function clampNumber(value: number | undefined, min: number, max: number, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}
