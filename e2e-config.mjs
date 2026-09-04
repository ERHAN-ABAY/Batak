import { io } from 'socket.io-client';

const URL = 'http://localhost:3737';
const sockets = [];
const states = [null, null, null, null];
let tableId = null;

function connect(i) {
  return new Promise((resolve) => {
    const s = io(URL, { transports: ['websocket'] });
    s.on('connect', () => resolve(s));
    s.on('table:update', (state) => (states[i] = state));
    sockets.push(s);
  });
}
function waitFor(pred, t = 5000) {
  return new Promise((res, rej) => {
    const st = Date.now();
    const iv = setInterval(() => {
      if (pred()) { clearInterval(iv); res(); }
      else if (Date.now() - st > t) { clearInterval(iv); rej(new Error('timeout')); }
    }, 30);
  });
}

async function main() {
  for (let i = 0; i < 4; i++) await connect(i);
  await new Promise((r) => sockets[0].emit('table:create', { playerId: 'cfg0', name: 'CFG0', tableName: 'Config Test' }, (res) => { tableId = res.tableId; r(); }));
  for (let i = 1; i < 4; i++) await new Promise((r) => sockets[i].emit('table:join', { playerId: 'cfg' + i, name: 'CFG' + i, tableId }, () => r()));
  await waitFor(() => states.every((s) => s && s.seats.every((x) => x !== null)));
  sockets[0].emit('game:start', { tableId });
  await waitFor(() => states[0]?.game?.phase === 'BIDDING');

  console.log('--- Test 1: allPassAction default = dealerTakesMinimum ---');
  const dealer = states[0].game.dealer;
  const start = states[0].game.turn;
  let t = start;
  for (let i = 0; i < 4; i++) {
    sockets[t].emit('bid:submit', { tableId, bid: { type: 'pas' } });
    await new Promise((r) => setTimeout(r, 150));
    t = (t + 1) % 4;
  }
  await waitFor(() => states[0].game.phase === 'CHOOSING_TRUMP');
  console.log('phase:', states[0].game.phase, 'declarer:', states[0].game.contract.declarer, 'dealer:', dealer, 'target:', states[0].game.contract.target);
  if (states[0].game.contract.declarer !== dealer) throw new Error('dealer should have auto-declared');
  if (states[0].game.contract.target !== 5) throw new Error('auto-bid should equal minBid (5)');
  console.log('CONFIRMED: dealer auto-declared at minBid instead of a redeal');

  // finish choosing trump so we're in a clean PLAYING state, not needed further
  sockets[dealer].emit('trump:select', { tableId, suit: 'S' });
  await waitFor(() => states[0].game.phase === 'PLAYING');

  console.log('--- Test 2: turn timeout (30s play timer) auto-plays for an AFK player ---');
  const turnBefore = states[0].game.turn;
  const trickLenBefore = states[0].game.currentTrick.length;
  console.log(`waiting ~31s without any of the ${4} clients acting, for seat ${turnBefore}'s turn...`);
  await waitFor(() => states[0].game.currentTrick.length !== trickLenBefore || states[0].game.phase !== 'PLAYING', 35000);
  console.log('a card was auto-played after the timeout. currentTrick length now:', states[0].game.currentTrick.length, 'phase:', states[0].game.phase);
  console.log('CONFIRMED: play-turn timeout auto-acted for the AFK player');

  console.log('ALL CONFIG TESTS PASSED');
  process.exit(0);
}
main().catch((e) => { console.error('CONFIG TEST FAILED:', e); process.exit(1); });
