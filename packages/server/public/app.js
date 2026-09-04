/* Vanilla-JS client for the Batak engine/server. No build step. */

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
let reconnectToken = localStorage.getItem('batak.reconnectToken') || null;
let latestState = null;
let lastTrickSignature = null;
let lastChatCount = 0;

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

// ---------- Sound (synthesized, no external audio files needed) ----------
let soundOn = localStorage.getItem('batak.sound') !== 'off';
let audioCtx = null;
function ensureAudio() {
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      audioCtx = null;
    }
  }
  return audioCtx;
}
function beep(freq, durationMs, type = 'sine', gainValue = 0.08) {
  if (!soundOn) return;
  const ctx = ensureAudio();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.value = gainValue;
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000);
  osc.stop(ctx.currentTime + durationMs / 1000);
}
const sounds = {
  cardPlay: () => beep(520, 90, 'triangle'),
  bid: () => beep(660, 100, 'square', 0.05),
  trickWon: () => { beep(440, 90); setTimeout(() => beep(660, 140), 90); },
  yourTurn: () => beep(880, 120, 'sine', 0.06),
  batak: () => { beep(220, 160, 'sawtooth'); setTimeout(() => beep(160, 220, 'sawtooth'), 140); },
  win: () => { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 180), i * 120)); },
};
function updateSoundBtn() {
  $('#soundToggleBtn').textContent = soundOn ? '🔊' : '🔇';
}
$('#soundToggleBtn').addEventListener('click', () => {
  soundOn = !soundOn;
  localStorage.setItem('batak.sound', soundOn ? 'on' : 'off');
  updateSoundBtn();
  if (soundOn) ensureAudio();
});
updateSoundBtn();

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
function cardEl(card, { mini = false, disabled = false, selected = false, onClick = null } = {}) {
  const c = el(
    'div',
    'playing-card' +
      (RED_SUITS.has(card.suit) ? ' red' : '') +
      (mini ? ' mini' : '') +
      (disabled ? ' disabled' : '') +
      (selected ? ' selected' : '')
  );
  const label = `${rankLabel(card.rank)}${SUIT_SYMBOL[card.suit]}`;
  c.appendChild(el('div', 'corner', label));
  c.appendChild(el('div', 'pip', SUIT_SYMBOL[card.suit]));
  c.appendChild(el('div', 'corner bottom-right', label));
  if (onClick && !disabled) c.addEventListener('click', onClick);
  return c;
}
function cardBackEl() {
  return el('div', 'card-back');
}

// ---------- Legal-play check (mirrors engine's configurable follow-suit / must-beat rules) ----------
function legalPlays(hand, trick, trumpSuit, rules) {
  const mustTrumpWhenVoid = rules ? rules.mustTrumpWhenVoid : true;
  const mustOvertrumpOrBeat = rules ? rules.mustOvertrumpOrBeat : true;
  if (trick.length === 0) return hand;
  const ledSuit = trick[0].card.suit;
  const cardsOfLedSuit = hand.filter((c) => c.suit === ledSuit);
  const trumpCards = trumpSuit ? hand.filter((c) => c.suit === trumpSuit) : [];
  const eligible =
    cardsOfLedSuit.length > 0 ? cardsOfLedSuit : mustTrumpWhenVoid && trumpCards.length > 0 ? trumpCards : hand;

  if (!mustOvertrumpOrBeat) return eligible;

  const trumpsPlayed = trumpSuit ? trick.filter((tc) => tc.card.suit === trumpSuit) : [];
  const pool = trumpsPlayed.length > 0 ? trumpsPlayed : trick.filter((tc) => tc.card.suit === ledSuit);
  const currentBest = pool.reduce((best, tc) => (tc.card.rank > best.card.rank ? tc : best), pool[0]).card;

  const beating = eligible.filter((c) => c.suit === currentBest.suit && c.rank > currentBest.rank);
  return beating.length > 0 ? beating : eligible;
}

// ---------- Team helpers ----------
function teamOf(seat) {
  return seat % 2;
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
  if (modes.buriedCards) frag.appendChild(el('span', 'badge', 'Gömmeli'));
  if (!modes.partnership && !modes.fixedSpadesTrump && !modes.buriedCards) {
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

function persistJoin(tableId, token) {
  currentTableId = tableId;
  reconnectToken = token;
  localStorage.setItem('batak.tableId', tableId);
  if (token) localStorage.setItem('batak.reconnectToken', token);
}

function leaveTable() {
  if (!currentTableId) return;
  socket.emit('table:leave', { tableId: currentTableId });
  currentTableId = null;
  reconnectToken = null;
  latestState = null;
  localStorage.removeItem('batak.tableId');
  localStorage.removeItem('batak.reconnectToken');
  showScreen('lobby');
  refreshLobby();
}
$('#leaveWaitingBtn').addEventListener('click', leaveTable);
$('#leaveGameBtn').addEventListener('click', leaveTable);

function joinTable(tableId) {
  socket.emit('table:join', { playerId, name: currentName(), tableId, reconnectToken }, (res) => {
    if (res.error) return showToast(res.error);
    persistJoin(res.tableId, res.reconnectToken);
    if (res.isSpectator) showToast('Masa dolu - seyirci olarak katıldın.');
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
      strictTrumpRules: $('#modeStrictTrump').checked,
      buriedCards: $('#modeBuried').checked,
      allowSpectators: $('#modeSpectators').checked,
      scoringMode: $('#ruleScoringMode').value,
      penaltyMode: $('#rulePenaltyMode').value,
      gameEndMode: $('#ruleGameEndMode').value,
      targetScore: Number($('#ruleTargetScore').value) || undefined,
      handsPerMatch: Number($('#ruleHandsPerMatch').value) || undefined,
      minBid: Number($('#ruleMinBid').value) || undefined,
    },
    (res) => {
      if (res.error) return showToast(res.error);
      persistJoin(res.tableId, res.reconnectToken);
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

$('#addBotBtn').addEventListener('click', () => {
  socket.emit('table:addBot', { tableId: currentTableId });
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
      if (seat.isBot) li.className += ' bot';
      li.appendChild(document.createTextNode(`Koltuk ${i + 1}: ${seat.name}`));
      if (!seat.connected) li.appendChild(el('span', 'seat-badge', 'koptu'));
      if (seat.isBot) li.appendChild(el('span', 'seat-badge bot', 'BOT'));
    }
    ul.appendChild(li);
  });

  const iAmHost = state.hostPlayerId === playerId;
  const full = state.seats.every((s) => s !== null);
  $('#startGameBtn').classList.toggle('hidden', !(iAmHost && full));
  $('#addBotBtn').classList.toggle('hidden', !(iAmHost && !full));

  const note = $('#spectatorNote');
  if (state.isSpectator) {
    note.textContent = `Seyircisin. Şu an ${state.spectatorCount} seyirci var.`;
    note.classList.remove('hidden');
  } else {
    note.classList.add('hidden');
  }
}

// ---------- Rendering the game screen ----------
const CONTRACT_LABEL = { koz: 'Koz', kozsuz: 'Kozsuz', gizli: 'Gizli', elsiz: 'Elsiz' };

function relPos(seatIndex, mySeat) {
  const base = mySeat === null ? 0 : mySeat;
  const diff = (seatIndex - base + 4) % 4;
  return ['bottom', 'left', 'top', 'right'][diff];
}

function renderScoreboard(state) {
  $('#modeBadges').innerHTML = '';
  $('#modeBadges').appendChild(modeBadges(state.game.settings));
  if (state.isSpectator) $('#modeBadges').appendChild(el('span', 'badge', '👁 Seyirci'));

  const header = $('#scoreboard');
  header.innerHTML = '';
  const progressLabel =
    state.game.gameEndMode === 'targetScore'
      ? `El ${state.game.handNumber} · Hedef ${state.game.targetScore}`
      : `El ${state.game.handNumber}/${state.game.handsPerMatch}`;
  header.appendChild(el('div', 'score-chip', progressLabel));
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
    if (state.seats[i] && state.seats[i].isBot) container.appendChild(el('div', 'bot-tag', '🤖 bot'));

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
    s.classList.remove('winning');
  });
  const trick = state.game.currentTrick.length ? state.game.currentTrick : state.game.lastCompletedTrick || [];
  for (const tc of trick) {
    const pos = relPos(tc.player, state.mySeat);
    const slot = document.querySelector(`.trick-slot[data-pos="${pos}"]`);
    if (!slot) continue;
    slot.appendChild(el('div', 'slot-name', state.game.players[tc.player].name));
    slot.appendChild(cardEl(tc.card, { mini: true }));
  }

  // sound + highlight when a trick just completed
  const sig = state.game.lastCompletedTrick ? JSON.stringify(state.game.lastCompletedTrick) : null;
  if (sig && sig !== lastTrickSignature && state.game.currentTrick.length === 0) {
    sounds.trickWon();
  }
  lastTrickSignature = sig;

  const contract = state.game.contract;
  let status = '';
  if (state.game.phase === 'BIDDING') {
    status = state.game.turn === state.mySeat ? 'Sıra sende: teklif ver' : `Sıra: ${state.game.players[state.game.turn]?.name ?? ''}`;
  } else if (state.game.phase === 'EXCHANGE') {
    status = `${state.game.players[contract.declarer].name} gömülen kartları değerlendiriyor...`;
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

let exchangeSelection = [];
function renderExchangePanel(state) {
  const panel = $('#exchange-panel');
  const myTurn = state.game.phase === 'EXCHANGE' && state.game.contract?.declarer === state.mySeat;
  panel.classList.toggle('hidden', !myTurn);
  if (!myTurn) return;

  const need = state.game.settings.buriedCardCount;
  panel.innerHTML = '';
  panel.appendChild(el('h3', null, `Göm: ${need} kart seç ve at`));
  panel.appendChild(el('p', 'hint', `Kenara ayrılan kartlar eline eklendi. Şimdi tam ${need} kart seçip gömmelisin.`));

  const row = el('div', 'mini-row');
  for (const card of state.game.hand) {
    const key = `${card.rank}${card.suit}`;
    const selected = exchangeSelection.includes(key);
    row.appendChild(
      cardEl(card, {
        selected,
        onClick: () => {
          if (selected) {
            exchangeSelection = exchangeSelection.filter((k) => k !== key);
          } else if (exchangeSelection.length < need) {
            exchangeSelection.push(key);
          }
          renderExchangePanel(latestState);
        },
      })
    );
  }
  panel.appendChild(row);

  const submitBtn = el('button', null, `Göm (${exchangeSelection.length}/${need})`);
  submitBtn.disabled = exchangeSelection.length !== need;
  submitBtn.addEventListener('click', () => {
    const discards = state.game.hand.filter((c) => exchangeSelection.includes(`${c.rank}${c.suit}`));
    socket.emit('exchange:submit', { tableId: currentTableId, discards });
    exchangeSelection = [];
  });
  panel.appendChild(submitBtn);
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
      sounds.bid();
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
  if (!state.isSpectator) {
    const btn = el('button', null, 'Sonraki Eli Başlat');
    btn.addEventListener('click', () => socket.emit('hand:next', { tableId: currentTableId }));
    panel.appendChild(btn);
  }
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
  if (state.game.phase === 'EXCHANGE') return; // exchange panel handles card selection instead
  const isPlayingTurn = state.game.phase === 'PLAYING' && state.game.turn === state.mySeat;
  const legal = isPlayingTurn
    ? legalPlays(state.game.hand, state.game.currentTrick, state.game.contract?.trumpSuit ?? null, state.game.settings)
    : [];
  for (const card of state.game.hand) {
    const isLegal = legal.some((c) => c.suit === card.suit && c.rank === card.rank);
    const disabled = !isPlayingTurn || !isLegal;
    container.appendChild(
      cardEl(card, {
        disabled,
        onClick: () => {
          sounds.cardPlay();
          socket.emit('card:play', { tableId: currentTableId, card });
        },
      })
    );
  }
}

function maybePlayTurnSound(state) {
  const iAmUp =
    state.mySeat !== null &&
    state.game.turn === state.mySeat &&
    (state.game.phase === 'BIDDING' || state.game.phase === 'PLAYING' || state.game.phase === 'CHOOSING_TRUMP');
  if (iAmUp && maybePlayTurnSound._last !== state.game.turn + state.game.phase + state.game.handNumber) {
    sounds.yourTurn();
  }
  maybePlayTurnSound._last = state.game.turn + state.game.phase + state.game.handNumber;
}

function renderChat(state) {
  const log = $('#chatLog');
  const chat = state.chat || [];
  if (chat.length !== lastChatCount) {
    log.innerHTML = '';
    for (const m of chat) {
      const row = el('div', 'msg');
      row.appendChild(el('strong', null, m.name + ': '));
      row.appendChild(document.createTextNode(m.text));
      log.appendChild(row);
    }
    log.scrollTop = log.scrollHeight;
    lastChatCount = chat.length;
  }
}

$('#chatSendBtn').addEventListener('click', sendChat);
$('#chatInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendChat();
});
function sendChat() {
  const input = $('#chatInput');
  const text = input.value.trim();
  if (!text || !currentTableId) return;
  socket.emit('chat:send', { tableId: currentTableId, text });
  input.value = '';
}

function renderGame(state) {
  showScreen('game');
  renderScoreboard(state);
  renderSeats(state);
  renderTrick(state);
  renderOpenHandPanel(state);
  renderExchangePanel(state);
  renderBidPanel(state);
  renderTrumpPanel(state);
  renderHandCompletePanel(state);
  renderMatchCompletePanel(state);
  renderHand(state);
  renderChat(state);
  maybePlayTurnSound(state);
}

socket.on('table:update', (state) => {
  latestState = state;
  persistJoin(state.tableId, reconnectToken);
  if (!state.game) {
    renderWaiting(state);
    renderChat(state);
  } else {
    renderGame(state);
  }
});

socket.on('table:error', (payload) => showToast(payload.message));

socket.on('connect', () => {
  if (currentTableId) {
    socket.emit('table:join', { playerId, name: currentName(), tableId: currentTableId, reconnectToken }, (res) => {
      if (res.error) {
        currentTableId = null;
        reconnectToken = null;
        localStorage.removeItem('batak.tableId');
        localStorage.removeItem('batak.reconnectToken');
        showScreen('lobby');
        refreshLobby();
      } else {
        persistJoin(res.tableId, res.reconnectToken);
      }
    });
  } else {
    refreshLobby();
  }
});

// ---------- Turn countdown ----------
setInterval(() => {
  const timerEl = $('#turn-timer');
  if (!timerEl) return;
  const st = latestState;
  const deadline = st && st.turnDeadline;
  const active =
    st &&
    st.game &&
    (st.game.phase === 'BIDDING' || st.game.phase === 'PLAYING' || st.game.phase === 'CHOOSING_TRUMP' || st.game.phase === 'EXCHANGE');
  if (!deadline || !active) {
    timerEl.classList.add('hidden');
    return;
  }
  const secondsLeft = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
  timerEl.textContent = `⏱ ${secondsLeft}s`;
  timerEl.classList.remove('hidden');
  timerEl.classList.toggle('low', secondsLeft <= 5);
}, 250);
