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

// ---------- Legal-play check (mirrors engine's follow-suit rule, §15) ----------
function legalPlays(hand, trick) {
  if (trick.length === 0) return hand;
  const ledSuit = trick[0].card.suit;
  const cardsOfLedSuit = hand.filter((c) => c.suit === ledSuit);
  return cardsOfLedSuit.length > 0 ? cardsOfLedSuit : hand;
}

// ---------- Team helpers ----------
function teamOf(seat) {
  return seat % 2;
}
function teamClass(seat) {
  return teamOf(seat) === 0 ? 'teamA' : 'teamB';
}

// ---------- Variant metadata ----------
const VARIANT_LABELS = {
  NORMAL_BID: 'İhaleli Batak',
  OPEN_BID: 'Açık İhale',
  TEAM_BID: 'Eşli İhaleli Batak',
  TEAM_OPEN_BID: 'Eşli Açık İhale',
  SPADES: 'Koz Maça',
  TEAM_SPADES: 'Eşli Koz Maça',
  BURIED_BID: 'Gömmeli Batak',
};
const VARIANT_HINTS = {
  NORMAL_BID: 'Bireysel ihale, minimum 5. İhaleyi alan koz seçer ve o el sayısını almalıdır.',
  OPEN_BID: 'Bireysel ihale, minimum 5. İhaleyi alan koz seçtiği anda karşısındaki oyuncunun eli herkese açık gösterilir.',
  TEAM_BID: 'Karşılıklı oturan 2 oyuncu bir takımdır (0-2 ve 1-3). Minimum ihale 8; alınan eller takım toplamına yazılır.',
  TEAM_OPEN_BID: 'Eşli İhale + koz seçildiği anda ihaleyi alan oyuncunun ortağının eli herkese açık gösterilir.',
  SPADES: 'Koz her zaman ♠. "Taahhütlü" açıksa her oyuncu kendi el sayısını söyler; kapalıysa ihalesiz oynanır.',
  TEAM_SPADES: 'Eşli + koz her zaman ♠. Takım hedefi bireysel taahhütlerin toplamı ya da doğrudan takım taahhüdü olabilir.',
  BURIED_BID: 'İhaleyi alan oyuncu kenara ayrılan kartları alır ve elinden aynı sayıda kart gömer.',
};
const isTeamVariant = (id) => id === 'TEAM_BID' || id === 'TEAM_OPEN_BID' || id === 'TEAM_SPADES';
const isSpadesVariant = (id) => id === 'SPADES' || id === 'TEAM_SPADES';

function ruleBadges(ruleSet) {
  const frag = document.createDocumentFragment();
  frag.appendChild(el('span', 'badge', VARIANT_LABELS[ruleSet.variantId] || ruleSet.variantId));
  if (ruleSet.isOpenBidding) frag.appendChild(el('span', 'badge', 'Açık El'));
  if (ruleSet.biddingStyle === 'commitment') frag.appendChild(el('span', 'badge', 'Taahhütlü'));
  if (ruleSet.biddingStyle === 'none') frag.appendChild(el('span', 'badge', 'İhalesiz'));
  if (ruleSet.teamBidMode === 'directTeam' && ruleSet.isTeamGame) frag.appendChild(el('span', 'badge', 'Takım Taahhüdü'));
  return frag;
}

// ---------- Variant selector / dynamic form fields ----------
const variantSelect = $('#variantSelect');
const spadesBiddingToggle = $('#spadesBiddingToggle');
const teamBidModeToggle = $('#teamBidModeToggle');
const buriedCountField = $('#buriedCountField');

function refreshCreateFormVisibility() {
  const variantId = variantSelect.value;
  $('#variantHint').textContent = VARIANT_HINTS[variantId] || '';
  spadesBiddingToggle.classList.toggle('hidden', !isSpadesVariant(variantId));
  teamBidModeToggle.classList.toggle('hidden', variantId !== 'TEAM_SPADES');
  buriedCountField.classList.toggle('hidden', variantId !== 'BURIED_BID');
}
variantSelect.addEventListener('change', refreshCreateFormVisibility);
refreshCreateFormVisibility();

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
      badgeRow.appendChild(el('span', 'badge', VARIANT_LABELS[t.variantId] || t.variantId));
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
  const numOrUndef = (v) => (v === '' || v === null ? undefined : Number(v));
  socket.emit(
    'table:create',
    {
      playerId,
      name: currentName(),
      tableName,
      variantId: variantSelect.value,
      allowSpectators: $('#modeSpectators').checked,
      spadesBiddingEnabled: $('#modeSpadesBidding').checked,
      teamBidMode: $('#modeDirectTeamBid').checked ? 'directTeam' : 'individualSum',
      minimumBid: numOrUndef($('#ruleMinBid').value),
      maximumBid: numOrUndef($('#ruleMaxBid').value),
      buriedCardCount: Number($('#ruleBuriedCount').value) || undefined,
      scoreMode: $('#ruleScoreMode').value,
      allPassAction: $('#ruleAllPassAction').value,
      gameEndMode: $('#ruleGameEndMode').value,
      targetScore: Number($('#ruleTargetScore').value) || undefined,
      maxRounds: Number($('#ruleMaxRounds').value) || undefined,
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
  const badges = $('#waitModeBadges');
  badges.appendChild(el('span', 'badge', VARIANT_LABELS[state.rules.variantId] || state.rules.variantId));
  if (isSpadesVariant(state.rules.variantId) && state.rules.spadesBiddingEnabled === false) {
    badges.appendChild(el('span', 'badge', 'İhalesiz'));
  }
  if (state.rules.variantId === 'TEAM_SPADES' && state.rules.teamBidMode === 'directTeam') {
    badges.appendChild(el('span', 'badge', 'Takım Taahhüdü'));
  }

  const ul = $('#seatList');
  ul.innerHTML = '';
  const isTeam = isTeamVariant(state.rules.variantId);
  state.seats.forEach((seat, i) => {
    const li = el('li');
    if (isTeam) li.classList.add(teamClass(i));
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
function relPos(seatIndex, mySeat) {
  const base = mySeat === null ? 0 : mySeat;
  const diff = (seatIndex - base + 4) % 4;
  return ['bottom', 'left', 'top', 'right'][diff];
}

/** The trick target this seat is playing for right now, or null if it has none this hand. */
function targetFor(state, seat) {
  const contract = state.game.contract;
  if (!contract) return null;
  if (state.game.ruleSet.isTeamGame) {
    const t = contract.teamTargets[teamOf(seat)];
    return t === undefined ? null : t;
  }
  const t = contract.targets[seat];
  return t === undefined ? null : t;
}

function renderScoreboard(state) {
  $('#modeBadges').innerHTML = '';
  $('#modeBadges').appendChild(ruleBadges(state.game.ruleSet));
  if (state.isSpectator) $('#modeBadges').appendChild(el('span', 'badge', '👁 Seyirci'));

  const header = $('#scoreboard');
  header.innerHTML = '';
  const progressLabel =
    state.game.gameEndMode === 'targetScore'
      ? `El ${state.game.handNumber} · Hedef ${state.game.targetScore}`
      : `El ${state.game.handNumber}/${state.game.maxRounds}`;
  header.appendChild(el('div', 'score-chip', progressLabel));

  if (state.game.ruleSet.isTeamGame) {
    // Eşli masalarda takım arkadaşları her zaman aynı skoru paylaşır - tek skor olarak göster.
    for (const team of [0, 1]) {
      const seats = [team, team + 2];
      const names = seats.map((i) => state.game.players[i].name || '(boş)').join(' & ');
      const myTeam = state.mySeat !== null && teamOf(state.mySeat) === team;
      const onTurn = state.game.turn !== null && teamOf(state.game.turn) === team;
      let cls = 'score-chip' + (myTeam ? ' me' : '') + (onTurn ? ' turn' : '') + ' ' + teamClass(seats[0]);
      const chip = el('div', cls);
      chip.appendChild(el('span', 'name', `Takım ${team === 0 ? 'A' : 'B'}: ${names}`));
      chip.appendChild(el('span', 'pts', String(state.game.players[seats[0]].score)));
      header.appendChild(chip);
    }
  } else {
    for (let i = 0; i < 4; i++) {
      const p = state.game.players[i];
      const cls = 'score-chip' + (i === state.mySeat ? ' me' : '') + (state.game.turn === i ? ' turn' : '');
      const chip = el('div', cls);
      chip.appendChild(el('span', 'name', p.name || '(boş)'));
      chip.appendChild(el('span', 'pts', String(p.score)));
      header.appendChild(chip);
    }
  }
}

function renderTrumpBadge(state) {
  const badge = $('#trumpBadge');
  const contract = state.game.contract;
  if (!contract) {
    badge.classList.add('hidden');
    return;
  }
  badge.classList.remove('hidden');
  badge.innerHTML = '';
  if (!contract.trumpSuit) {
    badge.classList.add('pending');
    const declarerName = contract.declarer !== null ? state.game.players[contract.declarer]?.name ?? '' : '';
    badge.textContent = `Koz seçiliyor... (${declarerName})`;
    return;
  }

  badge.classList.remove('pending');
  badge.appendChild(document.createTextNode('Koz: '));
  badge.appendChild(
    el('span', 'suit' + (RED_SUITS.has(contract.trumpSuit) ? ' red' : ''), SUIT_SYMBOL[contract.trumpSuit])
  );

  if (contract.declarer !== null) {
    const declarerName = state.game.players[contract.declarer]?.name ?? '';
    const target = targetFor(state, contract.declarer);
    badge.appendChild(document.createTextNode(` — ${declarerName}: ${target} el`));
  } else if (state.game.ruleSet.biddingStyle === 'commitment') {
    badge.appendChild(document.createTextNode(' — herkes kendi elini oynuyor'));
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
    const stillBidding = state.game.phase === 'BIDDING';
    if (stillBidding && (p.hasPassed || p.hasCommitted)) cls += ' passed';
    container.className = cls;

    const nameEl = el('div', 'seat-name', p.name || '(boş)');
    container.appendChild(nameEl);
    if (state.seats[i] && state.seats[i].isBot) container.appendChild(el('div', 'bot-tag', '🤖 bot'));

    const target = state.game.contract ? targetFor(state, i) : null;
    if (target !== null && state.game.phase === 'PLAYING') {
      container.appendChild(el('div', 'bot-tag', `Hedef: ${target}`));
    }

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
  const ruleSet = state.game.ruleSet;
  let status = '';
  if (state.game.phase === 'BIDDING') {
    const verb = ruleSet.biddingStyle === 'commitment' ? 'kaç el alacağını söyle' : 'teklif ver';
    status =
      state.game.turn === state.mySeat
        ? `Sıra sende: ${verb}`
        : `Sıra: ${state.game.players[state.game.turn]?.name ?? ''}`;
    if (ruleSet.biddingStyle === 'auction' && state.game.highestBid) {
      const hb = state.game.highestBid;
      status += ` — en yüksek teklif: ${hb.value} (${state.game.players[hb.player]?.name ?? ''})`;
    }
  } else if (state.game.phase === 'EXCHANGE') {
    status = `${state.game.players[contract.declarer].name} gömülen kartları değerlendiriyor...`;
  } else if (state.game.phase === 'CHOOSING_TRUMP') {
    status = `${state.game.players[contract.declarer].name} koz seçiyor...`;
  } else if (state.game.phase === 'PLAYING') {
    let contractDesc;
    if (contract.declarer !== null) {
      const target = targetFor(state, contract.declarer);
      contractDesc = `${state.game.players[contract.declarer].name}: ${target} el${contract.trumpSuit ? ' (' + SUIT_SYMBOL[contract.trumpSuit] + ')' : ''}`;
    } else {
      contractDesc = `Koz: ${contract.trumpSuit ? SUIT_SYMBOL[contract.trumpSuit] : '-'}`;
    }
    status = `${contractDesc} — Sıra: ${state.game.players[state.game.turn]?.name ?? ''}`;
  } else if (state.game.phase === 'HAND_COMPLETE') {
    status = 'El tamamlandı.';
  } else if (state.game.phase === 'MATCH_COMPLETE') {
    const winner = state.game.matchWinner;
    const winnerLabel = ruleSet.isTeamGame
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

  const need = state.game.ruleSet.buriedCardCount;
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

  const ruleSet = state.game.ruleSet;
  const isCommitment = ruleSet.biddingStyle === 'commitment';

  panel.innerHTML = '';
  panel.appendChild(el('h3', null, isCommitment ? 'Kaç El Alacaksın?' : 'Teklif Ver'));
  if (ruleSet.fixedTrump) panel.appendChild(el('div', 'hint', `Bu masada koz her zaman ${SUIT_SYMBOL[ruleSet.fixedTrump]}.`));

  const row = el('div', 'row');
  const select = document.createElement('select');
  for (let v = ruleSet.minimumBid; v <= ruleSet.maximumBid; v++) select.appendChild(new Option(String(v), String(v)));
  row.appendChild(select);

  const submitBtn = el('button', null, isCommitment ? 'Söyle' : 'Teklif Et');
  submitBtn.addEventListener('click', () => {
    sounds.bid();
    socket.emit('bid:submit', { tableId: currentTableId, bid: { type: 'bid', value: Number(select.value) } });
  });
  row.appendChild(submitBtn);
  panel.appendChild(row);

  if (!isCommitment) {
    const passRow = el('div', 'row');
    const passBtn = el('button', null, 'Pas');
    passBtn.addEventListener('click', () => {
      sounds.bid();
      socket.emit('bid:submit', { tableId: currentTableId, bid: { type: 'pas' } });
    });
    passRow.appendChild(passBtn);
    panel.appendChild(passRow);
  }
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
    if (c.declarer !== null) {
      const target = state.game.ruleSet.isTeamGame ? c.teamTargets[teamOf(c.declarer)] : c.targets[c.declarer];
      panel.appendChild(
        el('p', null, `${state.game.players[c.declarer].name} - ${target} el: ${r.tricksWon[c.declarer]} el aldı.`)
      );
    }
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
  const winnerLabel = state.game.ruleSet.isTeamGame
    ? `Takım ${teamOf(winner) === 0 ? 'A (0-2)' : 'B (1-3)'}`
    : state.game.players[winner].name;
  panel.appendChild(el('h3', null, `Kazanan: ${winnerLabel}`));
}

function renderHand(state) {
  const container = $('#hand');
  container.innerHTML = '';
  if (state.game.phase === 'EXCHANGE') return; // exchange panel handles card selection instead
  const isPlayingTurn = state.game.phase === 'PLAYING' && state.game.turn === state.mySeat;
  const legal = isPlayingTurn ? legalPlays(state.game.hand, state.game.currentTrick) : [];
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

/** Running (cumulative) score-by-hand table, shown at the bottom of the game screen. Eşli tables collapse to 2 team columns since teammates always share the same delta. */
function renderScoreHistory(state) {
  const panel = $('#score-history-panel');
  const history = state.game.handHistory || [];
  if (!history.length) {
    panel.classList.add('hidden');
    return;
  }
  panel.classList.remove('hidden');

  const isTeam = state.game.ruleSet.isTeamGame;
  const container = $('#scoreHistoryTable');
  container.innerHTML = '';

  const table = el('table', 'score-history-table');
  const headRow = document.createElement('tr');
  headRow.appendChild(el('th', null, 'El'));
  if (isTeam) {
    headRow.appendChild(el('th', null, 'Takım A (0-2)'));
    headRow.appendChild(el('th', null, 'Takım B (1-3)'));
  } else {
    for (let i = 0; i < 4; i++) headRow.appendChild(el('th', null, state.game.players[i].name || `Oyuncu ${i + 1}`));
  }
  table.appendChild(headRow);

  const running = { 0: 0, 1: 0, 2: 0, 3: 0 };
  for (const hand of history) {
    const row = document.createElement('tr');
    row.appendChild(el('td', null, String(hand.handNumber)));
    if (isTeam) {
      running[0] += hand.scoreDelta[0];
      running[1] += hand.scoreDelta[1];
      row.appendChild(el('td', null, String(running[0])));
      row.appendChild(el('td', null, String(running[1])));
    } else {
      for (let i = 0; i < 4; i++) {
        running[i] += hand.scoreDelta[i];
        row.appendChild(el('td', null, String(running[i])));
      }
    }
    table.appendChild(row);
  }
  container.appendChild(table);
  container.scrollTop = container.scrollHeight;
}

function renderGame(state) {
  showScreen('game');
  renderScoreboard(state);
  renderTrumpBadge(state);
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
  renderScoreHistory(state);
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
