import { Table, TableModes } from './table.js';

const tables = new Map<string, Table>();

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I ambiguity

function generateTableId(): string {
  let code: string;
  do {
    code = Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
  } while (tables.has(code));
  return code;
}

export function createTable(name: string, modes: Partial<TableModes> = {}): Table {
  const id = generateTableId();
  const table = new Table(id, name || `Masa ${id}`, modes);
  tables.set(id, table);
  return table;
}

export function getTable(id: string): Table | undefined {
  return tables.get(id.toUpperCase());
}

export function removeTable(id: string): void {
  tables.delete(id);
}

export function listOpenTables() {
  return Array.from(tables.values())
    .filter((t) => t.seatedCount < 4 && !t.game)
    .map((t) => t.toLobbySummary());
}

export function findTableBySocket(socketId: string): Table | undefined {
  for (const table of tables.values()) {
    if (table.findSeatBySocketId(socketId) !== null) return table;
  }
  return undefined;
}
