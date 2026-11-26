const TOTAL_DECK_COUNTS = { "7": 1, "6": 2, "5": 3, "4": 4, "3": 5, "2": 6, "1": 7, "-1": 7 };
const PHASE_LABELS = {
  LOBBY: "대기실",
  REVEAL_SELECT: "공개 카드 선택",
  BET1: "1차 베팅",
  HIT_STAY: "HIT / STAY",
  BET2: "2차 최종 베팅",
  SHOWDOWN: "결과 정산",
  GAME_OVER: "최종 종료",
};

let state = null;
let pollTimer = null;
let selectedChips = 30;
let roomId = sessionStorage.getItem("hs_room") || "";
let playerId = sessionStorage.getItem("hs_pid") || "";

const $ = (id) => document.getElementById(id);

function showScreen(name) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  $(`screen-${name}`).classList.add("active");
}

function showError(msg) {
  const el = $("home-error");
  el.textContent = msg;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 3500);
}

// Check URL ?room=XXXX
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get("room")) {
  $("input-room").value = urlParams.get("room").toUpperCase();
}

// Chip selector
document.querySelectorAll(".seg-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".seg-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    selectedChips = parseInt(btn.dataset.chips, 10);
  });
});

async function createRoom(mode) {
  const name = $("input-name").value.trim() || "플레이어";
  const res = await fetch("/api/create_room", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, mode, chips: selectedChips }),
  });
  const data = await res.json();
  if (data.error) return showError(data.error);
  roomId = data.room_id;
  playerId = data.player_id;
  sessionStorage.setItem("hs_room", roomId);
  sessionStorage.setItem("hs_pid", playerId);
  startPolling();
}

async function joinRoom() {
  const name = $("input-name").value.trim() || "게스트";
  const code = $("input-room").value.trim().toUpperCase();
  if (code.length < 4) return showError("4자리 방 코드를 입력하세요.");
  const res = await fetch("/api/join_room", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ room_id: code, name }),
  });
  const data = await res.json();
  if (!res.ok || data.error) return showError(data.error || "입장 실패");
  roomId = data.room_id;
  playerId = data.player_id;
  sessionStorage.setItem("hs_room", roomId);
  sessionStorage.setItem("hs_pid", playerId);
  startPolling();
}

function startPolling() {
  stopPolling();
  fetchState();
  pollTimer = setInterval(fetchState, 800);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function fetchState() {
  if (!roomId || !playerId) return;
  try {
    const res = await fetch(`/api/room/${roomId}?player_id=${encodeURIComponent(playerId)}`);
    if (res.status === 404 || res.status === 403) {
      leaveRoom();
      return;
    }
    if (!res.ok) return;
    const msg = await res.json();
    if (msg.type === "state") {
      state = msg.data;
      render();
    }
  } catch (_) {}
}

async function sendAction(payload) {
  if (!roomId || !playerId) return;
  try {
    const res = await fetch(`/api/room/${roomId}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, player_id: playerId }),
    });
    if (!res.ok) return;
    const msg = await res.json();
    if (msg.type === "state") {
      state = msg.data;
      render();
    }
  } catch (_) {}
}

function leaveRoom() {
  stopPolling();
  sessionStorage.removeItem("hs_room");
  sessionStorage.removeItem("hs_pid");
  roomId = "";
  playerId = "";
  state = null;
  showScreen("home");
}

function render() {
  if (!state) return;

  if (state.phase === "LOBBY") {
    showScreen("lobby");
    $("lobby-code").textContent = state.room_id;
    $("lobby-count").textContent = state.players.length;
    const list = $("lobby-player-list");
    list.innerHTML = "";
    state.players.forEach((p) => {
      const li = document.createElement("li");
      li.innerHTML = `<span>${p.name} ${p.id === state.host_id ? "👑" : ""}</span><span class="muted">${p.chips}칩</span>`;
      list.appendChild(li);
    });
    const isHost = state.viewer_id === state.host_id;
    $("host-controls").classList.toggle("hidden", !isHost);
    $("guest-wait-msg").classList.toggle("hidden", isHost);
    return;
  }

  showScreen("game");
  $("hud-round").textContent = `R${state.round_num}`;
  $("hud-phase").textContent = PHASE_LABELS[state.phase] || state.phase;
  $("hud-target").textContent = state.target;
  $("hud-pot").textContent = state.pot;
  $("hud-deck").textContent = state.deck_remaining;

  const me = state.players.find((p) => p.id === state.viewer_id);
  const opponents = state.players.filter((p) => p.id !== state.viewer_id);

  // Render Opponents
  const oppGrid = $("opponents-grid");
  oppGrid.innerHTML = "";
  opponents.forEach((p) => {
    const div = document.createElement("div");
    div.className = "opp-card";
    if (p.is_turn) div.classList.add("active-turn");
    if (p.folded) div.classList.add("folded");
    if (p.eliminated) div.classList.add("eliminated");

    let statusText = p.last_action || "대기";
    let statusCls = "";
    if (p.eliminated) { statusText = "탈락"; statusCls = "fold"; }
    else if (p.folded) { statusText = "포기"; statusCls = "fold"; }
    else if (p.is_turn) { statusText = "차례"; statusCls = "turn"; }
    else if (p.stayed && state.phase === "HIT_STAY") { statusText = "STAY"; statusCls = "stay"; }
    else if (state.phase === "SHOWDOWN" && p.hand_sum !== null) {
      statusText = p.busted ? `버스트(${p.hand_sum})` : `합 ${p.hand_sum}`;
      statusCls = p.busted ? "fold" : "stay";
    }

    const cardsHtml = p.cards
      .map((c) => {
        if (c.value === null) return `<div class="tiny-card back">?</div>`;
        const minus = c.value < 0 ? "minus" : "";
        return `<div class="tiny-card ${minus}">${c.value}</div>`;
      })
      .join("");

    div.innerHTML = `
      <div class="opp-top">
        <span class="opp-name">${p.is_lead ? "⭐" : ""}${p.name}</span>
        <span class="opp-chips">🪙${p.chips}</span>
      </div>
      <div class="opp-mid">
        <div class="opp-cards">${cardsHtml}</div>
        <span class="opp-action ${statusCls}">${statusText}</span>
      </div>
    `;
    oppGrid.appendChild(div);
  });

  // Banner
  const bannerEl = $("banner-text");
  if (state.winner_info) {
    bannerEl.textContent = state.winner_info.message;
  } else if (state.phase === "REVEAL_SELECT") {
    bannerEl.textContent = me && !me.revealed_initial ? "👇 내 카드 중 1장을 터치해 공개하세요!" : "다른 플레이어의 카드 공개 대기 중...";
  } else if (me && me.is_turn) {
    bannerEl.textContent = state.phase === "HIT_STAY" ? "⚡ 내 차례! HIT 또는 STAY를 선택하세요" : "💰 내 베팅 차례입니다!";
  } else {
    const turnP = state.players.find((p) => p.is_turn);
    bannerEl.textContent = turnP ? `${turnP.name}님이 고민 중입니다...` : `${PHASE_LABELS[state.phase]} 진행 중`;
  }
  $("mini-log").textContent = state.logs[state.logs.length - 1] || "";

  // Render Me
  if (me) {
    $("my-name").textContent = me.name;
    $("my-chips").textContent = me.chips;
    $("my-lead-badge").classList.toggle("hidden", !me.is_lead);

    const sumPill = $("my-sum-pill");
    sumPill.classList.remove("bust", "perfect");
    $("my-sum").textContent = me.hand_sum !== null ? `${me.hand_sum} / ${state.target}` : "-";
    if (me.hand_sum !== null) {
      if (me.hand_sum > state.target) sumPill.classList.add("bust");
      else if (me.hand_sum === state.target) sumPill.classList.add("perfect");
    }

    const st = $("my-status");
    st.classList.add("hidden");
    if (me.eliminated) { st.textContent = "탈락"; st.classList.remove("hidden"); }
    else if (me.folded) { st.textContent = "포기"; st.classList.remove("hidden"); }
    else if (me.stayed && state.phase === "HIT_STAY") { st.textContent = "STAY"; st.classList.remove("hidden"); }

    // My Hand
    const handEl = $("my-hand");
    handEl.innerHTML = "";
    const canReveal = state.phase === "REVEAL_SELECT" && !me.revealed_initial && !me.folded && !me.eliminated;
    me.cards.forEach((c) => {
      const card = document.createElement("div");
      card.className = "play-card";
      if (c.value < 0) card.classList.add("minus");
      if (canReveal) card.classList.add("selectable");

      let tagText = "비공개";
      let tagCls = "secret";
      if (c.is_hit) { tagText = "HIT"; tagCls = "hit"; }
      else if (c.public) { tagText = "공개"; tagCls = "public"; }

      card.innerHTML = `
        <span class="c-val">${c.value}</span>
        <span class="c-tag ${tagCls}">${tagText}</span>
      `;
      if (canReveal) {
        card.addEventListener("click", () => sendAction({ type: "reveal", card_idx: c.idx }));
      }
      handEl.appendChild(card);
    });

    renderActionBar(me);
  }
}

function renderActionBar(me) {
  const bar = $("action-bar");
  bar.innerHTML = "";

  if (state.phase === "SHOWDOWN") {
    const btn = document.createElement("button");
    btn.className = "btn btn-gold";
    btn.textContent = "다음 라운드 시작 ▶";
    btn.onclick = () => sendAction({ type: "next_round" });
    bar.appendChild(btn);
    return;
  }

  if (state.phase === "GAME_OVER") {
    const row = document.createElement("div");
    row.className = "action-row cols-2";
    if (state.viewer_id === state.host_id) {
      const b1 = document.createElement("button");
      b1.className = "btn btn-gold";
      b1.textContent = "다시 하기";
      b1.onclick = () => sendAction({ type: "restart" });
      row.appendChild(b1);
    }
    const b2 = document.createElement("button");
    b2.className = "btn btn-outline";
    b2.textContent = "로비로 나가기";
    b2.onclick = leaveRoom;
    row.appendChild(b2);
    bar.appendChild(row);
    return;
  }

  if (me.eliminated || me.folded) {
    bar.innerHTML = `<div class="wait-pill">${me.eliminated ? "탈락했습니다. 관전 중..." : "이번 라운드를 포기했습니다."}</div>`;
    return;
  }

  if (state.phase === "REVEAL_SELECT") {
    bar.innerHTML = `<div class="wait-pill">${me.revealed_initial ? "다른 플레이어 선택 대기 중..." : "공개할 카드 1장을 터치하세요"}</div>`;
    return;
  }

  if (!me.is_turn) {
    bar.innerHTML = `<div class="wait-pill">다른 플레이어의 차례를 기다리는 중...</div>`;
    return;
  }

  if (state.phase === "BET1" || state.phase === "BET2") {
    const needed = Math.max(0, state.current_bet - me.phase_bet);
    const maxAllowed = Math.max(0, state.max_round_bet - me.round_bet);
    const callPay = Math.min(needed, me.chips, maxAllowed);

    const row1 = document.createElement("div");
    row1.className = "action-row cols-2";
    const foldBtn = document.createElement("button");
    foldBtn.className = "act-btn act-fold";
    foldBtn.textContent = "포기 (Fold)";
    foldBtn.onclick = () => sendAction({ type: "bet", action: "fold" });

    const callBtn = document.createElement("button");
    callBtn.className = "act-btn act-call";
    callBtn.textContent = callPay === 0 ? "체크 (Check)" : `콜 (+${callPay}칩)`;
    callBtn.onclick = () => sendAction({ type: "bet", action: "call" });

    row1.append(foldBtn, callBtn);
    bar.appendChild(row1);

    // Raise options
    if (me.chips > callPay && maxAllowed > callPay) {
      const row2 = document.createElement("div");
      row2.className = "action-row cols-4";
      [1, 2, 3, 5].forEach((amt) => {
        const rb = document.createElement("button");
        rb.className = "act-btn act-raise";
        rb.textContent = `레이즈 +${amt}`;
        rb.onclick = () => sendAction({ type: "bet", action: "raise", amount: amt });
        row2.appendChild(rb);
      });
      bar.appendChild(row2);
    }
    return;
  }

  if (state.phase === "HIT_STAY") {
    const row = document.createElement("div");
    row.className = "action-row cols-2";
    const hitBtn = document.createElement("button");
    hitBtn.className = "act-btn act-hit";
    hitBtn.textContent = "HIT (+1장 공개)";
    hitBtn.onclick = () => sendAction({ type: "hit_stay", decision: "hit" });

    const stayBtn = document.createElement("button");
    stayBtn.className = "act-btn act-stay";
    stayBtn.textContent = "STAY (멈춤)";
    stayBtn.onclick = () => sendAction({ type: "hit_stay", decision: "stay" });

    row.append(hitBtn, stayBtn);
    bar.appendChild(row);
  }
}

function renderCounter() {
  if (!state) return;
  const grid = $("counter-grid");
  grid.innerHTML = "";
  ["7", "6", "5", "4", "3", "2", "1", "-1"].forEach((k) => {
    const total = TOTAL_DECK_COUNTS[k];
    const seen = state.visible_counts[k] || 0;
    const rem = Math.max(0, total - seen);
    const cell = document.createElement("div");
    cell.className = "cnt-cell";
    cell.innerHTML = `
      <div class="cnt-num ${k === "-1" ? "minus" : ""}">${k}</div>
      <div class="cnt-rem">남음 ${rem}/${total}</div>
    `;
    grid.appendChild(cell);
  });
}

// Event Listeners
$("btn-solo").onclick = () => createRoom("solo");
$("btn-create-multi").onclick = () => createRoom("multi");
$("btn-join").onclick = joinRoom;
$("btn-leave-lobby").onclick = leaveRoom;
$("btn-exit-game").onclick = leaveRoom;

$("btn-start-multi").onclick = () => {
  sendAction({ type: "start_multi", fill_ai: $("chk-fill-ai").checked });
};

$("btn-copy-link").onclick = () => {
  const url = `${location.origin}/?room=${state.room_id}`;
  navigator.clipboard?.writeText(url);
  $("btn-copy-link").textContent = "✅ 링크 복사됨!";
  setTimeout(() => ($("btn-copy-link").textContent = "🔗 초대 링크 복사"), 2000);
};

$("btn-counter").onclick = () => {
  renderCounter();
  $("modal-counter").classList.remove("hidden");
};
$("btn-rules").onclick = () => $("modal-rules").classList.remove("hidden");
$("btn-open-rules-home").onclick = () => $("modal-rules").classList.remove("hidden");

document.querySelectorAll(".close-modal, .modal-backdrop").forEach((el) => {
  el.addEventListener("click", () => {
    $("modal-counter").classList.add("hidden");
    $("modal-rules").classList.add("hidden");
  });
});

// Auto-reconnect on reload
if (roomId && playerId) {
  startPolling();
}

// ---------------------------------------------------------------------------
// Interactive Swipeable Rule & Simulation Guide
// ---------------------------------------------------------------------------
let guideIdx = 0;
const TOTAL_SLIDES = 6;
let autoSimTimer = null;

function setGuideSlide(idx) {
  guideIdx = Math.max(0, Math.min(TOTAL_SLIDES - 1, idx));
  $("guide-track").style.transform = `translateX(-${guideIdx * 100}%)`;
  const dots = $("guide-dots");
  dots.innerHTML = "";
  for (let i = 0; i < TOTAL_SLIDES; i++) {
    const d = document.createElement("span");
    d.className = "g-dot" + (i === guideIdx ? " active" : "");
    d.onclick = () => setGuideSlide(i);
    dots.appendChild(d);
  }
  $("btn-guide-prev").style.opacity = guideIdx === 0 ? "0.35" : "1";
  $("btn-guide-next").textContent = guideIdx === TOTAL_SLIDES - 1 ? "게임하기 ▶" : "다음 ▶";
}

$("btn-guide-prev").onclick = () => setGuideSlide(guideIdx - 1);
$("btn-guide-next").onclick = () => {
  if (guideIdx === TOTAL_SLIDES - 1) {
    $("modal-rules").classList.add("hidden");
  } else {
    setGuideSlide(guideIdx + 1);
  }
};

// Touch swipe support
let touchStartX = 0;
const viewport = $("guide-viewport");
viewport.addEventListener("touchstart", (e) => {
  touchStartX = e.touches[0].clientX;
}, { passive: true });
viewport.addEventListener("touchend", (e) => {
  const diff = e.changedTouches[0].clientX - touchStartX;
  if (diff < -42) setGuideSlide(guideIdx + 1);
  else if (diff > 42) setGuideSlide(guideIdx - 1);
});

// Slide 2: Dice & Flip
$("btn-sim-dice").onclick = () => {
  const el = $("sim-dice-val");
  el.classList.add("rolling");
  setTimeout(() => {
    el.textContent = Math.floor(Math.random() * 8) + 5;
    el.classList.remove("rolling");
  }, 350);
};
document.querySelectorAll("#sim-flip-row .flip-card").forEach((card) => {
  card.addEventListener("click", () => {
    document.querySelectorAll("#sim-flip-row .flip-card").forEach((c) => c.classList.remove("flipped"));
    card.classList.add("flipped");
  });
});

// Slide 4: Interactive HIT/STAY
let simCards = [5, 4, 2];
function renderSimHS() {
  const row = $("sim-hs-cards");
  row.innerHTML = "";
  let sum = 0;
  simCards.forEach((v) => {
    sum += v;
    const d = document.createElement("div");
    d.className = "sim-card" + (v < 0 ? " minus" : "");
    d.textContent = v;
    row.appendChild(d);
  });
  const sumEl = $("sim-hs-sum");
  sumEl.classList.remove("bust", "safe");
  if (sum > 10) {
    sumEl.classList.add("bust");
    sumEl.textContent = `합계: ${sum} (버스트)`;
  } else {
    sumEl.classList.add("safe");
    sumEl.textContent = `합계: ${sum} (${simCards.length}장 생존!)`;
  }
}
$("btn-sim-hit").onclick = () => {
  if (simCards.length === 3) {
    simCards.push(-1);
  } else if (simCards.length < 6) {
    simCards.push([1, 2, -1][Math.floor(Math.random() * 3)]);
  }
  renderSimHS();
};
$("btn-sim-stay").onclick = () => {
  const sum = simCards.reduce((a, b) => a + b, 0);
  $("sim-hs-sum").textContent = sum <= 10 ? `STAY 확정! (${sum}점, ${simCards.length}장)` : `버스트로 패배! (-1을 노려보세요)`;
};
$("btn-sim-hs-reset").onclick = () => {
  simCards = [5, 4, 2];
  renderSimHS();
};

// Slide 6: Auto Round Simulation
const AUTO_STEPS = [
  {
    phase: "공개 선택",
    pot: 4,
    log: "🎲 한계 숫자 [10] 결정! 각자 3장 중 1장을 공개합니다.",
    players: [
      { name: "나", info: "공개: 5", cls: "" },
      { name: "VIPER", info: "공개: 6", cls: "" },
      { name: "NOVA", info: "공개: 4", cls: "" },
      { name: "ORION", info: "공개: 7", cls: "" },
    ],
  },
  {
    phase: "1차 베팅",
    pot: 10,
    log: "💰 VIPER 레이즈! 전원 콜하여 팟이 10칩으로 불어났습니다.",
    players: [
      { name: "나", info: "콜 (+2)", cls: "" },
      { name: "VIPER", info: "레이즈 (+2)", cls: "" },
      { name: "NOVA", info: "콜 (+2)", cls: "" },
      { name: "ORION", info: "포기", cls: "bust" },
    ],
  },
  {
    phase: "HIT / STAY",
    pot: 10,
    log: "➕ 나: HIT으로 [-1] 획득! (5+4+2-1 = 10점 완성)",
    players: [
      { name: "나", info: "HIT [-1]", cls: "win" },
      { name: "VIPER", info: "STAY", cls: "" },
      { name: "NOVA", info: "HIT [+5] 💥", cls: "bust" },
      { name: "ORION", info: "포기", cls: "bust" },
    ],
  },
  {
    phase: "결과 정산",
    pot: 14,
    log: "🏆 나와 VIPER 모두 10점 동률 → 4장 보유한 나의 승리! (+14칩)",
    players: [
      { name: "나 🏆", info: "10점 (4장)", cls: "win" },
      { name: "VIPER", info: "10점 (3장)", cls: "" },
      { name: "NOVA", info: "버스트 (12)", cls: "bust" },
      { name: "ORION", info: "포기", cls: "bust" },
    ],
  },
];

function renderAutoStep(step) {
  $("auto-phase-badge").textContent = step.phase;
  $("auto-pot").textContent = step.pot;
  $("auto-log").textContent = step.log;
  const box = $("auto-players");
  box.innerHTML = "";
  step.players.forEach((p) => {
    const div = document.createElement("div");
    div.className = "auto-p " + p.cls;
    div.innerHTML = `<strong>${p.name}</strong><span>${p.info}</span>`;
    box.appendChild(div);
  });
}

$("btn-auto-sim").onclick = () => {
  if (autoSimTimer) clearInterval(autoSimTimer);
  let i = 0;
  renderAutoStep(AUTO_STEPS[0]);
  autoSimTimer = setInterval(() => {
    i++;
    if (i >= AUTO_STEPS.length) {
      clearInterval(autoSimTimer);
      autoSimTimer = null;
      return;
    }
    renderAutoStep(AUTO_STEPS[i]);
  }, 1600);
};

// Initialize guide when opening
const origOpenHome = $("btn-open-rules-home").onclick;
$("btn-open-rules-home").onclick = () => {
  setGuideSlide(0);
  renderAutoStep(AUTO_STEPS[0]);
  origOpenHome();
};
const origOpenGame = $("btn-rules").onclick;
$("btn-rules").onclick = () => {
  setGuideSlide(0);
  renderAutoStep(AUTO_STEPS[0]);
  origOpenGame();
};
