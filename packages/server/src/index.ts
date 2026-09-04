import express from 'express';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server, Socket } from 'socket.io';
import { Bid, PlayerIndex, Suit } from '@batak/engine';
import { createTable, findTableBySocket, getTable, listOpenTables } from './rooms.js';
import { Table } from './table.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.static(path.join(__dirname, '..', 'public')));

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

function tableView(table: Table, forPlayerId: string) {
  const mySeat = table.findSeatByPlayerId(forPlayerId);
  return {
    tableId: table.id,
    tableName: table.name,
    hostPlayerId: table.hostPlayerId,
    modes: table.modes,
    seats: table.seats.map((s) => (s ? { name: s.name, connected: s.connected } : null)),
    mySeat,
    game: mySeat !== null && table.game ? table.game.getPublicState(mySeat) : null,
  };
}

function broadcast(table: Table): void {
  for (const seat of table.seats) {
    if (!seat || !seat.connected || !seat.socketId) continue;
    const socket = io.sockets.sockets.get(seat.socketId);
    if (!socket) continue;
    socket.emit('table:update', tableView(table, seat.playerId));
  }
}

function fail(socket: Socket, message: string): void {
  socket.emit('table:error', { message });
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
      },
      ack?: (res: unknown) => void
    ) => {
      try {
        const table = createTable(payload.tableName ?? '', {
          partnership: payload.partnership,
          openHand: payload.openHand,
          fixedSpadesTrump: payload.fixedSpadesTrump,
        });
        table.join(payload.playerId, payload.name, socket.id);
        socket.join(table.id);
        ack?.({ tableId: table.id });
        broadcast(table);
      } catch (err) {
        ack?.({ error: (err as Error).message });
      }
    }
  );

  socket.on(
    'table:join',
    (payload: { playerId: string; name: string; tableId: string }, ack?: (res: unknown) => void) => {
      const table = getTable(payload.tableId);
      if (!table) {
        ack?.({ error: 'table not found' });
        return;
      }
      try {
        table.join(payload.playerId, payload.name, socket.id);
        socket.join(table.id);
        ack?.({ tableId: table.id });
        broadcast(table);
      } catch (err) {
        ack?.({ error: (err as Error).message });
      }
    }
  );

  socket.on('game:start', (payload: { tableId: string }) => {
    const table = getTable(payload.tableId);
    if (!table) return fail(socket, 'table not found');
    try {
      table.startGame();
      broadcast(table);
    } catch (err) {
      fail(socket, (err as Error).message);
    }
  });

  socket.on('hand:next', (payload: { tableId: string }) => {
    const table = getTable(payload.tableId);
    if (!table?.game) return fail(socket, 'game not started');
    try {
      table.game.startHand();
      broadcast(table);
    } catch (err) {
      fail(socket, (err as Error).message);
    }
  });

  socket.on('bid:submit', (payload: { tableId: string; bid: Bid }) => {
    const table = getTable(payload.tableId);
    if (!table?.game) return fail(socket, 'game not started');
    const seat = table.findSeatBySocketId(socket.id);
    if (seat === null) return fail(socket, 'you are not seated at this table');
    try {
      table.game.submitBid(seat, { ...payload.bid, player: seat });
      broadcast(table);
    } catch (err) {
      fail(socket, (err as Error).message);
    }
  });

  socket.on('trump:select', (payload: { tableId: string; suit: Suit }) => {
    const table = getTable(payload.tableId);
    if (!table?.game) return fail(socket, 'game not started');
    const seat = table.findSeatBySocketId(socket.id);
    if (seat === null) return fail(socket, 'you are not seated at this table');
    try {
      table.game.chooseTrump(seat, payload.suit);
      broadcast(table);
    } catch (err) {
      fail(socket, (err as Error).message);
    }
  });

  socket.on('card:play', (payload: { tableId: string; card: { suit: Suit; rank: number } }) => {
    const table = getTable(payload.tableId);
    if (!table?.game) return fail(socket, 'game not started');
    const seat = table.findSeatBySocketId(socket.id);
    if (seat === null) return fail(socket, 'you are not seated at this table');
    try {
      table.game.playCard(seat, payload.card as any);
      broadcast(table);
    } catch (err) {
      fail(socket, (err as Error).message);
    }
  });

  socket.on('disconnect', () => {
    const table = findTableBySocket(socket.id);
    if (!table) return;
    table.disconnectSocket(socket.id);
    broadcast(table);
  });
});

const PORT = Number(process.env.PORT ?? 3000);
httpServer.listen(PORT, () => {
  console.log(`Batak server listening on :${PORT}`);
});
