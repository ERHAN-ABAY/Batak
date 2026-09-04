import express from 'express';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server, Socket } from 'socket.io';
import { BatakError, Bid, GameEndMode, PenaltyMode, PlayerIndex, ScoringMode, Suit } from '@batak/engine';
import { decideBotBid, decideBotExchange, decideBotPlay, decideBotTrumpSuit } from './bot.js';
import { createTable, findTableBySocket, getTable, listOpenTables } from './rooms.js';
import { Table } from './table.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.static(path.join(__dirname, '..', 'public')));

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

// --- Timers: AFK turn timeouts (bidding 20s / trump+exchange 20s / play 30s)
// and near-instant bot moves. See BATAK_OYUN_KURALLARI_VE_TEKNIK_SPEK.md §30.
const BID_TIMEOUT_MS = 20_000;
const TRUMP_OR_EXCHANGE_TIMEOUT_MS = 20_000;
const PLAY_TIMEOUT_MS = 30_000;
const BOT_MOVE_DELAY_MS = 900;
// A human who stays disconnected this long has their seat taken over by a bot (§29).
const RECONNECT_TIMEOUT_MS = 60_000;

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

  const ms = isBot
    ? BOT_MOVE_DELAY_MS
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
      } else {
        // AFK human fallback - spec-literal simple defaults for bid/play,
        // a sensible default for trump/exchange (not specified by the spec).
        if (phase === 'BIDDING') g.submitBid(turn, { player: turn, type: 'pas' });
        else if (phase === 'CHOOSING_TRUMP') g.chooseTrump(turn, decideBotTrumpSuit(g, turn));
        else if (phase === 'EXCHANGE') g.exchangeCards(turn, decideBotExchange(g, turn));
        else if (phase === 'PLAYING') {
          const legal = g.getLegalPlays(turn);
          const lowest = legal.slice().sort((a, b) => a.rank - b.rank)[0];
          if (lowest) g.playCard(turn, lowest);
        }
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
  const timer = setTimeout(() => {
    reconnectTimers.delete(key);
    const seatInfo = table.seats[seat];
    if (!seatInfo || seatInfo.connected || seatInfo.isBot) return;
    seatInfo.isBot = true;
    broadcast(table);
  }, RECONNECT_TIMEOUT_MS);
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
    modes: table.modes,
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
        partnership?: boolean;
        openHand?: boolean;
        fixedSpadesTrump?: boolean;
        strictTrumpRules?: boolean;
        buriedCards?: boolean;
        allowSpectators?: boolean;
        scoringMode?: ScoringMode;
        penaltyMode?: PenaltyMode;
        gameEndMode?: GameEndMode;
        targetScore?: number;
        handsPerMatch?: number;
        minBid?: number;
      },
      ack?: (res: unknown) => void
    ) => {
      try {
        const table = createTable(
          payload.tableName ?? '',
          {
            partnership: payload.partnership,
            openHand: payload.openHand,
            fixedSpadesTrump: payload.fixedSpadesTrump,
            strictTrumpRules: payload.strictTrumpRules,
            buriedCards: payload.buriedCards,
            allowSpectators: payload.allowSpectators,
          },
          {
            scoringMode: payload.scoringMode,
            penaltyMode: payload.penaltyMode,
            gameEndMode: payload.gameEndMode,
            targetScore: payload.targetScore,
            handsPerMatch: payload.handsPerMatch,
            minBid: payload.minBid,
          }
        );
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
