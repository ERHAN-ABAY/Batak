import express from 'express';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server, Socket } from 'socket.io';
import { AllPassAction, BatakError, Bid, GameEndMode, PlayerIndex, ScoreMode, Suit, TeamBidMode, VariantId } from '@batak/engine';
import { decideBotBid, decideBotExchange, decideBotPlay, decideBotTrumpSuit } from './bot.js';
import { createTable, findTableBySocket, getTable, listOpenTables, removeTable } from './rooms.js';
import { Table } from './table.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.static(path.join(__dirname, '..', 'public')));

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

// --- Timers: AFK turn timeouts (bidding 20s / trump+exchange 20s / play 30s)
// and near-instant bot moves. Reconnect/bot-takeover delays instead come from
// the table's own `reconnectSeconds`/`botTakeoverSeconds` config (§31, §23).
const BID_TIMEOUT_MS = 20_000;
const TRUMP_OR_EXCHANGE_TIMEOUT_MS = 20_000;
const PLAY_TIMEOUT_MS = 30_000;
const DEFAULT_RECONNECT_MS = 30_000;

const turnTimers = new Map<string, ReturnType<typeof setTimeout>>();
const turnDeadlines = new Map<string, number>();
const reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>(); // key: `${tableId}:${seat}`

function clearTurnTimer(tableId: string): void {
  const t = turnTimers.get(tableId);
  if (t) {
    clearTimeout(t);
    turnTimers.delete(tableId);
  }
  turnDeadlines.delete(tableId);
}

const HAND_COMPLETE_AUTO_ADVANCE_MS = 6_000;

function scheduleNextActionTimer(table: Table): void {
  clearTurnTimer(table.id);
  const game = table.game;
  if (!game) return;
  const phase = game.phase;

  if (phase === 'HAND_COMPLETE') {
    // Nobody's "turn" here - auto-advance so a bots-only or AFK table never
    // gets stuck waiting for someone to click "next hand".
    const timer = setTimeout(() => {
      turnTimers.delete(table.id);
      const g = table.game;
      if (!g || g.phase !== 'HAND_COMPLETE') return;
      try {
        g.startHand();
      } catch {
        /* best-effort */
      }
      broadcast(table);
    }, HAND_COMPLETE_AUTO_ADVANCE_MS);
    turnTimers.set(table.id, timer);
    return;
  }

  if (phase !== 'BIDDING' && phase !== 'CHOOSING_TRUMP' && phase !== 'EXCHANGE' && phase !== 'PLAYING') return;

  const turn = game.whoseTurn();
  if (turn === null) return;
  const seatInfo = table.seats[turn];
  const isBot = !!seatInfo?.isBot;

  const botMoveDelayMs = game.config.botTakeoverSeconds * 1000;
  const ms = isBot
    ? botMoveDelayMs
    : phase === 'BIDDING'
      ? BID_TIMEOUT_MS
      : phase === 'PLAYING'
        ? PLAY_TIMEOUT_MS
        : TRUMP_OR_EXCHANGE_TIMEOUT_MS;

  if (!isBot) turnDeadlines.set(table.id, Date.now() + ms);

  const timer = setTimeout(() => {
    turnTimers.delete(table.id);
    const g = table.game;
    if (!g || g.phase !== phase || g.whoseTurn() !== turn) return; // already acted on
    try {
      if (isBot) {
        if (phase === 'BIDDING') g.submitBid(turn, decideBotBid(g, turn));
        else if (phase === 'CHOOSING_TRUMP') g.chooseTrump(turn, decideBotTrumpSuit(g, turn));
        else if (phase === 'EXCHANGE') g.exchangeCards(turn, decideBotExchange(g, turn));
        else if (phase === 'PLAYING') g.playCard(turn, decideBotPlay(g, turn));
      } else if (phase === 'BIDDING') {
        // AFK human fallback: pass in an auction, or the minimum commitment
        // in Koz Maça taahhütlü mode (where passing isn't allowed, §8 Mod B).
        if (g.config.biddingStyle === 'commitment') {
          g.submitBid(turn, { player: turn, type: 'bid', value: g.config.minimumBid });
        } else {
          g.submitBid(turn, { player: turn, type: 'pas' });
        }
      } else if (phase === 'CHOOSING_TRUMP') {
        g.chooseTrump(turn, decideBotTrumpSuit(g, turn));
      } else if (phase === 'EXCHANGE') {
        g.exchangeCards(turn, decideBotExchange(g, turn));
      } else if (phase === 'PLAYING') {
        const legal = g.getLegalPlays(turn);
        const lowest = legal.slice().sort((a, b) => a.rank - b.rank)[0];
        if (lowest) g.playCard(turn, lowest);
      }
    } catch {
      // best-effort auto-action; leave the table as-is if it somehow fails
    }
    broadcast(table);
  }, ms);
  turnTimers.set(table.id, timer);
}

function clearReconnectTimer(tableId: string, seat: PlayerIndex): void {
  const key = `${tableId}:${seat}`;
  const t = reconnectTimers.get(key);
  if (t) {
    clearTimeout(t);
    reconnectTimers.delete(key);
  }
}

function scheduleBotTakeover(table: Table, seat: PlayerIndex): void {
  const key = `${table.id}:${seat}`;
  clearReconnectTimer(table.id, seat);
  const ms = table.game ? table.game.config.reconnectSeconds * 1000 : DEFAULT_RECONNECT_MS;
  const timer = setTimeout(() => {
    reconnectTimers.delete(key);
    const seatInfo = table.seats[seat];
    if (!seatInfo || seatInfo.connected || seatInfo.isBot) return;
    seatInfo.isBot = true;
    broadcast(table);
  }, ms);
  reconnectTimers.set(key, timer);
}

function tableView(table: Table, forPlayerId: string) {
  const mySeat = table.findSeatByPlayerId(forPlayerId);
  const spectator = mySeat === null ? table.findSpectatorByPlayerId(forPlayerId) : undefined;
  const isSpectator = mySeat === null && !!spectator;

  return {
    tableId: table.id,
    tableName: table.name,
    hostPlayerId: table.hostPlayerId,
    rules: table.rules,
    seats: table.seats.map((s) =>
      s ? { name: s.name, connected: s.connected, isBot: s.isBot } : null
    ),
    spectatorCount: table.spectators.filter((s) => s.connected).length,
    mySeat,
    isSpectator,
    game: table.game
      ? mySeat !== null
        ? table.game.getPublicState(mySeat)
        : isSpectator
          ? table.game.getPublicState(null)
          : null
      : null,
    turnDeadline: turnDeadlines.get(table.id) ?? null,
    chat: table.chatHistory.slice(-50),
  };
}

function broadcast(table: Table): void {
  for (const seat of table.seats) {
    if (!seat || !seat.connected || !seat.socketId) continue;
    const socket = io.sockets.sockets.get(seat.socketId);
    if (!socket) continue;
    socket.emit('table:update', tableView(table, seat.playerId));
  }
  for (const spec of table.spectators) {
    if (!spec.connected || !spec.socketId) continue;
    const socket = io.sockets.sockets.get(spec.socketId);
    if (!socket) continue;
    socket.emit('table:update', tableView(table, spec.playerId));
  }
  scheduleNextActionTimer(table);
}

function fail(socket: Socket, err: unknown): void {
  if (err instanceof BatakError) {
    socket.emit('table:error', { code: err.code, message: err.message });
  } else {
    socket.emit('table:error', { code: 'UNKNOWN', message: (err as Error).message });
  }
}

io.on('connection', (socket: Socket) => {
  socket.on('lobby:list', (_payload: unknown, ack?: (res: unknown) => void) => {
    ack?.({ tables: listOpenTables() });
  });

  socket.on(
    'table:create',
    (
      payload: {
        playerId: string;
        name: string;
        tableName?: string;
        variantId?: VariantId;
        allowSpectators?: boolean;
        minimumBid?: number;
        maximumBid?: number;
        scoreMode?: ScoreMode;
        gameEndMode?: GameEndMode;
        targetScore?: number;
        maxRounds?: number;
        allPassAction?: AllPassAction;
        buriedCardCount?: number;
        spadesBiddingEnabled?: boolean;
        teamBidMode?: TeamBidMode;
      },
      ack?: (res: unknown) => void
    ) => {
      try {
        const table = createTable(payload.tableName ?? '', {
          variantId: payload.variantId,
          allowSpectators: payload.allowSpectators,
          minimumBid: payload.minimumBid,
          maximumBid: payload.maximumBid,
          scoreMode: payload.scoreMode,
          gameEndMode: payload.gameEndMode,
          targetScore: payload.targetScore,
          maxRounds: payload.maxRounds,
          allPassAction: payload.allPassAction,
          buriedCardCount: payload.buriedCardCount,
          spadesBiddingEnabled: payload.spadesBiddingEnabled,
          teamBidMode: payload.teamBidMode,
        });
        const res = table.join(payload.playerId, payload.name, socket.id);
        socket.join(table.id);
        ack?.({ tableId: table.id, reconnectToken: res.reconnectToken });
        broadcast(table);
      } catch (err) {
        ack?.({ error: (err as Error).message });
      }
    }
  );

  socket.on(
    'table:join',
    (
      payload: { playerId: string; name: string; tableId: string; reconnectToken?: string },
      ack?: (res: unknown) => void
    ) => {
      const table = getTable(payload.tableId);
      if (!table) {
        ack?.({ error: 'table not found', code: 'TABLE_NOT_FOUND' });
        return;
      }
      try {
        const res = table.join(payload.playerId, payload.name, socket.id, payload.reconnectToken);
        if (res.seat !== null) clearReconnectTimer(table.id, res.seat);
        socket.join(table.id);
        ack?.({ tableId: table.id, reconnectToken: res.reconnectToken, isSpectator: res.isSpectator });
        broadcast(table);
      } catch (err) {
        ack?.({ error: (err as Error).message });
      }
    }
  );

  socket.on('table:addBot', (payload: { tableId: string }) => {
    const table = getTable(payload.tableId);
    if (!table) return fail(socket, new Error('table not found'));
    try {
      table.addBot();
      broadcast(table);
    } catch (err) {
      fail(socket, err);
    }
  });

  socket.on('game:start', (payload: { tableId: string }) => {
    const table = getTable(payload.tableId);
    if (!table) return fail(socket, new Error('table not found'));
    try {
      table.startGame();
      broadcast(table);
    } catch (err) {
      fail(socket, err);
    }
  });

  socket.on('hand:next', (payload: { tableId: string }) => {
    const table = getTable(payload.tableId);
    if (!table?.game) return fail(socket, new Error('game not started'));
    try {
      table.game.startHand();
      broadcast(table);
    } catch (err) {
      fail(socket, err);
    }
  });

  socket.on('bid:submit', (payload: { tableId: string; bid: Bid }) => {
    const table = getTable(payload.tableId);
    if (!table?.game) return fail(socket, new Error('game not started'));
    const seat = table.findSeatBySocketId(socket.id);
    if (seat === null) return fail(socket, new Error('you are not seated at this table'));
    try {
      table.game.submitBid(seat, { ...payload.bid, player: seat });
      broadcast(table);
    } catch (err) {
      fail(socket, err);
    }
  });

  socket.on('trump:select', (payload: { tableId: string; suit: Suit }) => {
    const table = getTable(payload.tableId);
    if (!table?.game) return fail(socket, new Error('game not started'));
    const seat = table.findSeatBySocketId(socket.id);
    if (seat === null) return fail(socket, new Error('you are not seated at this table'));
    try {
      table.game.chooseTrump(seat, payload.suit);
      broadcast(table);
    } catch (err) {
      fail(socket, err);
    }
  });

  socket.on('exchange:submit', (payload: { tableId: string; discards: { suit: Suit; rank: number }[] }) => {
    const table = getTable(payload.tableId);
    if (!table?.game) return fail(socket, new Error('game not started'));
    const seat = table.findSeatBySocketId(socket.id);
    if (seat === null) return fail(socket, new Error('you are not seated at this table'));
    try {
      table.game.exchangeCards(seat, payload.discards as any);
      broadcast(table);
    } catch (err) {
      fail(socket, err);
    }
  });

  socket.on('card:play', (payload: { tableId: string; card: { suit: Suit; rank: number } }) => {
    const table = getTable(payload.tableId);
    if (!table?.game) return fail(socket, new Error('game not started'));
    const seat = table.findSeatBySocketId(socket.id);
    if (seat === null) return fail(socket, new Error('you are not seated at this table'));
    try {
      table.game.playCard(seat, payload.card as any);
      broadcast(table);
    } catch (err) {
      fail(socket, err);
    }
  });

  socket.on('chat:send', (payload: { tableId: string; text: string }) => {
    const table = getTable(payload.tableId);
    if (!table) return fail(socket, new Error('table not found'));
    const seatIdx = table.findSeatBySocketId(socket.id);
    const seat = seatIdx !== null ? table.seats[seatIdx] : null;
    const spectator = table.findSpectatorBySocketId(socket.id);
    const name = seat?.name ?? spectator?.name;
    if (!name) return fail(socket, new Error('you are not at this table'));

    const text = String(payload.text ?? '').slice(0, 300).trim();
    if (!text) return;
    table.chatHistory.push({ name, text, ts: Date.now() });
    if (table.chatHistory.length > 200) table.chatHistory.splice(0, table.chatHistory.length - 200);
    broadcast(table);
  });

  socket.on('table:leave', (payload: { tableId: string }, ack?: (res: unknown) => void) => {
    const table = getTable(payload.tableId);
    if (!table) return ack?.({ ok: true });

    const seatIdx = table.findSeatBySocketId(socket.id);
    if (seatIdx !== null) {
      clearReconnectTimer(table.id, seatIdx);
      if (!table.game) {
        table.freeSeat(seatIdx);
      } else {
        table.disconnectSocket(socket.id);
        const seat = table.seats[seatIdx];
        if (seat) seat.isBot = true; // explicit leave - take over immediately, don't wait 60s
      }
    } else {
      table.removeSpectator(socket.id);
    }

    socket.leave(table.id);
    if (table.isEmpty()) {
      clearTurnTimer(table.id);
      removeTable(table.id);
    } else {
      broadcast(table);
    }
    ack?.({ ok: true });
  });

  socket.on('disconnect', () => {
    const table = findTableBySocket(socket.id);
    if (!table) return;
    const seat = table.disconnectSocket(socket.id);
    if (seat !== null) scheduleBotTakeover(table, seat);
    broadcast(table);
  });
});

const PORT = Number(process.env.PORT ?? 3000);
httpServer.listen(PORT, () => {
  console.log(`Batak server listening on :${PORT}`);
});
