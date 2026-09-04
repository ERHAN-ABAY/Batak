/* Minimal vanilla-JS test client for the Batak engine/server. No build step. */

const socket = io();

function getPlayerId() {
  let id = localStorage.getItem('batak.playerId');
  if (!id) {
    id = 'p_' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem('batak.playerId', id);
  }
  return id;
}
const playerId = getPlayerId();

let currentTableId = localStorage.getItem('batak.tableId') || null;
let latestState = null;

const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

function showToast(message) {
  const t = $('#toast');
  t.textContent = message;
  t.classList.remove('hidden');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => t.classList.add('hidden'), 3500);
}

function showScreen(name) {
  for (const id of ['lobby', 'waiting', 'game']) {
    $('#' + id).classList.toggle('hidden', id !== name);
  }
}

// ---------- Card rendering ----------
const SUIT_SYMBOL = { S: '♠', H: '♥', D: '♦', C: '♣' };
const RED_SUITS = new Set(['H', 'D']);
function rankLabel(rank) {
  if (rank === 14) return 'A';
  if (rank === 13) return 'K';
  if (rank === 12) return 'Q';
  if (rank === 11) return 'J';
  return String(rank);
}
function cardEl(card, { mini = false, disabled = false, onClick = null } = {}) {
  const c = el('div', 'playing-card' + (RED_SUITS.has(card.suit) ? ' red' : '') + (mini ? ' mini' : '') + (disabled ? ' disabled' : ''));
  const label = `${rankLabel(card.rank)}${SUIT_SYMBOL[card.suit]}`;
  const topCorner = el('div', 'corner', label);
  const pip = el('div', 'pip', SUIT_SYMBOL[card.suit]);
  const bottomCorner = el('div', 'corner bottom-right', label);
  c.appendChild(topCorner);
  c.appendChild(pip);
  c.appendChild(bottomCorner);
  if (onClick && !disabled) c.addEventListener('click', onClick);
  return c;
}
function cardBackEl() {
  return el('div', 'card-back');
}

// ---------- Legal-play check (mirrors engine's follow-suit + must-beat rule) ----------
function legalPlays(hand, trick, trumpSuit) {
  if (trick.length === 0) return hand;
  const ledSuit = trick[0].card.suit;
  const cardsOfLedSuit = hand.filter((c) => c.suit === ledSuit);
  const trumpCards = trumpSuit ? hand.filter((c) => c.suit === trumpSuit) : [];
  const eligible = cardsOfLedSuit.length > 0 ? cardsOfLedSuit : trumpCards.length > 0 ? trumpCards : hand;

  const trumpsPlayed = trumpSuit ? trick.filter((tc) => tc.card.suit === trumpSuit) : [];
  const pool = trumpsPlayed.length > 0 ? trumpsPlayed : trick.filter((tc) => tc.card.suit === ledSuit);
  const currentBest = pool.reduce((best, tc) => (tc.card.rank > best.card.rank ? tc : best), pool[0]).card;

  const beating = eligible.filter((c) => c.suit === currentBest.suit && c.rank > currentBest.rank);
  return beating.length > 0 ? beating : eligible;
}

// ---------- Team helpers ----------
function teamOf(seat) {
  return seat % 2; // 0 -> team A (seats 0,2), 1 -> team B (seats 1,3)
}
function teamClass(seat) {
  return teamOf(seat) === 0 ? 'teamA' : 'teamB';
}

function modeBadges(modes) {
  const frag = document.createDocumentFragment();
  if (!modes) return frag;
  if (modes.partnership) frag.appendChild(el('span', 'badge', 'Eşli'));
  if (modes.openHand) frag.appendChild(el('span', 'badge', 'Açık'));
  if (modes.fixedSpadesTrump) frag.appendChild(el('span', 'badge', 'Maça'));
  if (!modes.partnership && !modes.openHand && !modes.fixedSpadesTrump) {
    frag.appendChild(el('span', 'badge', 'Klasik / İhaleli'));
  }
  return frag;
}

// ---------- Mode checkboxes ----------
const partnershipCk = $('#modePartnership');
const openHandCk = $('#modeOpenHand');
partnershipCk.addEventListener('change', () => {
  openHandCk.disabled = !partnershipCk.checked;
  if (!partnershipCk.checked) openHandCk.checked = false;
});

// ---------- Lobby ----------
function refreshLobby() {
  socket.emit('lobby:list', {}, (res) => {
    const ul = $('#openTables');
    ul.innerHTML = '';
    if (!res.tables.length) {
      ul.appendChild(el('li', 'empty', 'Açık masa yok. Yeni bir tane kurabilirsin.'));
      return;
    }
    for (const t of res.tables) {
      const li = el('li');
      const top = el('div');
      top.textContent = `${t.name} [${t.id}] - ${t.seatedCount}/4`;
      li.appendChild(top);
      const badgeRow = el('div', 'badges');
      badgeRow.appendChild(modeBadges(t.modes));
      li.appendChild(badgeRow);
      const btn = el('button', null, 'Katıl');
      btn.addEventListener('click', () => joinTable(t.id));
      li.appendChild(btn);
      ul.appendChild(li);
    }
  });
}

function currentName() {
  const v = $('#nameInput').value.trim();
  return v || 'Oyuncu';
}

function joinTable(tableId) {
  socket.emit('table:join', { playerId, name: currentName(), tableId }, (res) => {
    if (res.error) return showToast(res.error);
    currentTableId = res.tableId;
    localStorage.setItem('batak.tableId', currentTableId);
  });
}

$('#createTableBtn').addEventListener('click', () => {
  const tableName = $('#tableNameInput').value.trim();
  socket.emit(
    'table:create',
    {
      playerId,
      name: currentName(),
      tableName,
      partnership: partnershipCk.checked,
      openHand: openHandCk.checked,
      fixedSpadesTrump: $('#modeMaca').checked,
    },
    (res) => {
      if (res.error) return showToast(res.error);
      currentTableId = res.tableId;
      localStorage.setItem('batak.tableId', currentTableId);
    }
  );
});

$('#joinTableBtn').addEventListener('click', () => {
  const code = $('#joinCodeInput').value.trim().toUpperCase();
  if (!code) return showToast('Masa kodu girin');
  joinTable(code);
});

$('#refreshLobbyBtn').addEventListener('click', refreshLobby);

$('#startGameBtn').addEventListener('click', () => {
  socket.emit('game:start', { tableId: currentTableId });
});

// ---------- Rendering the waiting room ----------
function renderWaiting(state) {
  showScreen('waiting');
  $('#waitTableId').textContent = state.tableId;
  $('#waitModeBadges').innerHTML = '';
  $('#waitModeBadges').appendChild(modeBadges(state.modes));

  const ul = $('#seatList');
  ul.innerHTML = '';
  state.seats.forEach((seat, i) => {
    const li = el('li');
    if (state.modes && state.modes.partnership) li.classList.add(teamClass(i));
    if (!seat) {
      li.className += ' empty';
      li.textContent = `Koltuk ${i + 1}: boş`;
    } else {
      if (!seat.connected) li.className += ' disconnected';
      li.textContent = `Koltuk ${i + 1}: ${seat.name}${seat.connected ? '' : ' (bağlantı koptu)'}`;
    }
    ul.appendChild(li);
  });
  const iAmHost = state.hostPlayerId === playerId;
  const full = state.seats.every((s) => s !== null);
  $('#startGameBtn').classList.toggle('hidden', !(iAmHost && full));
}

// ---------- Rendering the game screen ----------
const CONTRACT_LABEL = { koz: 'Koz', kozsuz: 'Kozsuz', gizli: 'Gizli', elsiz: 'Elsiz' };

function relPos(seatIndex, mySeat) {
  const diff = (seatIndex - mySeat + 4) % 4;
  return ['bottom', 'left', 'top', 'right'][diff];
}

function renderScoreboard(state) {
  $('#modeBadges').innerHTML = '';
  $('#modeBadges').appendChild(modeBadges(state.game.settings));

  const header = $('#scoreboard');
  header.innerHTML = '';
  header.appendChild(el('div', 'score-chip', `El ${state.game.handNumber}/${state.game.handsPerMatch}`));
  for (let i = 0; i < 4; i++) {
    const p = state.game.players[i];
    let cls = 'score-chip' + (i === state.mySeat ? ' me' : '') + (state.game.turn === i ? ' turn' : '');
    if (state.game.settings.partnership) cls += ' ' + teamClass(i);
    const chip = el('div', cls);
    chip.appendChild(el('span', 'name', p.name || '(boş)'));
    chip.appendChild(el('span', 'pts', String(p.score)));
    header.appendChild(chip);
  }
}

function renderSeats(state) {
  const positions = { bottom: $('#seat-bottom'), left: $('#seat-left'), top: $('#seat-top'), right: $('#seat-right') };
  for (const key of Object.keys(positions)) positions[key].innerHTML = '';

  for (let i = 0; i < 4; i++) {
    const pos = relPos(i, state.mySeat);
    const container = positions[pos];
    const p = state.game.players[i];

    let cls = 'seat-pos';
    if (state.game.turn === i) cls += ' turn';
    if (state.game.contract && state.game.contract.declarer === i) cls += ' declarer';
    if (state.game.players[i].hasPassed && state.game.phase === 'BIDDING') cls += ' passed';
    container.className = cls;

    const nameEl = el('div', 'seat-name', p.name || '(boş)');
    container.appendChild(nameEl);

    if (i !== state.mySeat) {
      const mini = el('div', 'mini-hand');
      const count = Math.min(p.cardCount, 8);
      for (let k = 0; k < count; k++) mini.appendChild(cardBackEl());
      container.appendChild(mini);
      container.appendChild(el('div', 'card-count', `${p.cardCount} kart`));
    }
  }
}

function renderTrick(state) {
  const slots = document.querySelectorAll('.trick-slot');
  slots.forEach((s) => {
    s.innerHTML = '';
  });
  const trick = state.game.currentTrick.length ? state.game.currentTrick : state.game.lastCompletedTrick || [];
  for (const tc of trick) {
    const pos = relPos(tc.player, state.mySeat);
    const slot = document.querySelector(`.trick-slot[data-pos="${pos}"]`);
    if (!slot) continue;
    slot.appendChild(el('div', 'slot-name', state.game.players[tc.player].name));
    slot.appendChild(cardEl(tc.card, { mini: true }));
  }

  const contract = state.game.contract;
  let status = '';
  if (state.game.phase === 'BIDDING') {
    status = state.game.turn === state.mySeat ? 'Sıra sende: teklif ver' : `Sıra: ${state.game.players[state.game.turn]?.name ?? ''}`;
  } else if (state.game.phase === 'CHOOSING_TRUMP') {
    status = `${state.game.players[contract.declarer].name} koz seçiyor...`;
  } else if (state.game.phase === 'PLAYING') {
    const c = contract;
    const contractDesc = `${state.game.players[c.declarer].name}: ${CONTRACT_LABEL[c.type]} ${c.target}${c.trumpSuit ? ' (' + SUIT_SYMBOL[c.trumpSuit] + ')' : ''}`;
    status = `${contractDesc} — Sıra: ${state.game.players[state.game.turn]?.name ?? ''}`;
  } else if (state.game.phase === 'HAND_COMPLETE') {
    status = 'El tamamlandı.';
  } else if (state.game.phase === 'MATCH_COMPLETE') {
    const winner = state.game.matchWinner;
    const winnerLabel = state.game.settings.partnership
      ? `Takım ${teamOf(winner) === 0 ? 'A (0-2)' : 'B (1-3)'}`
      : state.game.players[winner].name;
    status = `Oyun bitti! Kazanan: ${winnerLabel}`;
  }
  $('#status-line').textContent = status;
}

function renderOpenHandPanel(state) {
  const panel = $('#open-hand-panel');
  const info = state.game.openHand;
  panel.classList.toggle('hidden', !info);
  if (!info) return;
  panel.innerHTML = '';
  panel.appendChild(el('h3', null, `Açık El: ${state.game.players[info.player].name}`));
  const row = el('div', 'mini-row');
  for (const card of info.cards) row.appendChild(cardEl(card, { mini: true }));
  panel.appendChild(row);
}

function renderBidPanel(state) {
  const panel = $('#bid-panel');
  const myTurn = state.game.phase === 'BIDDING' && state.game.turn === state.mySeat;
  panel.classList.toggle('hidden', !myTurn);
  if (!myTurn) return;

  const maca = state.game.settings.fixedSpadesTrump;

  panel.innerHTML = '';
  panel.appendChild(el('h3', null, 'Teklif Ver'));
  if (maca) panel.appendChild(el('div', 'hint', 'Bu masada koz her zaman ♠ Maça.'));

  const row = el('div', 'row');
  const select = document.createElement('select');
  for (let v = 5; v <= 13; v++) select.appendChild(new Option(String(v), String(v)));
  row.appendChild(select);

  const bidBtn = (label, build) => {
    const b = el('button', null, label);
    b.addEventListener('click', () => {
      socket.emit('bid:submit', { tableId: currentTableId, bid: build() });
    });
    return b;
  };

  row.appendChild(bidBtn(maca ? 'Teklif Ver' : 'Koz', () => ({ type: 'koz', value: Number(select.value) })));
  if (!maca) row.appendChild(bidBtn('Kozsuz', () => ({ type: 'kozsuz', value: Number(select.value) })));
  panel.appendChild(row);

  const row2 = el('div', 'row');
  if (!maca) {
    row2.appendChild(bidBtn('Gizli (13, kozsuz)', () => ({ type: 'gizli' })));
    row2.appendChild(bidBtn('Elsiz (0 el)', () => ({ type: 'elsiz' })));
  }
  row2.appendChild(bidBtn('Pas', () => ({ type: 'pas' })));
  panel.appendChild(row2);
}

function renderTrumpPanel(state) {
  const panel = $('#trump-panel');
  const myTurn = state.game.phase === 'CHOOSING_TRUMP' && state.game.contract?.declarer === state.mySeat;
  panel.classList.toggle('hidden', !myTurn);
  if (!myTurn) return;
  panel.innerHTML = '';
  panel.appendChild(el('h3', null, 'Koz Seç'));
  const row = el('div', 'row');
  for (const suit of ['S', 'H', 'D', 'C']) {
    const b = el('button', RED_SUITS.has(suit) ? 'suit-red' : '', SUIT_SYMBOL[suit]);
    b.style.fontSize = '20px';
    b.addEventListener('click', () => socket.emit('trump:select', { tableId: currentTableId, suit }));
    row.appendChild(b);
  }
  panel.appendChild(row);
}

function renderHandCompletePanel(state) {
  const panel = $('#hand-complete-panel');
  const show = state.game.phase === 'HAND_COMPLETE';
  panel.classList.toggle('hidden', !show);
  if (!show) return;
  panel.innerHTML = '';
  const r = state.game.lastHandResult;
  if (r) {
    const c = r.contract;
    panel.appendChild(
      el(
        'p',
        null,
        `${state.game.players[c.declarer].name} - ${CONTRACT_LABEL[c.type]} ${c.target}: ${r.tricksWon[c.declarer]} el aldı.`
      )
    );
    for (let i = 0; i < 4; i++) {
      panel.appendChild(el('p', null, `${state.game.players[i].name}: ${r.scoreDelta[i] >= 0 ? '+' : ''}${r.scoreDelta[i]} puan`));
    }
  }
  const btn = el('button', null, 'Sonraki Eli Başlat');
  btn.addEventListener('click', () => socket.emit('hand:next', { tableId: currentTableId }));
  panel.appendChild(btn);
}

function renderMatchCompletePanel(state) {
  const panel = $('#match-complete-panel');
  const show = state.game.phase === 'MATCH_COMPLETE';
  panel.classList.toggle('hidden', !show);
  if (!show) return;
  panel.innerHTML = '';
  const winner = state.game.matchWinner;
  const winnerLabel = state.game.settings.partnership
    ? `Takım ${teamOf(winner) === 0 ? 'A (0-2)' : 'B (1-3)'}`
    : state.game.players[winner].name;
  panel.appendChild(el('h3', null, `Kazanan: ${winnerLabel}`));
}

function renderHand(state) {
  const container = $('#hand');
  container.innerHTML = '';
  const isPlayingTurn = state.game.phase === 'PLAYING' && state.game.turn === state.mySeat;
  const legal = isPlayingTurn
    ? legalPlays(state.game.hand, state.game.currentTrick, state.game.contract?.trumpSuit ?? null)
    : [];
  for (const card of state.game.hand) {
    const isLegal = legal.some((c) => c.suit === card.suit && c.rank === card.rank);
    const disabled = !isPlayingTurn || !isLegal;
    container.appendChild(
      cardEl(card, {
        disabled,
        onClick: () => socket.emit('card:play', { tableId: currentTableId, card }),
      })
    );
  }
}

function renderGame(state) {
  showScreen('game');
  renderScoreboard(state);
  renderSeats(state);
  renderTrick(state);
  renderOpenHandPanel(state);
  renderBidPanel(state);
  renderTrumpPanel(state);
  renderHandCompletePanel(state);
  renderMatchCompletePanel(state);
  renderHand(state);
}

socket.on('table:update', (state) => {
  latestState = state;
  currentTableId = state.tableId;
  localStorage.setItem('batak.tableId', currentTableId);
  if (!state.game) {
    renderWaiting(state);
  } else {
    renderGame(state);
  }
});

socket.on('table:error', (payload) => showToast(payload.message));

socket.on('connect', () => {
  if (currentTableId) {
    socket.emit('table:join', { playerId, name: currentName(), tableId: currentTableId }, (res) => {
      if (res.error) {
        currentTableId = null;
        localStorage.removeItem('batak.tableId');
        showScreen('lobby');
        refreshLobby();
      }
    });
  } else {
    refreshLobby();
  }
});
