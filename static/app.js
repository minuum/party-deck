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
let pollInFlight = false;
let creating = false;
let selectedChips = 30;
let selectedAiCount = 4;
let roomId = sessionStorage.getItem("hs_room") || "";
let playerId = sessionStorage.getItem("hs_pid") || "";

const $ = (id) => document.getElementById(id);

function showScreen(name) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  $(`screen-${name}`).classList.add("active");
  const rcp = $("right-counter-panel");
  if (rcp) {
    rcp.classList.toggle("hidden", name !== "game");
    if (name !== "game") rcp.classList.remove("open");
  }
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
  showScreen("home");
}

// Chip selector
document.querySelectorAll(".seg-btn[data-chips]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".seg-btn[data-chips]").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    selectedChips = parseInt(btn.dataset.chips, 10);
  });
});

// AI count selector for Solo mode
document.querySelectorAll(".ai-seg").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".ai-seg").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    selectedAiCount = parseInt(btn.dataset.ai, 10);
    const lbl = $("solo-sub-label");
    if (lbl) lbl.textContent = `AI ${selectedAiCount}명과 즉시 대결 (총 ${selectedAiCount + 1}인)`;
  });
});

async function createRoom(mode) {
  if (creating) return;
  creating = true;
  const btn = mode === "solo" ? $("btn-solo") : $("btn-create-multi");
  if (btn) btn.disabled = true;
  try {
    const name = $("input-name").value.trim() || "플레이어";
    const res = await fetch("/api/create_room", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, mode, chips: selectedChips, ai_count: selectedAiCount }),
    });
    const data = await res.json().catch(() => ({ error: `서버 오류 (${res.status})` }));
    if (!res.ok || data.error) return showError(data.error || "방 생성 실패");
    roomId = data.room_id;
    playerId = data.player_id;
    sessionStorage.setItem("hs_room", roomId);
    sessionStorage.setItem("hs_pid", playerId);
    startPolling();
  } catch (_) {
    showError("네트워크 오류가 발생했습니다.");
  } finally {
    creating = false;
    if (btn) btn.disabled = false;
  }
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
  if (!roomId || !playerId || pollInFlight) return;
  pollInFlight = true;
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
  } catch (_) {
  } finally {
    pollInFlight = false;
  }
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
  if (typeof refreshResumeCard === "function") refreshResumeCard();
  showScreen("home");
}

function render() {
  if (!state) return;

  if (state.phase === "LOBBY") {
    showScreen("lobby");
    const isHost = state.viewer_id === state.host_id;
    const hostPlayer = state.players.find((p) => p.id === state.host_id);

    const roleBanner = $("lobby-role-banner");
    roleBanner.className = "role-banner " + (isHost ? "host" : "guest");
    roleBanner.textContent = isHost ? "👑 내가 방장입니다" : "🎟️ 초대받은 참가자";

    $("lobby-code").textContent = state.room_id;
    $("lobby-sub-msg").textContent = isHost
      ? "친구에게 아래 코드나 초대 링크를 보내서 초대하세요!"
      : `${hostPlayer ? hostPlayer.name : "방장"}님의 멀티플레이 방에 입장했습니다.`;
    $("lobby-count").textContent = state.players.length;

    const list = $("lobby-player-list");
    list.innerHTML = "";
    state.players.forEach((p) => {
      const li = document.createElement("li");
      const pIsHost = p.id === state.host_id;
      const pIsMe = p.id === state.viewer_id;
      if (pIsMe) li.classList.add("is-me");
      const roleCls = pIsHost ? "host" : (p.is_ai ? "ai" : "guest");
      const roleTxt = pIsHost ? "👑 방장" : (p.is_ai ? "🤖 AI" : "🎟️ 참가자");
      const kickHtml = isHost && p.is_ai ? `<button type="button" class="ai-kick-btn" data-aid="${p.id}">제거</button>` : "";
      li.innerHTML = `
        <div class="lobby-left">
          <span class="role-pill ${roleCls}">${roleTxt}</span>
          <span>${p.name}</span>
          ${pIsMe ? '<span class="role-pill me">나</span>' : ""}
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          <span class="muted">🪙 ${p.chips}칩</span>
          ${kickHtml}
        </div>
      `;
      list.appendChild(li);
    });
    list.querySelectorAll(".ai-kick-btn").forEach((btn) => {
      btn.onclick = () => sendAction({ type: "remove_ai", target_id: btn.dataset.aid });
    });

    // Empty slots up to 5
    for (let i = state.players.length; i < 5; i++) {
      const li = document.createElement("li");
      li.className = "empty-slot";
      li.innerHTML = `<span>빈 자리 #${i + 1}</span><span>초대 또는 AI 추가 가능</span>`;
      list.appendChild(li);
    }

    $("host-controls").classList.toggle("hidden", !isHost);
    $("guest-wait-msg").classList.toggle("hidden", isHost);
    if (!isHost && hostPlayer) {
      $("guest-host-name").textContent = `👑 ${hostPlayer.name}`;
    }

    if (isHost) {
      const hasAi = state.players.some((p) => p.is_ai);
      $("btn-add-ai").disabled = state.players.length >= 5;
      $("btn-remove-ai").disabled = !hasAi;
      const canStart = state.players.length >= 2;
      $("btn-start-multi").disabled = !canStart;
      $("host-start-hint").classList.toggle("hidden", canStart);
    }
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
  const isHost = state.viewer_id === state.host_id;
  if ($("btn-host-end")) {
    $("btn-host-end").classList.toggle("hidden", !isHost || state.phase === "GAME_OVER");
  }
  handleStateSounds(state, me);

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
    renderSmartCounter(me);
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

    // Raise options up to official cap (min active stack / max_round_bet)
    const maxRaise = Math.min(me.chips, maxAllowed) - callPay;
    if (maxRaise >= 1) {
      const presets = [1, 3, 5, 10].filter((v) => v < maxRaise);
      const row2 = document.createElement("div");
      row2.className = "action-row";
      row2.style.gridTemplateColumns = `repeat(${presets.length + 1}, 1fr)`;
      presets.forEach((amt) => {
        const rb = document.createElement("button");
        rb.className = "act-btn act-raise";
        rb.textContent = `+${amt}`;
        rb.onclick = () => sendAction({ type: "bet", action: "raise", amount: amt });
        row2.appendChild(rb);
      });
      const maxBtn = document.createElement("button");
      maxBtn.className = "act-btn act-allin";
      maxBtn.textContent = `최대 +${maxRaise}`;
      maxBtn.onclick = () => sendAction({ type: "bet", action: "raise", amount: maxRaise });
      row2.appendChild(maxBtn);
      bar.appendChild(row2);

      if (maxRaise > 1) {
        const sliderWrap = document.createElement("div");
        sliderWrap.className = "raise-slider-row";
        const initVal = Math.min(Math.max(1, Math.ceil(maxRaise / 2)), maxRaise);
        sliderWrap.innerHTML = `
          <input type="range" class="raise-range" min="1" max="${maxRaise}" value="${initVal}" />
          <button type="button" class="act-btn act-raise slider-go">레이즈 +${initVal}칩 (한도 ${maxRaise})</button>
        `;
        const rng = sliderWrap.querySelector("input");
        const go = sliderWrap.querySelector("button");
        rng.oninput = () => {
          go.textContent = `레이즈 +${rng.value}칩 (한도 ${maxRaise})`;
        };
        go.onclick = () => sendAction({ type: "bet", action: "raise", amount: parseInt(rng.value, 10) });
        bar.appendChild(sliderWrap);
      }
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

$("btn-add-ai").onclick = () => sendAction({ type: "add_ai" });
$("btn-remove-ai").onclick = () => sendAction({ type: "remove_ai" });
$("btn-start-multi").onclick = () => {
  sendAction({ type: "start_multi", fill_ai: false });
};

$("btn-copy-code").onclick = () => {
  navigator.clipboard?.writeText(state.room_id);
  $("btn-copy-code").textContent = "✅ 코드 복사됨!";
  setTimeout(() => ($("btn-copy-code").textContent = "📋 코드 복사"), 2000);
};

$("btn-copy-link").onclick = () => {
  const url = `${location.origin}/?room=${state.room_id}`;
  navigator.clipboard?.writeText(url);
  $("btn-copy-link").textContent = "✅ 링크 복사됨!";
  setTimeout(() => ($("btn-copy-link").textContent = "🔗 초대 링크 복사"), 2000);
};

$("btn-counter").onclick = () => {
  const me = state && state.players.find((p) => p.id === state.viewer_id);
  renderSmartCounter(me);
  const rcp = $("right-counter-panel");
  if (rcp) {
    rcp.classList.remove("hidden");
    rcp.classList.toggle("open");
  }
};
if ($("btn-right-counter-close")) {
  $("btn-right-counter-close").onclick = () => $("right-counter-panel").classList.remove("open");
}

function renderSmartCounter(me) {
  if (!state) return;
  const keys = ["7", "6", "5", "4", "3", "2", "1", "-1"];
  let unseenTotal = 0;
  const remMap = {};
  keys.forEach((k) => {
    const rem = Math.max(0, TOTAL_DECK_COUNTS[k] - (state.visible_counts[k] || 0));
    remMap[k] = rem;
    unseenTotal += rem;
  });

  if ($("rc-unseen-total")) $("rc-unseen-total").textContent = unseenTotal;

  // Render smart bars
  const grid = $("rc-grid");
  if (grid) {
    grid.innerHTML = "";
    keys.forEach((k) => {
      const total = TOTAL_DECK_COUNTS[k];
      const rem = remMap[k];
      const pct = unseenTotal > 0 ? Math.round((rem / unseenTotal) * 100) : 0;
      const barPct = Math.round((rem / total) * 100);
      const isMinus = k === "-1";
      const row = document.createElement("div");
      row.className = "rc-row";
      row.innerHTML = `
        <span class="rc-num ${isMinus ? "minus" : ""}">${k}</span>
        <div class="rc-bar"><div class="rc-bar-fill ${isMinus ? "minus" : ""}" style="width:${barPct}%"></div></div>
        <span class="rc-cnt">${rem}/${total}</span>
        <span class="rc-pct">${pct}%</span>
      `;
      grid.appendChild(row);
    });
  }

  // Compute HIT probabilities for `me`
  if (!me || me.hand_sum === null || unseenTotal === 0) return;
  const sum = me.hand_sum;
  const target = state.target;
  let safeCnt = 0;
  let exactCnt = 0;
  keys.forEach((k) => {
    const val = parseInt(k, 10);
    if (sum + val <= target) safeCnt += remMap[k];
    if (sum + val === target) exactCnt += remMap[k];
  });
  const safePct = Math.round((safeCnt / unseenTotal) * 100);
  const bustPct = 100 - safePct;
  const exactPct = Math.round((exactCnt / unseenTotal) * 100);
  const minusPct = Math.round((remMap["-1"] / unseenTotal) * 100);

  if ($("rc-safe-pct")) $("rc-safe-pct").textContent = `${safePct}%`;
  if ($("rc-bust-pct")) $("rc-bust-pct").textContent = `${bustPct}%`;
  if ($("rc-exact-pct")) $("rc-exact-pct").textContent = `${exactPct}%`;
  if ($("rc-minus-pct")) $("rc-minus-pct").textContent = `${minusPct}%`;

  const adv = $("rc-advice");
  if (adv) {
    if (sum > target) {
      adv.textContent =
        sum - target === 1
          ? `🔥 현재 버스트(${sum})! -1로 구조될 확률 ${minusPct}% — 도박 HIT 노려볼 만해요!`
          : `💀 현재 버스트(${sum})! 한계(${target})보다 ${sum - target} 초과 — 포기(Fold) 권장`;
    } else if (sum === target) {
      adv.textContent = `🏆 한계 숫자(${target}) 완벽 적중! STAY로 잠그고 레이즈를 고려하세요!`;
    } else if (safePct >= 65) {
      adv.textContent = `✅ HIT 유리! 생존 확률 ${safePct}% (한계 적중 ${exactPct}%)`;
    } else if (safePct >= 40) {
      adv.textContent = `⚖️ 반반 승부 (생존 ${safePct}% vs 버스트 ${bustPct}%) — 상대 패를 보고 결정하세요`;
    } else {
      adv.textContent = `✋ 버스트 위험 ${bustPct}%! 안전하게 STAY 권장`;
    }
  }
}
$("btn-rules").onclick = () => $("modal-rules").classList.remove("hidden");
$("btn-open-rules-home").onclick = () => $("modal-rules").classList.remove("hidden");

document.querySelectorAll(".close-modal, .modal-backdrop").forEach((el) => {
  el.addEventListener("click", () => {
    $("modal-counter").classList.add("hidden");
    $("modal-rules").classList.add("hidden");
    if ($("modal-coming-soon")) $("modal-coming-soon").classList.add("hidden");
    if ($("modal-fl-rules")) $("modal-fl-rules").classList.add("hidden");
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

// ---------------------------------------------------------------------------
// Left Patch Notes & Live Health Status
// ---------------------------------------------------------------------------
$("btn-patch-toggle").onclick = () => $("patch-panel").classList.toggle("open");
$("btn-patch-close").onclick = () => $("patch-panel").classList.remove("open");

async function checkLiveStatus() {
  try {
    const res = await fetch("/api/health");
    const h = await res.json();
    const setBadge = (id, text, cls) => {
      const el = $(id);
      if (!el) return;
      el.textContent = text;
      el.className = "st-badge " + cls;
    };
    setBadge("st-server", h.ok ? "정상" : "오류", h.ok ? "ok" : "err");
    setBadge("st-gemini", h.gemini_ai ? "활성 (AI)" : "내장 폴백", h.gemini_ai ? "ok" : "warn");

    if (!h.redis) {
      setBadge("st-redis", "로컬 메모리", "warn");
      setBadge("st-solo", "정상", "ok");
      setBadge("st-multi", "로컬 전용", "warn");
    } else if (h.redis_ok && h.redis_write_ok) {
      setBadge("st-redis", "정상 (R/W)", "ok");
      setBadge("st-solo", "정상", "ok");
      setBadge("st-multi", "정상", "ok");
      $("st-redis-hint").classList.add("hidden");
    } else if (h.redis_detail === "READ_ONLY_TOKEN") {
      setBadge("st-redis", "읽기 전용!", "err");
      setBadge("st-solo", "쓰기 불가", "err");
      setBadge("st-multi", "쓰기 불가", "err");
      $("st-redis-hint").textContent = "⚠️ Upstash 읽기 전용 토큰이 설정되어 있습니다. Vercel 환경변수를 일반(Read/Write) 토큰으로 변경 후 Redeploy 해주세요.";
      $("st-redis-hint").classList.remove("hidden");
    } else {
      setBadge("st-redis", "연결 오류", "err");
      setBadge("st-solo", "점검 필요", "err");
      setBadge("st-multi", "점검 필요", "err");
      $("st-redis-hint").textContent = `⚠️ Redis 오류: ${h.redis_detail}`;
      $("st-redis-hint").classList.remove("hidden");
    }
  } catch (_) {
    const el = $("st-server");
    if (el) { el.textContent = "오프라인"; el.className = "st-badge err"; }
  }
}
checkLiveStatus();

// ---------------------------------------------------------------------------
// Procedural Web Audio SFX Engine (No external audio files needed)
// ---------------------------------------------------------------------------
let sfxEnabled = localStorage.getItem("hs_sfx") !== "off";
let audioCtx = null;

function ensureAudio() {
  if (!sfxEnabled) return null;
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) audioCtx = new Ctx();
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

window.addEventListener("pointerdown", () => ensureAudio(), { passive: true });

function playTone(freq, duration, type = "sine", vol = 0.14, delay = 0, endFreq = null) {
  const ctx = ensureAudio();
  if (!ctx) return;
  const now = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, now + duration);
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.linearRampToValueAtTime(vol, now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

const SFX = {
  myTurn: () => {
    playTone(587.33, 0.14, "triangle", 0.14, 0);
    playTone(880, 0.22, "triangle", 0.15, 0.1);
  },
  cardFlip: () => {
    playTone(420, 0.08, "triangle", 0.12, 0, 720);
  },
  minusCard: () => {
    playTone(300, 0.22, "sawtooth", 0.1, 0, 140);
  },
  chip: () => {
    playTone(2300, 0.06, "sine", 0.1, 0);
    playTone(3450, 0.05, "sine", 0.07, 0.015);
  },
  raise: () => {
    SFX.chip();
    playTone(2600, 0.07, "sine", 0.1, 0.09);
    playTone(3900, 0.08, "sine", 0.08, 0.11);
  },
  fold: () => {
    playTone(340, 0.18, "sine", 0.1, 0, 180);
  },
  stay: () => {
    playTone(523.25, 0.12, "sine", 0.12, 0);
    playTone(659.25, 0.12, "sine", 0.1, 0.07);
  },
  dice: () => {
    for (let i = 0; i < 4; i++) {
      playTone(260 + i * 90, 0.045, "square", 0.06, i * 0.06);
    }
  },
  win: () => {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => playTone(f, 0.24, "triangle", 0.14, i * 0.09));
  },
  bust: () => {
    playTone(220, 0.22, "sawtooth", 0.11, 0, 110);
    playTone(150, 0.28, "sawtooth", 0.11, 0.16, 85);
  },
  save: () => {
    playTone(660, 0.1, "sine", 0.12, 0);
    playTone(990, 0.16, "sine", 0.12, 0.08);
  },
};

function updateSfxBtn() {
  const b = $("btn-sfx");
  if (!b) return;
  b.textContent = sfxEnabled ? "🔊" : "🔇";
  b.classList.toggle("muted-sfx", !sfxEnabled);
}
updateSfxBtn();

if ($("btn-sfx")) {
  $("btn-sfx").onclick = () => {
    sfxEnabled = !sfxEnabled;
    localStorage.setItem("hs_sfx", sfxEnabled ? "on" : "off");
    updateSfxBtn();
    if (sfxEnabled) SFX.myTurn();
  };
}

let prevSoundKey = { round: 0, phase: "", myTurn: false, logLen: 0, lastLog: "" };
function handleStateSounds(st, me) {
  if (!st) return;
  const lastLog = st.logs && st.logs.length ? st.logs[st.logs.length - 1] : "";
  if (st.round_num !== prevSoundKey.round && st.round_num > 0) {
    SFX.dice();
  } else if (st.phase !== prevSoundKey.phase) {
    if (st.phase === "SHOWDOWN" || st.phase === "GAME_OVER") {
      const winners = (st.winner_info && st.winner_info.winners) || [];
      if (me && winners.includes(me.name)) SFX.win();
      else if (me && me.busted) SFX.bust();
      else SFX.chip();
    }
  } else if (lastLog && lastLog !== prevSoundKey.lastLog) {
    if (lastLog.includes("레이즈")) SFX.raise();
    else if (lastLog.includes("콜") || lastLog.includes("체크")) SFX.chip();
    else if (lastLog.includes("포기")) SFX.fold();
    else if (lastLog.includes("HIT!")) {
      if (lastLog.includes("[ -1 ]")) SFX.minusCard();
      else SFX.cardFlip();
    } else if (lastLog.includes("STAY")) SFX.stay();
  }

  const isMyTurnNow = Boolean(me && me.is_turn);
  if (isMyTurnNow && !prevSoundKey.myTurn) {
    SFX.myTurn();
  }

  prevSoundKey = {
    round: st.round_num,
    phase: st.phase,
    myTurn: isMyTurnNow,
    logLen: st.logs ? st.logs.length : 0,
    lastLog,
  };
}

// ---------------------------------------------------------------------------
// Toast + Save / Resume + Host End Game
// ---------------------------------------------------------------------------
function showToast(msg) {
  const old = document.querySelector(".toast-msg");
  if (old) old.remove();
  const div = document.createElement("div");
  div.className = "toast-msg";
  div.textContent = msg;
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 2600);
}

function refreshResumeCard() {
  const btn = $("btn-resume-saved");
  if (!btn) return;
  try {
    const saved = JSON.parse(localStorage.getItem("hs_saved_game") || "null");
    if (saved && saved.room_id && saved.player_id) {
      $("resume-meta").textContent = `방 코드 ${saved.room_id} · R${saved.round_num || 1} (${saved.name || "플레이어"})`;
      btn.classList.remove("hidden");
      btn.onclick = () => {
        roomId = saved.room_id;
        playerId = saved.player_id;
        sessionStorage.setItem("hs_room", roomId);
        sessionStorage.setItem("hs_pid", playerId);
        startPolling();
      };
      return;
    }
  } catch (_) {}
  btn.classList.add("hidden");
}
refreshResumeCard();

if ($("btn-save-game")) {
  $("btn-save-game").onclick = async () => {
    if (!state || !roomId || !playerId) return;
    await sendAction({ type: "save_game" });
    const me = state.players.find((p) => p.id === playerId);
    localStorage.setItem(
      "hs_saved_game",
      JSON.stringify({
        room_id: roomId,
        player_id: playerId,
        round_num: state.round_num,
        name: me ? me.name : "",
        saved_at: Date.now(),
      })
    );
    refreshResumeCard();
    SFX.save();
    showToast("💾 현재 게임이 저장되었습니다! (7일간 이어하기 가능)");
  };
}

if ($("btn-host-end")) {
  $("btn-host-end").onclick = async () => {
    if (!state || state.viewer_id !== state.host_id) return;
    if (!confirm("방장 권한으로 현재 게임을 즉시 종료하시겠습니까?\n현재 칩 1위가 우승자로 정산됩니다.")) return;
    await sendAction({ type: "end_game" });
    SFX.win();
    showToast("🏁 방장 권한으로 게임을 종료했습니다.");
  };
}

// ---------------------------------------------------------------------------
// Party Deck Main Game Hub Catalog
// ---------------------------------------------------------------------------
const GAME_CATALOG = [
  { id: "hit_stay", name: "HIT, STAY", cat: "main", catLabel: "메인매치", day: "6일차", progress: 100, playable: true, desc: "35장 숫자 카드와 8면체 주사위 한계 숫자로 승부하는 5인 생존 베팅 게임 (AI 1~4명 & 실시간 멀티플레이)" },
  { id: "choice", name: "양자택일", cat: "main", catLabel: "메인매치", day: "1일차", progress: 100, playable: true, desc: "1일차 메인매치 · 6라운드 공공의 이익 vs 개인의 이익 과반수 심리전 (7인전)" },
  { id: "mystery_exchange", name: "미스터리 거래소", cat: "main", catLabel: "메인매치", day: "2일차", progress: 100, playable: true, desc: "2일차 메인매치 · 7개 종목의 숨겨진 가격 패턴을 파악해 자산을 불리는 10라운드 주식 거래" },
  { id: "gem_market", name: "보석 암시장", cat: "main", catLabel: "메인매치", day: "3일차", progress: 100, playable: true, desc: "3일차 메인매치 · 보석/폭탄 교환 + 비공개 마니또 곱셈 점수로 승부하는 5라운드 심리전" },
  { id: "auction_bingo", name: "경매 빙고", cat: "main", catLabel: "메인매치", day: "4일차", progress: 100, playable: true, desc: "4일차 메인매치 · 칩 비공개 입찰로 5×5 빙고 숫자를 낙찰받아 3줄을 먼저 완성하는 경매 전략전" },
  { id: "hidden_word", name: "히든 워드", cat: "main", catLabel: "메인매치", day: "5일차", progress: 100, playable: true, desc: "5일차 메인매치 · 명사 5개 봉투 선택 + Gemini AI 유사도(%) 힌트(95%↑ 조기종료) 기반 한글 추리전" },

  { id: "heavy_13", name: "무거운 13", cat: "prison", catLabel: "감옥매치", day: "1일차", progress: 100, playable: true, desc: "1일차 감옥매치 · 바위 카드(0~6)와 3색+레인보우 칩으로 임계점 13을 피하는 14라운드 전략전" },
  { id: "russian_roulette", name: "러시안 룰렛", cat: "prison", catLabel: "감옥매치", day: "2일차", progress: 100, playable: true, desc: "2일차 감옥매치 · 16약실·2실탄! 크레딧으로 조사·총구 회전·약실 조작 후 격발 생존전" },
  { id: "piggy_bank", name: "돼지 저금통", cat: "prison", catLabel: "감옥매치", day: "3일차", progress: 100, playable: true, desc: "3일차 감옥매치 · 5개 저금통 속 흑/백 동전 개수를 암기하고 의심으로 5점을 선취하는 심리전" },
  { id: "wall_go_2", name: "벽바둑 2", cat: "prison", catLabel: "감옥매치", day: "4일차", progress: 100, playable: true, desc: "4일차 감옥매치 · 5×5 보드에서 말을 이동하고 벽을 세워 최대 영토를 차지하는 보드 전략전" },
  { id: "formula_tower", name: "수식의 탑", cat: "prison", catLabel: "감옥매치", day: "5일차", progress: 100, playable: true, desc: "5일차 감옥매치 · 4개 숫자 카드로 목표값에 가장 가까운 수식을 만들어 5층 탑을 쌓는 수리 대결" },
  { id: "gradation", name: "그라데이션", cat: "prison", catLabel: "감옥매치", day: "6일차", progress: 100, playable: true, desc: "6일차 감옥매치 · 검정-진회색-상아색-흰색 대칭 7개 통에 숫자(합≤30)를 오름차순 배치하는 1:1 블러핑 심리전" },

  { id: "card_janggi", name: "카드 장기", cat: "final", catLabel: "결승전", day: "1회전", progress: 100, playable: true, desc: "결승 1회전 · 4×4 전술 장기판에서 왕·차·마·졸을 지휘해 상대 왕(👑)을 포획하는 1:1 대결" },
  { id: "color_link", name: "컬러 링크", cat: "final", catLabel: "결승전", day: "2회전", progress: 100, playable: true, desc: "결승 2회전 · 5×5 보드에 내 색상을 배치해 6칸 최장 체인을 먼저 연결하는 전략 보드전" },
  { id: "formula_light", name: "수식 신호등", cat: "final", catLabel: "결승전", day: "3회전", progress: 100, playable: true, desc: "결승 3회전 · 9칸 등식(^ 제곱 포함)을 🟩🟨🟥 신호등 힌트로 먼저 맞히는 최종 추리전 (1:1 AI 대결 & 솔로)" },

  { id: "piece_puzzle", name: "피스 퍼즐", cat: "exile", catLabel: "유배지", day: "매치 01", progress: 0, playable: false, desc: "유배지 매치 01 · 도형 조각 맞추기 퍼즐" },
  { id: "spot_diff", name: "달라진 그림 찾기", cat: "exile", catLabel: "유배지", day: "매치 02", progress: 0, playable: false, desc: "유배지 매치 02 · 기억력과 관찰력 대결" },
  { id: "secret_code", name: "비밀 코드", cat: "exile", catLabel: "유배지", day: "매치 03", progress: 100, playable: true, desc: "유배지 매치 03 · 4자리 중복 없는 숫자 코드를 스트라이크/볼 판정으로 최속 해독하는 레이스" },
  { id: "fence_build", name: "울타리 치기", cat: "exile", catLabel: "유배지", day: "매치 04", progress: 0, playable: false, desc: "유배지 매치 04 · 선을 이어 영역을 가두는 보드 게임" },
  { id: "symmetry_puzzle", name: "대칭 퍼즐", cat: "exile", catLabel: "유배지", day: "매치 05", progress: 0, playable: false, desc: "유배지 매치 05 · 대칭 구조를 완성하는 공간 지각 퍼즐" },
  { id: "world_flags", name: "만국기", cat: "exile", catLabel: "유배지", day: "매치 06", progress: 0, playable: false, desc: "유배지 매치 06 · 깃발 패턴 기억 및 배열 대결" },
  { id: "count_squares", name: "네모 세기", cat: "exile", catLabel: "유배지", day: "매치 07", progress: 0, playable: false, desc: "유배지 매치 07 · 빠른 도형 카운팅 순발력 대결" },
  { id: "point_omok", name: "포인트 오목", cat: "exile", catLabel: "유배지", day: "최후대결", progress: 0, playable: false, desc: "유배지 최후의 대결 · 포인트 배팅 결합 오목" },
];

let currentHubCat = "all";

const GAME_VISUALS = {
  hit_stay: {
    accent: "#d4af37",
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="#f7df8c" stroke-width="1.8"><rect x="3" y="4" width="11" height="15" rx="2"/><rect x="10" y="6" width="11" height="15" rx="2" fill="#181214" stroke="#ff6b6b"/><path d="M13.5 13.5h4" stroke="#ff6b6b" stroke-width="2"/></svg>`,
  },
  formula_light: {
    accent: "#2ecc71",
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.7"><rect x="7" y="2" width="10" height="20" rx="3" fill="#141820" stroke="#5ee695"/><circle cx="12" cy="7" r="2" fill="#ff6b6b" stroke="none"/><circle cx="12" cy="12" r="2" fill="#f7df8c" stroke="none"/><circle cx="12" cy="17" r="2" fill="#2ecc71" stroke="none"/></svg>`,
  },
  choice: {
    accent: "#4dabf7",
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="#4dabf7" stroke-width="1.8"><path d="M12 4v16M5 20h14M4 8l8-2 8 2"/><path d="M4 8l-1.5 5h3L4 8zm16 0l-1.5 5h3L20 8z" stroke="#ff6b6b"/></svg>`,
  },
  heavy_13: {
    accent: "#ff922b",
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="#ff922b" stroke-width="1.8"><path d="M4 19h16M6 15h12l-1-4H7l-1 4zm2-4h8l-1-4H9l-1 4z"/><text x="12" y="14.5" text-anchor="middle" font-size="6.5" font-weight="900" fill="#fff" stroke="none">13</text></svg>`,
  },
  mystery_exchange: {
    accent: "#20c997",
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="#20c997" stroke-width="1.9"><path d="M3 18l5-6 4 3 6-8 3 2"/><path d="M18 7h3v3"/></svg>`,
  },
  russian_roulette: {
    accent: "#ff5c5c",
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="#ff6b6b" stroke-width="1.7"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="7" r="1.7" fill="#ff6b6b"/><circle cx="16.3" cy="9.5" r="1.5"/><circle cx="16.3" cy="14.5" r="1.5"/><circle cx="12" cy="17" r="1.7" fill="#ff6b6b"/><circle cx="7.7" cy="14.5" r="1.5"/><circle cx="7.7" cy="9.5" r="1.5"/></svg>`,
  },
  gem_market: {
    accent: "#cc5de8",
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="#da77f2" stroke-width="1.8"><polygon points="6,4 18,4 22,10 12,21 2,10"/><path d="M2 10h20M12 21L8 10l4-6 4 6-4 11z"/></svg>`,
  },
  piggy_bank: {
    accent: "#f06595",
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="#f783ac" stroke-width="1.8"><rect x="4" y="7" width="16" height="11" rx="5"/><circle cx="9.5" cy="12" r="1.5" fill="#fff" stroke="none"/><circle cx="14.5" cy="12" r="1.5" fill="#333" stroke="#fff"/><path d="M10 4h4" stroke-width="2"/></svg>`,
  },
  auction_bingo: {
    accent: "#3bc9db",
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="#3bc9db" stroke-width="1.7"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/><circle cx="6" cy="6" r="1.6" fill="#f7df8c" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="#f7df8c" stroke="none"/><circle cx="18" cy="18" r="1.6" fill="#f7df8c" stroke="none"/></svg>`,
  },
  wall_go_2: {
    accent: "#748ffc",
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="#748ffc" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 3v10M3 13h10" stroke="#ff6b6b" stroke-width="2.6"/><circle cx="7.5" cy="8" r="2.2" fill="#748ffc"/><circle cx="16.5" cy="17" r="2.2" fill="#5ee695"/></svg>`,
  },
  hidden_word: {
    accent: "#b197fc",
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="#b197fc" stroke-width="1.8"><rect x="3" y="7" width="5" height="10" rx="1.5" fill="rgba(46,204,113,0.3)" stroke="#5ee695"/><rect x="9.5" y="7" width="5" height="10" rx="1.5" fill="rgba(241,196,15,0.3)" stroke="#f7df8c"/><rect x="16" y="7" width="5" height="10" rx="1.5"/><text x="12" y="14.5" text-anchor="middle" font-size="7" font-weight="900" fill="#fff" stroke="none">W</text></svg>`,
  },
  formula_tower: {
    accent: "#fab005",
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="#fab005" stroke-width="1.8"><rect x="4" y="16" width="16" height="4" rx="1"/><rect x="6" y="11" width="12" height="4" rx="1"/><rect x="8" y="6" width="8" height="4" rx="1"/><path d="M12 2v4" stroke="#5ee695" stroke-width="2"/></svg>`,
  },
  gradation: {
    accent: "#dcd6c8",
    svg: `<svg viewBox="0 0 24 24" fill="none"><rect x="2" y="5" width="2.6" height="14" rx="1" fill="#181a20" stroke="#666" stroke-width="0.6"/><rect x="5.2" y="5" width="2.6" height="14" rx="1" fill="#4f5460"/><rect x="8.4" y="5" width="2.6" height="14" rx="1" fill="#cfc9bc"/><rect x="11.6" y="5" width="2.6" height="14" rx="1" fill="#ffffff"/><rect x="14.8" y="5" width="2.6" height="14" rx="1" fill="#cfc9bc"/><rect x="18" y="5" width="2.6" height="14" rx="1" fill="#4f5460"/><rect x="21.2" y="5" width="1.8" height="14" rx="1" fill="#181a20" stroke="#666" stroke-width="0.6"/></svg>`,
  },
  card_janggi: {
    accent: "#fcc419",
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="#fcc419" stroke-width="1.8"><path d="M5 17h14l1-9-4 3-4-5-4 5-4-3 1 9z"/><path d="M5 20h14" stroke="#ff6b6b" stroke-width="2"/></svg>`,
  },
  color_link: {
    accent: "#38d9a9",
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="#38d9a9" stroke-width="2"><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3" stroke="#f783ac"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="18" r="3"/><path d="M6 9v6M9 18h6"/></svg>`,
  },
  secret_code: {
    accent: "#51cf66",
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="#51cf66" stroke-width="1.8"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><circle cx="12" cy="15" r="1.5" fill="#51cf66"/></svg>`,
  },
};

function renderHub() {
  const grid = $("hub-games-grid");
  if (!grid) return;
  const playableCnt = GAME_CATALOG.filter((g) => g.playable).length;
  $("hub-progress-text").textContent = `${playableCnt} / ${GAME_CATALOG.length} 구현 완료`;
  $("hub-progress-fill").style.width = `${Math.max(5, Math.round((playableCnt / GAME_CATALOG.length) * 100))}%`;

  const filtered = GAME_CATALOG.filter((g) => {
    if (currentHubCat === "all") return true;
    if (currentHubCat === "playable") return g.playable;
    return g.cat === currentHubCat;
  }).sort((a, b) => (b.playable ? 1 : 0) - (a.playable ? 1 : 0));

  grid.innerHTML = "";
  filtered.forEach((g) => {
    const vis = GAME_VISUALS[g.id];
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "game-tile" + (g.playable ? " playable" : "") + (g.id === "hit_stay" ? " featured-hero" : "");
    if (vis) btn.style.setProperty("--tile-accent", vis.accent);

    const iconHtml = vis ? `<div class="tile-icon-box">${vis.svg}</div>` : "";
    btn.innerHTML = `
      <div class="tile-top">
        <span class="tile-tag">${g.catLabel} · ${g.day}</span>
        <span class="st-badge ${g.playable ? "ok" : "warn"}">${g.playable ? "멀티 ▶" : `${g.progress}%`}</span>
      </div>
      <div class="tile-head-row">
        ${iconHtml}
        <div class="tile-title">${g.name}</div>
      </div>
      <div class="tile-desc">${g.desc}</div>
      <div class="tile-bar"><div class="tile-bar-fill" style="width:${g.progress}%;background:${vis ? vis.accent : "var(--green)"}"></div></div>
    `;
    btn.onclick = () => {
      if (g.playable && g.id === "hit_stay") {
        showScreen("home");
      } else if (g.playable && g.id === "formula_light") {
        startFormulaLightGame("duel");
      } else if (g.playable && typeof openMpGameEntry === "function") {
        openMpGameEntry(g.id, g.name, g.catLabel + " · " + g.day, g.desc);
      } else {
        $("cs-title").textContent = g.name;
        $("cs-cat").textContent = g.catLabel;
        $("cs-day").textContent = g.day;
        $("cs-status").textContent = `구현 예정 (${g.progress}%)`;
        $("cs-desc").textContent = g.desc;
        $("modal-coming-soon").classList.remove("hidden");
      }
    };
    grid.appendChild(btn);
  });
}

document.querySelectorAll("#hub-tabs .hub-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll("#hub-tabs .hub-tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    currentHubCat = tab.dataset.cat;
    renderHub();
  });
});

if ($("btn-back-hub")) {
  $("btn-back-hub").onclick = () => showScreen("hub");
}

renderHub();
