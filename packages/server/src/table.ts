import { Game, MatchConfig, PlayerIndex } from '@batak/engine';

export interface Seat {
  playerId: string;
  name: string;
  socketId: string | null;
  connected: boolean;
}

export interface TableModes {
  partnership: boolean;
  openHand: boolean;
  fixedSpadesTrump: boolean;
}

const SEAT_INDICES: PlayerIndex[] = [0, 1, 2, 3];

export class Table {
  readonly id: string;
  readonly name: string;
  readonly modes: TableModes;
  seats: (Seat | null)[] = [null, null, null, null];
  hostPlayerId: string | null = null;
  game: Game | null = null;
  createdAt = Date.now();

  constructor(id: string, name: string, modes: Partial<TableModes> = {}) {
    this.id = id;
    this.name = name;
    this.modes = {
      partnership: !!modes.partnership,
      openHand: !!modes.partnership && !!modes.openHand,
      fixedSpadesTrump: !!modes.fixedSpadesTrump,
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

  /** Seats a (possibly reconnecting) player. Returns the seat index. */
  join(playerId: string, name: string, socketId: string): PlayerIndex {
    const existing = this.findSeatByPlayerId(playerId);
    if (existing !== null) {
      this.seats[existing] = { playerId, name, socketId, connected: true };
      return existing;
    }
    const freeIdx = this.seats.findIndex((s) => s === null);
    if (freeIdx === -1) throw new Error('table is full');
    const seatIdx = freeIdx as PlayerIndex;
    this.seats[seatIdx] = { playerId, name, socketId, connected: true };
    if (!this.hostPlayerId) this.hostPlayerId = playerId;
    return seatIdx;
  }

  disconnectSocket(socketId: string): void {
    const idx = this.findSeatBySocketId(socketId);
    if (idx === null) return;
    const seat = this.seats[idx];
    if (seat) seat.connected = false;
  }

  isFull(): boolean {
    return this.seatedCount === 4;
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
