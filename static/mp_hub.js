// ===========================================================================
// Unified Multiplayer Client for All Party Deck Games (Day 1 ~ Day 3+)
// ===========================================================================
let mpGameType = "";
let mpRoomId = "";
let mpPlayerId = "";
let mpData = null;
let mpPollTimer = null;
let mpPollBusy = false;
let mpLastSig = "";
let mpFbSource = null;
let mpFbReady = false;
let mpFbConnected = false;

// Local UI selection state per game
let mpSel = {
  h13Card: null, h13Chip: null, h13Rb: "red",
  rrSlot: 0, gmCard: null, gmTarget: null,
  pbCol: "black", pbCnt: 2, pbTarget: null,
  abBid: 3, wgR: null, wgC: null, wgWall: "N",
  exRuleMode: "classic",
  aiLevel: "normal",
  grCard: null,
  cjPiece: null,
};

const AI_TIER_LABELS = { easy: "🌱쉬움", normal: "⚖️보통", pro: "🔥고수", devil: "😈악마" };
const AI_TIER_ORDER = ["easy", "normal", "pro", "devil"];

function mpStopPoll() {
  if (mpPollTimer) { clearTimeout(mpPollTimer); mpPollTimer = null; }
}

function mpDisconnectFb() {
  if (mpFbSource) {
    try { mpFbSource.close(); } catch (_) {}
    mpFbSource = null;
  }
  mpFbConnected = false;
  mpFbReady = false;
}

function mpConnectFb() {
  mpDisconnectFb();
  if (!window.PD_FIREBASE_URL || !mpRoomId || document.hidden || (mpData && mpData.solo_mode)) return;
  try {
    mpFbReady = false;
    mpFbSource = new EventSource(`${window.PD_FIREBASE_URL}/signals/mp_${mpRoomId.toUpperCase()}.json`);
    const onSig = () => {
      mpFbConnected = true;
      if (!mpFbReady) { mpFbReady = true; mpSchedulePoll(); return; }
      if (!mpPollBusy) {
        mpPollBusy = true;
        fetch(`/api/mp/${mpRoomId}?player_id=${encodeURIComponent(mpPlayerId)}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((out) => { if (out && out.data) mpApply(out.data, false); })
          .catch(() => {})
          .finally(() => { mpPollBusy = false; });
      }
    };
    mpFbSource.addEventListener("put", onSig);
    mpFbSource.addEventListener("patch", onSig);
    mpFbSource.onerror = () => {
      mpFbConnected = false;
      mpSchedulePoll();
    };
  } catch (_) {
    mpFbConnected = false;
  }
}

function mpExitToHub() {
  mpStopPoll();
  mpDisconnectFb();
  sessionStorage.removeItem("mp_in_game");
  showScreen("hub");
}

function mpSaveSession(rid, pid, gt, name) {
  localStorage.setItem("mp_active_room", JSON.stringify({ roomId: rid, playerId: pid, gameType: gt, name, savedAt: Date.now() }));
  sessionStorage.setItem("mp_in_game", "1");
}

function openMpGameEntry(gameType, title, dayLabel, desc) {
  mpStopPoll();
  mpGameType = gameType;
  mpRoomId = "";
  mpPlayerId = "";
  mpData = null;
  mpLastSig = "";
  $("mp-nav-tag").textContent = title;
  $("screen-mp").setAttribute("data-theme", gameType || "");
  $("mp-entry-day").textContent = dayLabel;
  $("mp-entry-title").textContent = title;
  $("mp-entry-desc").textContent = desc;
  const globalNick = $("input-name") && $("input-name").value.trim();
  if (globalNick && $("mp-nick")) $("mp-nick").value = globalNick;

  $("mp-entry-view").classList.remove("hidden");
  $("mp-lobby-view").classList.add("hidden");
  $("mp-play-view").classList.add("hidden");
  $("btn-mp-save").classList.add("hidden");
  $("btn-mp-end").classList.add("hidden");
  if ($("mp-ex-mode-row")) {
    $("mp-ex-mode-row").classList.toggle("hidden", gameType !== "mystery_exchange");
  }

  // Show resume button if saved room matches or exists
  const resBtn = $("btn-mp-resume");
  try {
    const saved = JSON.parse(localStorage.getItem("mp_active_room") || "null");
    if (saved && saved.roomId && saved.playerId && (!gameType || saved.gameType === gameType)) {
      $("mp-resume-meta").textContent = `방 코드 ${saved.roomId} (${saved.name || "플레이어"})`;
      resBtn.classList.remove("hidden");
      resBtn.onclick = () => mpReconnect(saved);
    } else {
      resBtn.classList.add("hidden");
    }
  } catch (_) { resBtn.classList.add("hidden"); }

  showScreen("mp");
}

function mpShowErr(msg) {
  const el = $("mp-entry-err");
  el.textContent = msg;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 3200);
}

async function mpCreate(mode) {
  const name = ($("mp-nick").value || "방장").trim();
  try {
    const res = await fetch("/api/mp/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ game_type: mpGameType, name, mode, rule_mode: mpSel.exRuleMode, ai_level: mpSel.aiLevel }),
    });
    const out = await res.json();
    if (!res.ok || out.error) return mpShowErr(out.error || "방 생성 실패");
    mpRoomId = out.room_id;
    mpPlayerId = out.player_id;
    mpSaveSession(mpRoomId, mpPlayerId, out.data.game_type, name);
    mpApply(out.data, true);
    mpStartPoll();
  } catch (_) { mpShowErr("네트워크 오류"); }
}

async function mpJoin() {
  const name = ($("mp-nick").value || "참가자").trim();
  const code = ($("mp-code-in").value || "").trim().toUpperCase();
  if (code.length < 4) return mpShowErr("4자리 방 코드를 입력하세요.");
  try {
    const res = await fetch("/api/mp/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room_id: code, name }),
    });
    const out = await res.json();
    if (!res.ok || out.error) return mpShowErr(out.error || "입장 실패");
    mpRoomId = out.room_id;
    mpPlayerId = out.player_id;
    mpGameType = out.data.game_type;
    mpSaveSession(mpRoomId, mpPlayerId, mpGameType, name);
    mpApply(out.data, true);
    mpStartPoll();
  } catch (_) { mpShowErr("네트워크 오류"); }
}

async function mpReconnect(saved) {
  mpRoomId = saved.roomId;
  mpPlayerId = saved.playerId;
  mpGameType = saved.gameType || "";
  showScreen("mp");
  try {
    const res = await fetch(`/api/mp/${mpRoomId}?player_id=${encodeURIComponent(mpPlayerId)}`);
    if (!res.ok) {
      localStorage.removeItem("mp_active_room");
      return mpShowErr("만료된 방입니다.");
    }
    const out = await res.json();
    if (out.data) {
      sessionStorage.setItem("mp_in_game", "1");
      mpApply(out.data, true);
      mpStartPoll();
    }
  } catch (_) { mpShowErr("재연결 실패"); }
}

async function mpSend(payload) {
  if (!mpRoomId || !mpPlayerId) return;
  try {
    const res = await fetch(`/api/mp/${mpRoomId}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, player_id: mpPlayerId }),
    });
    const out = await res.json();
    if (out.error && typeof showToast === "function") showToast("⚠️ " + out.error);
    if (out.data) mpApply(out.data, true);
  } catch (_) {}
}

function mpGetPollInterval() {
  if (document.hidden || !mpRoomId || !mpPlayerId) return null;
  if (!mpData) return 700;
  if (mpData.ai_pending) return 600;
  if (mpData.solo_mode) return null; // 1인 AI 대전: 내 차례/종료 시 폴링 완전 정지 (0 req/s)
  if (mpFbConnected) return 15000; // Firebase SSE 연결 중: 15초 백업 폴링
  if (mpData.phase === "LOBBY" || mpData.phase === "DONE") return 2500;
  const me = (mpData.players || []).find((p) => p.id === mpData.viewer_id);
  if (me) {
    // 내 차례인 턴제 또는 내가 아직 제출 전(고민 중) -> 느리게(3.5~3.8초) 절전
    if (me.is_turn === true) return 3500;
    if (me.submitted === false || me.ready === false) return 3800;
  }
  // 상대 차례 / 제출 후 다른 사람 대기 중 -> 빠르게(1.4초) 실시간 반영
  return 1400;
}

function mpSchedulePoll() {
  mpStopPoll();
  const ms = mpGetPollInterval();
  if (ms === null) return;
  mpPollTimer = setTimeout(async () => {
    mpPollTimer = null;
    if (document.hidden || !mpRoomId || !mpPlayerId) return;
    if (!mpPollBusy) {
      mpPollBusy = true;
      try {
        const res = await fetch(`/api/mp/${mpRoomId}?player_id=${encodeURIComponent(mpPlayerId)}`);
        if (res.ok) {
          const out = await res.json();
          if (out.data) mpApply(out.data, false);
        }
      } catch (_) {} finally { mpPollBusy = false; }
    }
    mpSchedulePoll();
  }, ms);
}

function mpStartPoll() {
  mpConnectFb();
  mpSchedulePoll();
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    mpStopPoll();
    mpDisconnectFb();
  } else if (mpRoomId && mpPlayerId) {
    mpConnectFb();
    // 복귀 시 즉시 1회 동기화 후 적응형 폴링 재개
    if (!mpPollBusy) {
      mpPollBusy = true;
      fetch(`/api/mp/${mpRoomId}?player_id=${encodeURIComponent(mpPlayerId)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((out) => { if (out && out.data) mpApply(out.data, false); })
        .catch(() => {})
        .finally(() => { mpPollBusy = false; mpSchedulePoll(); });
    }
  }
});

function mpApply(d, force = false) {
  const sig = JSON.stringify(d);
  mpData = d;
  mpGameType = d.game_type;
  mpSchedulePoll();
  if (!force && sig === mpLastSig) return;
  const prevPhase = mpData ? mpData.phase : "";
  const prevRound = mpData ? mpData.round : 0;
  mpLastSig = sig;

  if (typeof SFX !== "undefined") {
    if (d.phase === "DONE" && prevPhase !== "DONE") SFX.win();
    else if (d.round !== prevRound && d.phase === "PLAYING") SFX.cardFlip();
  }
  renderMp();
}

function renderMp() {
  if (!mpData) return;
  const d = mpData;
  const isHost = d.viewer_id === d.host_id;
  $("screen-mp").setAttribute("data-theme", d.game_type || "");
  $("mp-nav-tag").textContent = `${d.meta.title} · ${d.room_id}`;
  $("btn-mp-save").classList.remove("hidden");
  $("btn-mp-end").classList.toggle("hidden", !(isHost && d.phase === "PLAYING"));

  $("mp-entry-view").classList.add("hidden");
  $("mp-lobby-view").classList.toggle("hidden", d.phase !== "LOBBY");
  $("mp-play-view").classList.toggle("hidden", d.phase === "LOBBY");

  if (d.phase === "LOBBY") {
    const rb = $("mp-role-banner");
    rb.className = "role-banner " + (isHost ? "host" : "guest");
    rb.textContent = isHost ? "👑 내가 방장입니다" : "🎟️ 초대받은 참가자";
    $("mp-lobby-code").textContent = d.room_id;
    $("mp-lobby-cnt").textContent = d.players.length;
    $("mp-lobby-max").textContent = d.meta.max_players;
    const ul = $("mp-lobby-list");
    ul.innerHTML = "";
    d.players.forEach((p) => {
      const li = document.createElement("li");
      if (p.id === d.viewer_id) li.classList.add("is-me");
      const rCls = p.is_host ? "host" : (p.is_ai ? "ai" : "guest");
      const rTxt = p.is_host ? "👑 방장" : (p.is_ai ? "🤖 AI" : "🎟️ 참가자");
      const lvl = p.ai_level || "normal";
      const nextLvl = AI_TIER_ORDER[(AI_TIER_ORDER.indexOf(lvl) + 1) % AI_TIER_ORDER.length];
      const tierBtn = p.is_ai
        ? (isHost
            ? `<button type="button" class="ai-tier-btn ${lvl}" title="클릭해 AI 난이도 변경" onclick="mpSend({action:'set_ai_level',target_id:'${p.id}',ai_level:'${nextLvl}'})">${AI_TIER_LABELS[lvl]}</button>`
            : `<span class="ai-tier-btn ${lvl}">${AI_TIER_LABELS[lvl]}</span>`)
        : "";
      const kick = isHost && p.is_ai ? `<button type="button" class="ai-kick-btn" onclick="mpSend({action:'remove_ai',target_id:'${p.id}'})">제거</button>` : "";
      li.innerHTML = `<div class="lobby-left"><span class="role-pill ${rCls}">${rTxt}</span><span>${p.name}</span>${p.id === d.viewer_id ? '<span class="role-pill me">나</span>' : ""}</div><div style="display:flex;align-items:center;gap:5px;">${tierBtn}${kick}</div>`;
      ul.appendChild(li);
    });
    $("mp-host-bar").classList.toggle("hidden", !isHost);
    $("mp-guest-bar").classList.toggle("hidden", isHost);
    if (isHost) {
      $("btn-mp-add-ai").disabled = d.players.length >= d.meta.max_players;
      $("btn-mp-rem-ai").disabled = !d.players.some((p) => p.is_ai);
      $("btn-mp-start").disabled = d.players.length < d.meta.min_players;
    }
    return;
  }

  // PLAYING or DONE
  $("mp-banner").textContent = d.banner || "";
  $("mp-log").textContent = d.log || "";
  const me = d.players.find((p) => p.id === d.viewer_id);
  const board = $("mp-board");
  const ctrl = $("mp-controls");
  board.innerHTML = "";
  ctrl.innerHTML = "";

  if (d.game_type === "choice") renderMpChoice(d, me, board, ctrl, isHost);
  else if (d.game_type === "heavy_13") renderMpHeavy13(d, me, board, ctrl, isHost);
  else if (d.game_type === "mystery_exchange") renderMpExchange(d, me, board, ctrl, isHost);
  else if (d.game_type === "russian_roulette") renderMpRoulette(d, me, board, ctrl, isHost);
  else if (d.game_type === "gem_market") renderMpGemMarket(d, me, board, ctrl, isHost);
  else if (d.game_type === "piggy_bank") renderMpPiggyBank(d, me, board, ctrl, isHost);
  else if (d.game_type === "auction_bingo") renderMpAuctionBingo(d, me, board, ctrl, isHost);
  else if (d.game_type === "wall_go_2") renderMpWallGo(d, me, board, ctrl, isHost);
  else if (d.game_type === "hidden_word") renderMpHiddenWord(d, me, board, ctrl, isHost);
  else if (d.game_type === "formula_tower") renderMpFormulaTower(d, me, board, ctrl, isHost);
  else if (d.game_type === "gradation") renderMpGradation(d, me, board, ctrl, isHost);
  else if (d.game_type === "card_janggi") renderMpCardJanggi(d, me, board, ctrl, isHost);
  else if (d.game_type === "color_link") renderMpColorLink(d, me, board, ctrl, isHost);
  else if (d.game_type === "secret_code") renderMpSecretCode(d, me, board, ctrl, isHost);
}

function mpDoneFooter(ctrl, isHost) {
  ctrl.innerHTML = `
    <div class="action-row cols-2">
      ${isHost ? `<button type="button" class="btn btn-gold" onclick="mpSend({action:'restart'})">🔄 다시 하기</button>` : `<div class="wait-pill">방장이 재시작할 수 있습니다</div>`}
      <button type="button" class="btn btn-outline" onclick="mpExitToHub()">게임 목록</button>
    </div>
  `;
}

// --- 1. 양자택일 (with Live Majority Tug-of-War Meter) ---
function renderMpChoice(d, me, board, ctrl, isHost) {
  $("mp-hud-round").textContent = `R${d.round} / ${d.state.max_rounds}`;
  $("mp-hud-mid").textContent = `공동상금 ${(d.state.prize * 0.5).toFixed(1)}억`;
  $("mp-hud-right").textContent = `내 점수 ${me.score}`;
  const need = Math.floor(d.players.length / 2) + 1;
  const pubLast = d.players.filter((p) => p.last === "🤝공공").length;
  const pubPct = Math.round((pubLast / Math.max(1, d.players.length)) * 100);
  const sorted = [...d.players].sort((a, b) => b.score - a.score);
  board.innerHTML = `
    <div class="choice-meter">
      <div style="display:flex;justify-content:space-between;font-size:11px;font-weight:800;">
        <span style="color:#4dabf7;">🤝 공공의 이익 (과반 ${need}명)</span>
        <span style="color:#ff6b6b;">😈 개인의 이익</span>
      </div>
      <div class="choice-meter-bar"><div class="choice-meter-pub" style="width:${pubLast ? pubPct : 50}%"></div></div>
    </div>
    <div class="d1-score-grid">${sorted.map((p, i) => `
    <div class="d1-pcell ${p.id === d.viewer_id ? "me" : ""}">
      <span>${i + 1}위 ${p.name} <small>${p.submitted ? "✅" : p.last}</small></span>
      <strong>${p.score}점</strong>
    </div>`).join("")}</div>`;
  if (d.phase === "DONE") return mpDoneFooter(ctrl, isHost);
  if (me.submitted) {
    ctrl.innerHTML = `<div class="wait-pill">⏳ 선택 완료! 다른 플레이어를 기다리는 중...</div>`;
  } else {
    ctrl.innerHTML = `<div class="action-row cols-2">
      <button type="button" class="act-btn act-hit" onclick="mpSend({pick:'public'})">🤝 공공의 이익</button>
      <button type="button" class="act-btn act-fold" onclick="mpSend({pick:'private'})">😈 개인의 이익</button>
    </div>`;
  }
}

// --- 2. 무거운 13 (with Danger Weight Gauge Bars) ---
function renderMpHeavy13(d, me, board, ctrl, isHost) {
  $("mp-hud-round").textContent = `R${d.round} / 14`;
  $("mp-hud-mid").textContent = d.round <= 7 ? "세트1" : "세트2";
  $("mp-hud-right").textContent = `벌점 ${me.penalty}`;
  const peds = d.state.pedestals;
  board.innerHTML = `
    <div class="h13-pedestals">
      ${[["red", "🔴 빨강"], ["green", "🟢 초록"], ["blue", "🔵 파랑"]].map(([k, l]) => {
        const s = peds[k].sum;
        const pct = Math.min(100, Math.round((s / 13) * 100));
        const lvl = s >= 11 ? "danger" : s >= 8 ? "warn" : "";
        return `<div class="ped-box ${k}"><span class="ped-name">${l}</span><span class="ped-sum">${s}</span><span class="ped-cnt">${peds[k].count}장 / 13</span><div class="ped-meter"><div class="ped-meter-fill ${lvl}" style="width:${pct}%"></div></div></div>`;
      }).join("")}
    </div>
    <div class="d1-score-grid">
      ${d.players.map((p) => `<div class="d1-pcell ${p.id === d.viewer_id ? "me" : ""}"><span>${p.name} <small>${p.submitted ? "✅" : p.last}</small></span><strong style="color:#ff8a8a;">벌점 ${p.penalty}</strong></div>`).join("")}
    </div>`;
  if (d.phase === "DONE") return mpDoneFooter(ctrl, isHost);
  if (me.submitted) {
    ctrl.innerHTML = `<div class="wait-pill">⏳ 제출 완료! 다른 플레이어 대기 중...</div>`;
    return;
  }
  ctrl.innerHTML = `
    <div class="h13-row">${[0, 1, 2, 3, 4, 5, 6].map((v) => `<button type="button" class="h13-btn ${mpSel.h13Card === v ? "selected" : ""}" ${!me.cards.includes(v) ? "disabled" : ""} onclick="mpSel.h13Card=${v};renderMp()">${v}</button>`).join("")}</div>
    <div class="h13-row">${[["red", "🔴"], ["green", "🟢"], ["blue", "🔵"], ["rainbow", "🌈"]].map(([k, l]) => `<button type="button" class="h13-chip ${mpSel.h13Chip === k ? "selected" : ""}" ${(me.chips[k] || 0) <= 0 ? "disabled" : ""} onclick="mpSel.h13Chip='${k}';renderMp()">${l}(${me.chips[k] || 0})</button>`).join("")}</div>
    ${mpSel.h13Chip === "rainbow" ? `<div class="h13-row">${[["red", "🔴빨강"], ["green", "🟢초록"], ["blue", "🔵파랑"]].map(([k, l]) => `<button type="button" class="rb-target ${mpSel.h13Rb === k ? "active" : ""}" onclick="mpSel.h13Rb='${k}';renderMp()">${l}</button>`).join("")}</div>` : ""}
    <button type="button" class="btn btn-gold" style="padding:10px;" ${mpSel.h13Card === null || !mpSel.h13Chip ? "disabled" : ""} onclick="mpSend({card:mpSel.h13Card,chip:mpSel.h13Chip,rb_color:mpSel.h13Rb});mpSel.h13Card=null;mpSel.h13Chip=null;">🪨 동시 제출</button>`;
}

// --- 3. 미스터리 거래소 (Real History Line Chart + Redacted Secret Rules Revealed 1/Round) ---
function buildHistorySvg(hist, strokeCol) {
  const arr = (hist && hist.length >= 2) ? hist : [10000, 10000];
  const mn = Math.min(...arr) * 0.95;
  const mx = Math.max(...arr) * 1.05;
  const span = Math.max(1, mx - mn);
  const pts = arr.map((v, i) => {
    const x = 2 + (i / (arr.length - 1)) * 68;
    const y = 24 - ((v - mn) / span) * 20;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return `<svg class="stock-spark" style="width:72px;height:26px;" viewBox="0 0 72 26"><polyline fill="none" stroke="${strokeCol}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" points="${pts}"/></svg>`;
}

function renderMpExchange(d, me, board, ctrl, isHost) {
  const modeTag = d.state.rule_mode === "shuffle" ? "🎲 랜덤룰" : "🏛️ 원작룰";
  $("mp-hud-round").textContent = `R${d.round}/10 · ${modeTag}`;
  $("mp-hud-mid").textContent = `현금 ${(me.cash || 0).toLocaleString()}`;
  $("mp-hud-right").textContent = `자산 ${Math.round(me.total_asset / 1000)}k`;
  board.innerHTML = d.state.stocks.map((s) => {
    const q = (me.holdings && me.holdings[s.id]) || 0;
    const pct = s.prev ? Math.round(((s.price - s.prev) / s.prev) * 100) : 0;
    const chg = pct > 0 ? `<span class="up">▲+${pct}%</span>` : pct < 0 ? `<span class="down">▼${pct}%</span>` : `<span>0%</span>`;
    const strokeCol = pct > 0 ? "#ff6b6b" : pct < 0 ? "#4dabf7" : "#20c997";
    const spark = buildHistorySvg(s.history, strokeCol);
    const ruleBar = s.rule_revealed
      ? `<div class="stock-rule-open">🔓 ${s.rule_desc}</div>`
      : `<div class="stock-rule-locked">🔒 비밀 룰 <span class="redact-box">■■■■■■■■■■</span></div>`;
    return `<div class="stock-card-wrap">
      <div class="stock-row" style="border:none;background:none;padding:0;">
        <div class="stock-info"><div class="stock-name">${s.name} ${q > 0 ? `<span class="stock-qty">${q}주</span>` : ""}</div><div class="stock-price">${s.price.toLocaleString()}원 ${chg}</div></div>
        ${spark}
        <div class="stock-btns">
          <button class="st-act buy" ${d.phase === "DONE" || me.ready || me.cash < s.price ? "disabled" : ""} onclick="mpSend({action:'buy1',stock_id:'${s.id}'})">+1</button>
          <button class="st-act all" ${d.phase === "DONE" || me.ready || me.cash < s.price ? "disabled" : ""} onclick="mpSend({action:'buyMax',stock_id:'${s.id}'})">MAX</button>
          <button class="st-act sell" ${d.phase === "DONE" || me.ready || q <= 0 ? "disabled" : ""} onclick="mpSend({action:'sellAll',stock_id:'${s.id}'})">매도</button>
        </div>
      </div>
      ${ruleBar}
    </div>`;
  }).join("");
  if (d.phase === "DONE") return mpDoneFooter(ctrl, isHost);
  const ranks = [...d.players].sort((a, b) => b.total_asset - a.total_asset).map((p, i) => `${i + 1}.${p.name}(${Math.round(p.total_asset / 1000)}k${p.ready ? "✅" : ""})`).join(" · ");
  ctrl.innerHTML = `<div style="font-size:11px;color:#ccc;text-align:center;">${ranks}</div>
    ${me.ready ? `<div class="wait-pill">⏳ 거래 완료! 다른 플레이어 마감 대기 중...</div>` : `<button type="button" class="btn btn-gold" style="padding:10px;" onclick="mpSend({action:'ready'})">📈 이번 라운드 거래 완료 (다음 룰 1개 공개)</button>`}`;
}

// --- 4. 러시안 룰렛 (Circular 16-Chamber SVG + Right Live Firing Order Table #1~#16) ---
function renderMpRoulette(d, me, board, ctrl, isHost) {
  const ps = d.players;
  const n = ps.length;
  const aimIdx = d.state.aim_idx || 0;
  const aimed = ps[aimIdx];
  const turnP = ps.find((p) => p.is_turn);
  $("mp-hud-round").textContent = `🎯 ${aimed ? aimed.name : "-"}`;
  $("mp-hud-mid").textContent = `조작 ${d.state.swap_gauge}/6`;
  $("mp-hud-right").textContent = `크레딧 ${me.credits}C`;

  // Compute firing order mapping for #1 ~ #16
  const mySlots = [];
  let myDanger = false;
  const orderRows = d.state.chambers.map((c, i) => {
    const targetP = ps[(aimIdx + i) % n];
    const isMeTarget = targetP && targetP.id === d.viewer_id;
    if (isMeTarget) {
      mySlots.push(`#${i + 1}`);
      if (c.known && c.bullet) myDanger = true;
    }
    const isSel = mpSel.rrSlot === i;
    const isNextSel = (mpSel.rrSlot + 1) % 16 === i;
    let statusHtml = `<span class="rr-st unk">❓ 미조사</span>`;
    let rowCls = "";
    if (c.known) {
      if (c.bullet) {
        statusHtml = `<span class="rr-st bullet">${c.priv ? "🕵️" : ""}💥 실탄</span>`;
        rowCls += " is-bullet";
      } else {
        statusHtml = `<span class="rr-st safe">${c.priv ? "🕵️" : ""}○ 공포</span>`;
        rowCls += " is-safe";
      }
    }
    if (isMeTarget) rowCls += " is-me";
    if (isSel) rowCls += " is-sel";
    else if (isNextSel) rowCls += " is-pair";

    const tag = i === 0 ? "🎯 " : "";
    const meTag = isMeTarget ? `<span class="rr-me-tag">나</span>` : "";
    const deadTag = targetP && targetP.dead ? " 💀" : "";
    return `<tr class="${rowCls.trim()}" onclick="mpSel.rrSlot=${i};renderMp()">
      <th scope="row">${isSel ? "▶" : isNextSel ? "└" : ""} #${i + 1}</th>
      <td class="rr-td-name">${tag}${targetP ? targetP.name : "-"}${meTag}${deadTag}</td>
      <td>${statusHtml}</td>
    </tr>`;
  }).join("");

  const selTarget = ps[(aimIdx + mpSel.rrSlot) % n];
  const cx = 110, cy = 110, r = 82;
  const nodes = d.state.chambers.map((c, i) => {
    const angle = ((i / 16) * Math.PI * 2) - Math.PI / 2;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    const isSel = mpSel.rrSlot === i;
    const isPair = (mpSel.rrSlot + 1) % 16 === i;
    const targetP = ps[(aimIdx + i) % n];
    const isMeTarget = targetP && targetP.id === d.viewer_id;
    const fill = c.known ? (c.bullet ? "#c0392b" : "#1e6b44") : (isMeTarget ? "#2b2416" : "#1a1b24");
    const stroke = isSel ? "#f7df8c" : isPair ? "#ffd43b" : (c.known ? (c.bullet ? "#ff6b6b" : "#5ee695") : (isMeTarget ? "rgba(212,175,55,0.6)" : "rgba(255,255,255,0.22)"));
    const label = c.known ? (c.bullet ? "●" : "○") : (i + 1);
    return `<g class="rr-chamber-node" onclick="mpSel.rrSlot=${i};renderMp()">
      <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${isSel ? 13 : 11}" fill="${fill}" stroke="${stroke}" stroke-width="${isSel ? 2.5 : isPair ? 1.8 : 1.5}"/>
      <text x="${x.toFixed(1)}" y="${(y + 3.5).toFixed(1)}" text-anchor="middle" font-size="9.5" font-weight="900" fill="#fff">${label}</text>
    </g>`;
  }).join("");

  const cylSvg = `<div class="rr-cylinder-wrap">
    <svg class="rr-cylinder-svg" viewBox="0 0 220 220">
      <circle cx="110" cy="110" r="98" fill="#101016" stroke="rgba(255,92,92,0.4)" stroke-width="2"/>
      <circle cx="110" cy="110" r="39" fill="#181822" stroke="rgba(212,175,55,0.45)" stroke-width="1.5"/>
      <text x="110" y="99" text-anchor="middle" font-size="9" font-weight="800" fill="#aaa">선택 #${mpSel.rrSlot + 1}·#${(mpSel.rrSlot + 1) % 16 + 1}</text>
      <text x="110" y="116" text-anchor="middle" font-size="13" font-weight="900" fill="#f7df8c">${selTarget ? selTarget.name : "-"}</text>
      <text x="110" y="129" text-anchor="middle" font-size="8.5" font-weight="700" fill="#888">시계방향 격발</text>
      ${nodes}
    </svg>
  </div>`;

  const turnOrderHtml = `<div class="rr-turn-block">
    <div class="rr-mini-title">🔄 행동 턴 순서 (좌→우 순환)</div>
    <div class="rr-players-row">${ps.map((p, idx) => `
      <div class="rr-p ${p.dead ? "dead" : p.is_aimed ? "aimed" : ""} ${p.is_turn ? "turn-now" : ""}">
        <span class="rr-p-idx">${idx + 1}</span>
        <span>${p.is_turn ? "⚡" : ""}${p.name}</span>
        ${p.is_aimed ? `<span title="현재 1번 조준">🎯</span>` : ""}
        ${p.dead ? "💀" : p.passed ? "✋" : ""}
      </div>`).join("")}</div>
  </div>`;

  const orderTableHtml = `<div class="rr-right">
    <div class="rr-order-head">
      <div id="rr-order-caption" class="rr-order-title">🎯 실시간 격발 순서표 (#1~#16)</div>
      <div class="rr-my-slots ${myDanger ? "danger" : ""}">
        ${myDanger ? "🚨 내 약실 실탄 위험! · " : ""}내 약실: <strong>${mySlots.join(", ") || "-"}</strong>
      </div>
    </div>
    <div tabindex="0" role="region" aria-labelledby="rr-order-caption" class="rr-table-wrap">
      <table class="rr-order-table">
        <thead>
          <tr>
            <th scope="col">약실</th>
            <th scope="col">격발 대상</th>
            <th scope="col">상태</th>
          </tr>
        </thead>
        <tbody>${orderRows}</tbody>
      </table>
    </div>
  </div>`;

  board.innerHTML = `<div class="rr-layout">
    <div class="rr-left">
      ${turnOrderHtml}
      ${cylSvg}
    </div>
    ${orderTableHtml}
  </div>`;

  if (d.phase === "DONE") return mpDoneFooter(ctrl, isHost);
  if (!me.is_turn) {
    ctrl.innerHTML = `<div class="wait-pill">⏳ ${turnP ? `${turnP.is_ai ? "🤖 " : ""}${turnP.name}님의 차례를 진행 중...` : "다음 단계 대기 중..."}</div>`;
    return;
  }
  const nextAim1 = ps[(aimIdx + 1) % n];
  const nextAim2 = ps[(aimIdx + 2) % n];
  ctrl.innerHTML = `
    <div class="rr-rot-hint">
      선택: <strong>#${mpSel.rrSlot + 1} &amp; #${(mpSel.rrSlot + 1) % 16 + 1}</strong> · 🔄+1 시 1번→<strong>${nextAim1 ? nextAim1.name : "-"}</strong> · 🔄+2 시 1번→<strong>${nextAim2 ? nextAim2.name : "-"}</strong>
    </div>
    <div class="action-row cols-2">
      <button class="act-btn act-call" ${me.credits < 1 ? "disabled" : ""} onclick="mpSend({action:'pub',slot:mpSel.rrSlot})">👁️ 공개조사(1C)</button>
      <button class="act-btn act-stay" ${me.credits < 2 ? "disabled" : ""} onclick="mpSend({action:'priv',slot:mpSel.rrSlot})">🕵️ 비공개(2C)</button>
    </div>
    <div class="action-row cols-4">
      <button class="act-btn act-raise" ${me.credits < 3 ? "disabled" : ""} onclick="mpSend({action:'rot1'})">🔄+1(3C)</button>
      <button class="act-btn act-raise" ${me.credits < 4 ? "disabled" : ""} onclick="mpSend({action:'rot2'})">🔄+2(4C)</button>
      <button class="act-btn act-fold" ${me.credits < 2 ? "disabled" : ""} onclick="mpSend({action:'swap',slot:mpSel.rrSlot})">🔀조작(2C)</button>
      <button class="act-btn" style="background:#333;" onclick="mpSend({action:'pass'})">✋패스</button>
    </div>`;
}

// --- 5. 보석 암시장 (with Faceted Jewel Cards) ---
function renderMpGemMarket(d, me, board, ctrl, isHost) {
  $("mp-hud-round").textContent = `R${d.round} / 5`;
  $("mp-hud-mid").textContent = `🤫 마니또: ${me.manitto_name || "-"}`;
  $("mp-hud-right").textContent = `기본점 ${me.pts}`;
  board.innerHTML = `
    <div style="display:flex;gap:6px;justify-content:center;">${d.state.buyers.map((b) => `<span class="gm-pill">${b.label} (+${b.pts})</span>`).join("")}</div>
    <div class="d1-score-grid">${d.players.map((p, i) => `<div class="d1-pcell ${p.id === d.viewer_id ? "me" : ""}"><span>${p.name}${i === me.manitto_idx ? " 🤫" : ""}${p.submitted ? " ✅" : ""}</span><strong>${d.phase === "DONE" ? `최종 ${p.final_score}` : `${p.pts}점`}</strong></div>`).join("")}</div>`;
  if (d.phase === "DONE") return mpDoneFooter(ctrl, isHost);
  if (me.submitted) {
    ctrl.innerHTML = `<div class="wait-pill">⏳ 교환 제출 완료! 다른 플레이어 대기 중...</div>`;
    return;
  }
  ctrl.innerHTML = `
    <div class="h13-row">${me.hand.map((c, idx) => `<button class="gm-card ${c.isBomb ? "bomb" : c.id} ${mpSel.gmCard === idx ? "selected" : ""}" onclick="mpSel.gmCard=${idx};renderMp()"><span>${c.label}</span><small>${c.pts > 0 ? `+${c.pts}` : c.pts}</small></button>`).join("")}</div>
    <div class="h13-row">${d.players.map((p, idx) => p.id === d.viewer_id ? "" : `<button class="h13-chip ${mpSel.gmTarget === idx ? "selected" : ""}" onclick="mpSel.gmTarget=${idx};renderMp()">${p.name}${idx === me.manitto_idx ? "(마니또)" : ""}</button>`).join("")}</div>
    <button class="btn btn-gold" style="padding:10px;" ${mpSel.gmCard === null || mpSel.gmTarget === null ? "disabled" : ""} onclick="mpSend({card_idx:mpSel.gmCard,target_idx:mpSel.gmTarget});mpSel.gmCard=null;mpSel.gmTarget=null;">🤝 교환 제출</button>`;
}

// --- 6. 돼지 저금통 ---
function renderMpPiggyBank(d, me, board, ctrl, isHost) {
  const st = d.state;
  const askTxt = st.ask_color === "black" ? "⚫ 흑 동전" : "⚪ 백 동전";
  $("mp-hud-round").textContent = `턴 ${d.round}`;
  $("mp-hud-mid").textContent = `질문: ${askTxt}`;
  $("mp-hud-right").textContent = `내 점수 ${me.score}/5`;
  board.innerHTML = `
    <div class="d1-score-grid">${d.players.map((p) => `<div class="d1-pcell ${p.id === d.viewer_id ? "me" : ""}"><span>${p.name}</span><strong>${p.score} / 5점</strong></div>`).join("")}</div>
    <div class="pb-banks">${st.banks.map((b, i) => `<div class="pb-bank ${i === st.active_bank ? "active" : ""}"><span class="pig">🐷</span><span>#${b.id}</span><span style="font-size:10px;color:#aaa;">${d.phase === "DONE" ? `⚫${b.black} ⚪${b.white}` : "??"}</span></div>`).join("")}</div>`;
  if (d.phase === "DONE") return mpDoneFooter(ctrl, isHost);

  const actor = d.players[st.turn_idx];
  const resp = d.players[st.responder_idx];
  if (st.sub_phase === "PUT") {
    if (actor.id !== d.viewer_id) {
      ctrl.innerHTML = `<div class="wait-pill">⏳ ${actor.name}님이 #${st.active_bank + 1} 저금통에 동전을 넣는 중...</div>`;
      return;
    }
    ctrl.innerHTML = `
      <div class="h13-row">
        <button class="h13-chip ${mpSel.pbCol === "black" ? "selected" : ""}" onclick="mpSel.pbCol='black';renderMp()">⚫ 흑</button>
        <button class="h13-chip ${mpSel.pbCol === "white" ? "selected" : ""}" onclick="mpSel.pbCol='white';renderMp()">⚪ 백</button>
        ${[1, 2, 3, 4, 5].map((n) => `<button class="h13-btn ${mpSel.pbCnt === n ? "selected" : ""}" style="min-width:34px;height:36px;" onclick="mpSel.pbCnt=${n};renderMp()">${n}</button>`).join("")}
      </div>
      <div class="h13-row">${d.players.map((p, idx) => p.id === d.viewer_id ? "" : `<button class="h13-chip ${mpSel.pbTarget === idx ? "selected" : ""}" onclick="mpSel.pbTarget=${idx};renderMp()">→ ${p.name}</button>`).join("")}</div>
      <button class="btn btn-gold" style="padding:10px;" ${mpSel.pbTarget === null ? "disabled" : ""} onclick="mpSend({action:'put',color:mpSel.pbCol,count:mpSel.pbCnt,target_idx:mpSel.pbTarget});mpSel.pbTarget=null;">🐷 넣고 전달하기</button>`;
  } else if (st.sub_phase === "ANSWER") {
    if (resp.id !== d.viewer_id) {
      ctrl.innerHTML = `<div class="wait-pill">⏳ ${resp.name}님이 ${askTxt} 개수를 대답하는 중...</div>`;
      return;
    }
    ctrl.innerHTML = `
      <div style="display:flex;gap:8px;">
        <input id="mp-pb-ans" type="number" min="0" max="50" class="text-input" style="text-align:center;" placeholder="${askTxt} 총개수 입력" />
        <button class="btn btn-gold" style="padding:0 16px;white-space:nowrap;" onclick="mpSend({action:'answer',claim:parseInt($('mp-pb-ans').value||'0',10)})">대답</button>
      </div>`;
  } else if (st.sub_phase === "DOUBT") {
    if (resp.id === d.viewer_id) {
      ctrl.innerHTML = `<div class="wait-pill">⏳ 다른 플레이어들이 내 대답(${st.claim}개)을 의심할지 결정 중...</div>`;
      return;
    }
    ctrl.innerHTML = `<div class="action-row cols-2">
      <button class="act-btn act-fold" onclick="mpSend({action:'doubt'})">🚨 의심! (틀렸다)</button>
      <button class="act-btn act-hit" onclick="mpSend({action:'pass'})">✅ 통과</button>
    </div>`;
  }
}

// AI default difficulty selector
document.querySelectorAll(".mp-ai-lvl").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".mp-ai-lvl").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    mpSel.aiLevel = btn.dataset.lvl;
  });
});

// Exchange rule mode selector
document.querySelectorAll(".mp-ex-mode").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".mp-ex-mode").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    mpSel.exRuleMode = btn.dataset.rm;
  });
});

// Button Bindings
if ($("btn-mp-solo")) $("btn-mp-solo").onclick = () => mpCreate("solo");
if ($("btn-mp-create")) $("btn-mp-create").onclick = () => mpCreate("multi");
if ($("btn-mp-join")) $("btn-mp-join").onclick = mpJoin;
if ($("btn-mp-add-ai")) $("btn-mp-add-ai").onclick = () => mpSend({ action: "add_ai", ai_level: mpSel.aiLevel });
if ($("btn-mp-rem-ai")) $("btn-mp-rem-ai").onclick = () => mpSend({ action: "remove_ai" });
if ($("btn-mp-start")) $("btn-mp-start").onclick = () => mpSend({ action: "start" });
if ($("btn-mp-end")) $("btn-mp-end").onclick = () => { if (confirm("방장 권한으로 게임을 종료할까요?")) mpSend({ action: "end_game" }); };
if ($("btn-mp-save")) {
  $("btn-mp-save").onclick = async () => {
    await mpSend({ action: "save" });
    if (typeof SFX !== "undefined") SFX.save();
    if (typeof showToast === "function") showToast(`💾 방 [${mpRoomId}] 7일간 저장 완료!`);
  };
}
if ($("btn-mp-copy-code")) {
  $("btn-mp-copy-code").onclick = () => {
    navigator.clipboard?.writeText(mpRoomId);
    $("btn-mp-copy-code").textContent = "✅ 복사됨!";
    setTimeout(() => ($("btn-mp-copy-code").textContent = "📋 코드 복사"), 1800);
  };
}
if ($("btn-mp-copy-link")) {
  $("btn-mp-copy-link").onclick = () => {
    navigator.clipboard?.writeText(`${location.origin}/?mp_room=${mpRoomId}`);
    $("btn-mp-copy-link").textContent = "✅ 링크 복사됨!";
    setTimeout(() => ($("btn-mp-copy-link").textContent = "🔗 초대 링크 복사"), 1800);
  };
}

// Auto-open if ?mp_room=XXXX or refreshed mid-game
const mpUrlCode = new URLSearchParams(window.location.search).get("mp_room");
if (mpUrlCode) {
  openMpGameEntry("", "멀티플레이 방 입장", "INVITE LINK", "초대받은 방에 닉네임을 입력하고 입장하세요!");
  if ($("mp-code-in")) $("mp-code-in").value = mpUrlCode.toUpperCase();
} else if (sessionStorage.getItem("mp_in_game") === "1") {
  try {
    const saved = JSON.parse(localStorage.getItem("mp_active_room") || "null");
    if (saved && saved.roomId && saved.playerId) mpReconnect(saved);
  } catch (_) {}
}

// --- 7. 경매 빙고 (Auction Bingo) ---
function renderMpAuctionBingo(d, me, board, ctrl, isHost) {
  const curNum = d.state.current_num;
  $("mp-hud-round").textContent = `R${d.round} / ${d.state.max_rounds}`;
  $("mp-hud-mid").textContent = `매물 번호 [ ${curNum} ]`;
  $("mp-hud-right").textContent = `🪙${me.chips} · ${me.lines}줄`;
  const mset = new Set(me.marked || []);
  board.innerHTML = `
    <div class="bingo-grid">${(me.board || []).map((n) => `
      <div class="bingo-cell ${mset.has(n) ? "marked" : ""} ${n === curNum && d.phase === "PLAYING" ? "target-now" : ""}">${n}</div>
    `).join("")}</div>
    <div class="d1-score-grid">${d.players.map((p) => `<div class="d1-pcell ${p.id === d.viewer_id ? "me" : ""}"><span>${p.name} ${p.submitted ? "✅" : ""}</span><strong>${p.lines}줄 · 🪙${p.chips}</strong></div>`).join("")}</div>`;
  if (d.phase === "DONE") return mpDoneFooter(ctrl, isHost);
  if (me.submitted) {
    ctrl.innerHTML = `<div class="wait-pill">⏳ 입찰 완료! 다른 플레이어의 입찰을 기다리는 중...</div>`;
    return;
  }
  const maxB = me.chips;
  if (mpSel.abBid > maxB) mpSel.abBid = maxB;
  ctrl.innerHTML = `
    <div class="raise-slider-row">
      <input type="range" class="raise-range" min="0" max="${maxB}" value="${mpSel.abBid}" oninput="mpSel.abBid=parseInt(this.value,10);$('ab-bid-btn').textContent='🔨 '+this.value+'칩 입찰'" />
      <button id="ab-bid-btn" type="button" class="btn btn-gold" style="padding:8px 14px;font-size:13px;" onclick="mpSend({bid:mpSel.abBid})">🔨 ${mpSel.abBid}칩 입찰</button>
    </div>`;
}

// --- 8. 벽바둑 2 (Wall Go 2) ---
function renderMpWallGo(d, me, board, ctrl, isHost) {
  $("mp-hud-round").textContent = `턴 ${Math.min(d.round, d.state.max_rounds)}/${d.state.max_rounds}`;
  $("mp-hud-mid").textContent = `내 영토 ${me.territory}칸`;
  $("mp-hud-right").textContent = me.is_turn ? "⚡ 내 차례" : "대기 중";
  const walls = new Set(d.state.walls || []);
  const hasW = (r, c, dir) => {
    const opp = { N: [-1, 0, "S"], S: [1, 0, "N"], E: [0, 1, "W"], W: [0, -1, "E"] }[dir];
    return walls.has(`${r},${c},${dir}`) || walls.has(`${r + opp[0]},${c + opp[1]},${opp[2]}`);
  };
  const colors = ["🔵", "🔴", "🟢", "🟡"];
  let cellsHtml = "";
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const pIdx = d.players.findIndex((p) => p.pos[0] === r && p.pos[1] === c);
      const isSel = mpSel.wgR === r && mpSel.wgC === c;
      const wCls = `${hasW(r, c, "N") ? "wN" : ""} ${hasW(r, c, "S") ? "wS" : ""} ${hasW(r, c, "E") ? "wE" : ""} ${hasW(r, c, "W") ? "wW" : ""}`;
      cellsHtml += `<div class="wg-cell ${wCls} ${isSel ? "sel" : ""}" onclick="mpSel.wgR=${r};mpSel.wgC=${c};renderMp()">${pIdx >= 0 ? colors[pIdx % 4] : ""}</div>`;
    }
  }
  board.innerHTML = `
    <div class="wg-grid">${cellsHtml}</div>
    <div class="d1-score-grid">${d.players.map((p, i) => `<div class="d1-pcell ${p.id === d.viewer_id ? "me" : ""}"><span>${colors[i % 4]} ${p.name}${p.is_turn ? " ⚡" : ""}</span><strong>영토 ${p.territory}칸</strong></div>`).join("")}</div>`;
  if (d.phase === "DONE") return mpDoneFooter(ctrl, isHost);
  if (!me.is_turn) {
    ctrl.innerHTML = `<div class="wait-pill">⏳ 다른 플레이어가 이동 및 벽을 설치하는 중...</div>`;
    return;
  }
  const tr = mpSel.wgR !== null ? mpSel.wgR : me.pos[0];
  const tc = mpSel.wgC !== null ? mpSel.wgC : me.pos[1];
  ctrl.innerHTML = `
    <div class="h13-row">
      ${[["N", "⬆️ 위벽"], ["S", "⬇️ 아래벽"], ["W", "⬅️ 왼벽"], ["E", "➡️ 오른벽"]].map(([k, l]) => `<button class="h13-chip ${mpSel.wgWall === k ? "selected" : ""}" onclick="mpSel.wgWall='${k}';renderMp()">${l}</button>`).join("")}
    </div>
    <button class="btn btn-gold" style="padding:10px;" onclick="mpSend({r:${tr},c:${tc},wall_dir:mpSel.wgWall});mpSel.wgR=null;mpSel.wgC=null;">🧱 (${tr + 1},${tc + 1}) 이동 &amp; 벽 설치</button>`;
}

// --- 9. 히든 워드 (Original Korean Noun AI Similarity: Envelope -> Hint(%) -> Guess) ---
function renderMpHiddenWord(d, me, board, ctrl, isHost) {
  const st = d.state;
  const setter = d.players[st.setter_idx];
  const isSetter = me.is_setter;
  const engBadge = st.ai_engine === "gemini-kr" ? "🧠 한국어 관계 AI" : (st.ai_engine === "gemini" ? "🧠 Gemini 임베딩" : "⚙️ 내장 유사도");
  $("mp-hud-round").textContent = `R${d.round}/${st.max_rounds}`;
  $("mp-hud-mid").textContent = `출제: ${setter ? setter.name : "-"}`;
  $("mp-hud-right").textContent = engBadge;

  const hintsHtml = (st.hints || []).length
    ? st.hints
        .map((h, i) => {
          const lvl = h.sim >= 85 ? "hot" : h.sim >= 60 ? "warm" : "cool";
          return `<div class="hw-sim-row">
            <span class="hw-sim-word">#${i + 1} ${h.word}</span>
            <div class="hw-sim-bar"><div class="hw-sim-fill ${lvl}" style="width:${Math.min(100, h.sim)}%"></div></div>
            <strong class="hw-sim-pct ${lvl}">${h.sim}%</strong>
          </div>`;
        })
        .join("")
    : `<div class="wait-pill">아직 공개된 힌트가 없습니다.</div>`;

  board.innerHTML = `
    <div class="d1-score-grid">${d.players.map((p) => `<div class="d1-pcell ${p.id === d.viewer_id ? "me" : ""}"><span>${p.is_setter ? "🎤" : ""}${p.name} <small>${p.submitted ? "✅" : p.last_guess}</small></span><strong>${p.score}점</strong></div>`).join("")}</div>
    ${isSetter && st.secret ? `<div class="role-banner host" style="text-align:center;">🔐 내 히든 워드: <strong>${st.secret}</strong></div>` : ""}
    <div class="hw-sim-list">${hintsHtml}</div>`;

  if (d.phase === "DONE") return mpDoneFooter(ctrl, isHost);

  if (st.sub_phase === "PICK_SECRET") {
    if (!isSetter) {
      ctrl.innerHTML = `<div class="wait-pill">⏳ 출제자 ${setter.name}님이 봉투(5개 명사) 중 1개를 고르는 중...</div>`;
      return;
    }
    ctrl.innerHTML = `
      <div class="h13-pick-label">✉️ 봉투 속 5개 명사 중 내 히든 워드 1개 선택</div>
      <div class="h13-row">${(st.envelope || []).map((w) => `<button type="button" class="h13-chip" onclick="mpSend({word:'${w}'})">${w}</button>`).join("")}</div>`;
  } else if (st.sub_phase === "HINT") {
    if (!isSetter) {
      ctrl.innerHTML = `<div class="wait-pill">⏳ ${setter.name}님이 한글 명사 힌트를 제출 중... (${(st.hints || []).length}/10)</div>`;
      return;
    }
    ctrl.innerHTML = `
      <div style="display:flex;gap:6px;">
        <input id="mp-hw-hint" class="text-input" placeholder="한글 명사 힌트 입력 (90%↑ 조기종료)" />
        <button class="btn btn-gold" style="padding:0 14px;white-space:nowrap;" onclick="mpSend({word:$('mp-hw-hint').value})">힌트</button>
      </div>
      ${(st.hints || []).length > 0 ? `<button class="btn btn-outline" style="padding:8px;font-size:12.5px;" onclick="mpSend({action:'finish_hints'})">🎯 힌트 종료 · 상대 추리 시작</button>` : ""}`;
  } else if (st.sub_phase === "GUESS") {
    if (isSetter) {
      ctrl.innerHTML = `<div class="wait-pill">⏳ 다른 플레이어들이 내 히든 워드 [${st.secret}]를 추리하는 중...</div>`;
      return;
    }
    if (me.submitted) {
      ctrl.innerHTML = `<div class="wait-pill">⏳ 추리 제출 완료! 다른 플레이어를 기다리는 중...</div>`;
      return;
    }
    ctrl.innerHTML = `
      <div style="display:flex;gap:6px;">
        <input id="mp-hw-guess" class="text-input" placeholder="출제자의 히든 워드(한글 명사) 추리" />
        <button class="btn btn-gold" style="padding:0 16px;white-space:nowrap;" onclick="mpSend({guess:$('mp-hw-guess').value})">제출</button>
      </div>`;
  }
}

// --- 10. 수식의 탑 (Formula Tower) ---
function renderMpFormulaTower(d, me, board, ctrl, isHost) {
  $("mp-hud-round").textContent = `R${d.round}`;
  $("mp-hud-mid").textContent = `목표 [ ${d.state.target} ]`;
  $("mp-hud-right").textContent = `내 탑 ${me.tower}/5층`;
  board.innerHTML = `
    <div style="text-align:center;font-size:13px;font-weight:900;color:var(--gold-bright);">사용 숫자 카드: ${(d.state.nums || []).map((n) => `[${n}]`).join(" ")}</div>
    <div class="ft-towers">${d.players.map((p) => `
      <div class="ft-col ${p.id === d.viewer_id ? "me" : ""}">
        <div class="ft-stack">${Array.from({ length: p.tower }, () => `<div class="ft-block"></div>`).join("")}</div>
        <strong>${p.name} ${p.submitted ? "✅" : ""}</strong>
        <span style="color:#aaa;font-size:10px;">${p.tower}층 · ${p.last_expr}</span>
      </div>`).join("")}</div>`;
  if (d.phase === "DONE") return mpDoneFooter(ctrl, isHost);
  if (me.submitted) {
    ctrl.innerHTML = `<div class="wait-pill">⏳ 수식 제출 완료! 다른 플레이어 대기 중...</div>`;
    return;
  }
  ctrl.innerHTML = `
    <div style="display:flex;gap:8px;">
      <input id="mp-ft-in" class="text-input" placeholder="예: 9*4-5+2" />
      <button class="btn btn-gold" style="padding:0 16px;white-space:nowrap;" onclick="mpSend({expr:$('mp-ft-in').value})">🗼 제출</button>
    </div>`;
}

// --- 11. 그라데이션 (Original Day 6: 7 Symmetric Monochrome Cups ⬛▪️▫️⬜▫️▪️⬛) ---
let grDraft = [0, 1, 3, 5, 6, 7, 8];
const GR_COLORS_UI = ["black", "darkgray", "ivory", "white", "ivory", "darkgray", "black"];
const GR_KR_UI = { black: "⬛검정", darkgray: "▪️진회색", ivory: "▫️상아색", white: "⬜흰색" };

function grAdjDraft(idx, delta) {
  grDraft[idx] = Math.max(0, Math.min(9, grDraft[idx] + delta));
  renderMp();
}

function grRandDraft() {
  const presets = [
    [0, 1, 3, 5, 6, 7, 8],
    [0, 2, 3, 4, 5, 7, 9],
    [1, 1, 3, 4, 6, 7, 8],
    [0, 2, 2, 4, 6, 8, 8],
    [0, 1, 2, 5, 6, 7, 9],
  ];
  grDraft = [...presets[Math.floor(Math.random() * presets.length)]];
  if (typeof SFX !== "undefined") SFX.dice();
  renderMp();
}

function renderMpGradation(d, me, board, ctrl, isHost) {
  const st = d.state;
  const opp = d.players.find((p) => p.id !== d.viewer_id);
  $("mp-hud-round").textContent = st.sub_phase === "SETUP" ? "배치 단계" : `R${d.round} / 7`;
  $("mp-hud-mid").textContent = `${me.name} ${me.score} : ${opp ? opp.score : 0} ${opp ? opp.name : ""}`;
  $("mp-hud-right").textContent = me.is_lead ? "⭐ 선공" : "후공";

  if (st.sub_phase === "SETUP") {
    const sum = grDraft.reduce((a, b) => a + b, 0);
    const ascOk = grDraft.every((v, i) => i === 0 || grDraft[i - 1] <= v);
    const dupOk = grDraft.every((v) => grDraft.filter((x) => x === v).length <= 2);
    const valid = sum <= 30 && ascOk && dupOk;

    board.innerHTML = `
      <div class="d1-score-grid">
        ${d.players.map((p) => `<div class="d1-pcell ${p.id === d.viewer_id ? "me" : ""}"><span>${p.name}</span><strong>${p.setup_done ? "✅ 배치완료" : "⏳ 배치 중"}</strong></div>`).join("")}
      </div>
      <div style="text-align:center;font-size:11.5px;color:#ccc;">
        총합 <strong style="color:${sum <= 30 ? "#5ee695" : "#ff6b6b"}">${sum}/30</strong> ·
        오름차순 <strong style="color:${ascOk ? "#5ee695" : "#ff6b6b"}">${ascOk ? "OK" : "불가"}</strong> ·
        중복≤2 <strong style="color:${dupOk ? "#5ee695" : "#ff6b6b"}">${dupOk ? "OK" : "초과"}</strong>
      </div>
      <div class="gr7-row">
        ${grDraft.map((v, i) => `
          <div class="gr7-cup ${GR_COLORS_UI[i]}">
            <span class="val">${v}</span>
            ${!me.setup_done ? `<div class="step-btns"><button type="button" onclick="grAdjDraft(${i},-1)">-</button><button type="button" onclick="grAdjDraft(${i},1)">+</button></div>` : ""}
          </div>
        `).join("")}
      </div>`;

    if (me.setup_done) {
      ctrl.innerHTML = `<div class="wait-pill">⏳ 배치 완료! 상대방이 7개 통 배치를 마칠 때까지 대기 중...</div>`;
    } else {
      ctrl.innerHTML = `
        <div class="action-row cols-2">
          <button type="button" class="btn btn-outline" style="padding:10px;" onclick="grRandDraft()">🎲 추천 배치</button>
          <button type="button" class="btn btn-gold" style="padding:10px;" ${!valid ? "disabled" : ""} onclick="mpSend({action:'setup',vals:grDraft})">✅ 배치 확정</button>
        </div>`;
    }
    return;
  }

  // PLAYING or DONE
  const histHtml = (st.history || []).slice(-3).map((h) => `
    <div class="d1-pcell" style="font-size:11px;">
      <span>R${h.round}: ${GR_KR_UI[h.p0_color]}(${h.p0_val}) vs ${GR_KR_UI[h.p1_color]}(${h.p1_val})</span>
      <strong>${h.result}</strong>
    </div>
  `).join("");

  const leadBanner = st.lead_cup_color && st.sub_phase === "FOLLOW_PICK"
    ? `<div class="gr7-cup ${st.lead_cup_color} gr7-lead-badge">선공 제출 통 색상: ${GR_KR_UI[st.lead_cup_color]} (숫자 비공개!)</div>`
    : "";

  board.innerHTML = `
    <div style="font-size:11px;color:#aaa;text-align:center;">상대방(${opp ? opp.name : ""}) 남은 통 (공개된 통만 숫자 표시)</div>
    <div class="gr7-row">
      ${(opp && opp.cups ? opp.cups : []).map((c) => `
        <div class="gr7-cup ${c.color} ${c.used ? "used" : ""}" style="cursor:default;">
          <span class="val">${c.val !== null ? c.val : "?"}</span>
        </div>
      `).join("")}
    </div>
    ${leadBanner}
    <div style="display:flex;flex-direction:column;gap:4px;">${histHtml}</div>`;

  if (d.phase === "DONE") return mpDoneFooter(ctrl, isHost);

  const canPick = me.is_turn;
  ctrl.innerHTML = `
    <div style="font-size:11px;color:var(--gold-bright);text-align:center;font-weight:800;">
      ${canPick ? "👇 낼 통 1개를 터치하세요! (상대에겐 통 색상만 보입니다)" : "⏳ 상대방이 통을 고르는 중..."}
    </div>
    <div class="gr7-row">
      ${(me.cups || []).map((c) => `
        <button type="button" class="gr7-cup ${c.color} ${c.used ? "used" : ""}" ${!canPick || c.used ? "disabled" : ""} onclick="mpSend({action:'pick',cup_idx:${c.idx}})">
          <span class="val">${c.val}</span>
        </button>
      `).join("")}
    </div>`;
}

// --- 12. 카드 장기 (Original Finals R1: 5x5 + 5 Animal Move Cards) ---
const CJ_CARD_UI = {
  mouse: "🐭쥐(상하좌우1)",
  horse: "🐴말(2+1)",
  monkey: "🐵원숭이(8방1)",
  elephant: "🐘코끼리(대각1~2)",
  giraffe: "🦒기린(상하좌우2)",
};
const CJ_ALL_KEYS = ["mouse", "horse", "monkey", "elephant", "giraffe"];
let cjOrderDraft = [];

function cjValidCells(pieces, pc, card) {
  if (!pc || !card) return new Set();
  const f = new Set(pieces.filter((x) => x.owner === pc.owner).map((x) => `${x.r},${x.c}`));
  const deltas =
    card === "mouse" ? [[-1,0],[1,0],[0,-1],[0,1]] :
    card === "horse" ? [[-2,-1],[-2,1],[2,-1],[2,1],[-1,-2],[-1,2],[1,-2],[1,2]] :
    card === "monkey" ? [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]] :
    card === "elephant" ? [[-1,-1],[-1,1],[1,-1],[1,1],[-2,-2],[-2,2],[2,-2],[2,2]] :
    [[-2,0],[2,0],[0,-2],[0,2]];
  const out = new Set();
  deltas.forEach(([dr, dc]) => {
    const nr = pc.r + dr, nc = pc.c + dc;
    if (nr >= 0 && nr < 5 && nc >= 0 && nc < 5 && !f.has(`${nr},${nc}`)) out.add(`${nr},${nc}`);
  });
  return out;
}

function cjToggleDraft(k, need) {
  const i = cjOrderDraft.indexOf(k);
  if (i >= 0) cjOrderDraft.splice(i, 1);
  else if (cjOrderDraft.length < need) cjOrderDraft.push(k);
  renderMp();
}

function cjRandDraft(need) {
  const arr = [...CJ_ALL_KEYS].sort(() => Math.random() - 0.5);
  cjOrderDraft = arr.slice(0, need);
  if (typeof SFX !== "undefined") SFX.dice();
  renderMp();
}

function renderMpCardJanggi(d, me, board, ctrl, isHost) {
  const st = d.state;
  const myIdx = d.players.findIndex((p) => p.id === d.viewer_id);
  const opp = d.players[1 - myIdx];
  $("mp-hud-round").textContent = st.sub_phase === "CARD_ORDER" ? "카드 배치" : `턴 ${d.round}`;
  $("mp-hud-mid").textContent = myIdx === 0 ? "🔵 아래 진영 (위 끝줄 목표)" : "🔴 위 진영 (아래 끝줄 목표)";
  $("mp-hud-right").textContent = me.is_turn ? "⚡ 내 차례" : "대기";

  if (st.sub_phase === "CARD_ORDER") {
    const need = me.need_cards || 5;
    board.innerHTML = `
      <div class="d1-score-grid">
        ${d.players.map((p) => `<div class="d1-pcell ${p.id === d.viewer_id ? "me" : ""}"><span>${p.name} (${p.need_cards}장)</span><strong>${p.order_done ? "✅ 완료" : "⏳ 배치 중"}</strong></div>`).join("")}
      </div>
      <div style="text-align:center;font-size:12px;color:var(--gold-bright);font-weight:800;">선택 순서 (${cjOrderDraft.length}/${need}): ${cjOrderDraft.map((k, i) => `${i + 1}.${CJ_CARD_UI[k].slice(0, 3)}`).join(" → ") || "아래 카드를 순서대로 터치하세요"}</div>`;
    if (me.order_done) {
      ctrl.innerHTML = `<div class="wait-pill">⏳ 내 행마 카드 배치 완료! 상대방 대기 중...</div>`;
    } else {
      ctrl.innerHTML = `
        <div class="h13-row">${CJ_ALL_KEYS.map((k) => `<button type="button" class="h13-chip ${cjOrderDraft.includes(k) ? "selected" : ""}" onclick="cjToggleDraft('${k}',${need})">${CJ_CARD_UI[k]}</button>`).join("")}</div>
        <div class="action-row cols-2">
          <button type="button" class="btn btn-outline" style="padding:9px;" onclick="cjRandDraft(${need})">🎲 랜덤 순서</button>
          <button type="button" class="btn btn-gold" style="padding:9px;" ${cjOrderDraft.length !== need ? "disabled" : ""} onclick="mpSend({action:'set_order',order:cjOrderDraft});cjOrderDraft=[];">✅ 순서 확정</button>
        </div>`;
    }
    return;
  }

  const pieces = st.pieces || [];
  const selPc = pieces.find((x) => x.id === mpSel.cjPiece && x.owner === myIdx);
  const validSet = me.is_turn && selPc ? cjValidCells(pieces, selPc, me.current_card) : new Set();

  let cells = "";
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const pc = pieces.find((x) => x.r === r && x.c === c);
      const isSel = pc && mpSel.cjPiece === pc.id;
      const canGo = validSet.has(`${r},${c}`);
      const cls = `${pc ? (pc.owner === 0 ? "p0" : "p1") : ""} ${r === 0 ? "goal0" : r === 4 ? "goal1" : ""} ${isSel ? "sel" : ""} ${canGo ? "can-go" : ""}`;
      cells += `<div class="cj5-cell ${cls}" onclick="mpCjTap(${r},${c},'${pc ? pc.id : ""}',${pc ? pc.owner : -1},${myIdx})">${pc ? pc.label : (canGo ? "·" : "")}</div>`;
    }
  }
  board.innerHTML = `
    <div class="d1-score-grid">
      <div class="d1-pcell me"><span>내 카드</span><strong>${me.current_card ? CJ_CARD_UI[me.current_card] : "-"}</strong></div>
      <div class="d1-pcell"><span>상대 카드</span><strong>${opp && opp.current_card ? CJ_CARD_UI[opp.current_card] : "-"}</strong></div>
    </div>
    <div class="cj5-grid">${cells}</div>`;
  if (d.phase === "DONE") return mpDoneFooter(ctrl, isHost);
  ctrl.innerHTML = `<div class="wait-pill">${me.is_turn ? (mpSel.cjPiece ? "🟢 초록 칸 중 이동할 곳을 터치하세요!" : `♟️ [${CJ_CARD_UI[me.current_card] || ""}] 이동할 내 말을 터치하세요!`) : "⏳ 상대방 차례입니다..."}</div>`;
}

function mpCjTap(r, c, pieceId, owner, myIdx) {
  if (!mpData || mpData.phase !== "PLAYING" || mpData.state.sub_phase !== "MOVE") return;
  const me = mpData.players[myIdx];
  if (!me || !me.is_turn) return;
  if (pieceId && owner === myIdx) {
    mpSel.cjPiece = pieceId;
    if (typeof SFX !== "undefined") SFX.chip();
    renderMp();
  } else if (mpSel.cjPiece) {
    const pid = mpSel.cjPiece;
    mpSel.cjPiece = null;
    mpSend({ action: "move", piece_id: pid, r, c });
  }
}

// --- 13. 컬러 링크 (Original Finals R2: 6x6 Pairs + Impossible Declaration & Proof!) ---
const CL_COLORS = ["A", "B", "C", "D", "E"];
const CL_LABELS = { A: "🔴A", B: "🔵B", C: "🟢C", D: "🟡D", E: "🟣E" };
let clSelCol = "A";
let clProofPaths = { A: [], B: [], C: [], D: [], E: [] };

function clTapProofCell(idx) {
  const path = clProofPaths[clSelCol] || [];
  const existing = path.indexOf(idx);
  if (existing >= 0) {
    clProofPaths[clSelCol] = path.slice(0, existing);
  } else {
    clProofPaths[clSelCol] = [...path, idx];
  }
  if (typeof SFX !== "undefined") SFX.chip();
  renderMp();
}

function renderMpColorLink(d, me, board, ctrl, isHost) {
  const st = d.state;
  const sub = st.sub_phase;
  const placed = st.placed_counts || {};
  $("mp-hud-round").textContent = sub === "PROOF" ? "🚨 경로 증명" : `배치 R${d.round}`;
  $("mp-hud-mid").textContent = "길이 6칸↑ · 겹침 금지";
  $("mp-hud-right").textContent = me.is_turn ? "⚡ 내 차례" : "대기";

  // Build path overlay map for PROOF
  const activePaths = d.phase === "DONE" ? (st.proof_paths || {}) : clProofPaths;
  const cellPathOwner = {};
  if (sub === "PROOF" || d.phase === "DONE") {
    CL_COLORS.forEach((col) => {
      (activePaths[col] || []).forEach((ci) => { cellPathOwner[ci] = col; });
    });
  }

  const cellsHtml = (st.board || []).map((val, i) => {
    const pCol = cellPathOwner[i];
    const cls = val ? `col${val}` : (pCol ? `path${pCol}` : "");
    const onclick =
      sub === "PLACE" && me.is_turn && !val
        ? `mpSend({action:'place',cell:${i},color:'${clSelCol}'})`
        : (sub === "PROOF" && me.is_turn ? `clTapProofCell(${i})` : "");
    return `<div class="cl6-cell ${cls}" onclick="${onclick}">${val || (pCol ? "•" : "")}</div>`;
  }).join("");

  board.innerHTML = `<div class="cl6-grid">${cellsHtml}</div>`;
  if (d.phase === "DONE") return mpDoneFooter(ctrl, isHost);

  if (sub === "PLACE") {
    const avail = CL_COLORS.filter((c) => (placed[c] || 0) < 2);
    if (avail.length && !avail.includes(clSelCol)) clSelCol = avail[0];
    const hasPair = CL_COLORS.some((c) => (placed[c] || 0) === 2);
    ctrl.innerHTML = `
      <div class="h13-row">${CL_COLORS.map((c) => `<button type="button" class="h13-chip ${clSelCol === c ? "selected" : ""}" ${(placed[c] || 0) >= 2 ? "disabled" : ""} onclick="clSelCol='${c}';renderMp()">${CL_LABELS[c]} (${placed[c] || 0}/2)</button>`).join("")}</div>
      <div class="action-row cols-2">
        <div class="wait-pill" style="padding:9px;">${me.is_turn ? `👆 빈 칸을 눌러 ${CL_LABELS[clSelCol]} 배치` : "⏳ 상대 배치 대기 중..."}</div>
        <button type="button" class="act-btn act-fold" ${!hasPair ? "disabled" : ""} onclick="mpSend({action:'declare_impossible'})">🚨 불가능 선언!</button>
      </div>`;
  } else if (sub === "PROOF") {
    if (!me.is_turn) {
      ctrl.innerHTML = `<div class="wait-pill">⏳ 방어자가 겹치지 않고 각 6칸↑ 연결을 증명하는 중...</div>`;
      return;
    }
    const activeCols = CL_COLORS.filter((c) => (placed[c] || 0) === 2);
    if (activeCols.length && !activeCols.includes(clSelCol)) clSelCol = activeCols[0];
    ctrl.innerHTML = `
      <div class="h13-row">${activeCols.map((c) => `<button type="button" class="h13-chip ${clSelCol === c ? "selected" : ""}" onclick="clSelCol='${c}';renderMp()">${CL_LABELS[c]} (${(clProofPaths[c] || []).length}/6칸)</button>`).join("")}</div>
      <div class="action-row cols-3">
        <button type="button" class="act-btn act-fold" onclick="mpSend({action:'give_up'})">🏳️ 포기</button>
        <button type="button" class="act-btn" style="background:#333;" onclick="clProofPaths[clSelCol]=[];renderMp()">↺ 선 지우기</button>
        <button type="button" class="act-btn act-hit" onclick="mpSend({action:'submit_proof',paths:clProofPaths})">✅ 증명 제출</button>
      </div>`;
  }
}

// --- 14. 비밀 코드 (Secret Code - 4-digit Bulls & Cows) ---
function renderMpSecretCode(d, me, board, ctrl, isHost) {
  $("mp-hud-round").textContent = `시도 ${me.tries}회`;
  $("mp-hud-mid").textContent = "중복 없는 4자리";
  $("mp-hud-right").textContent = "🟢S / 🟡B";
  const rows = (me.guesses || []).map((g) => `
    <div class="d1-pcell"><span><strong style="letter-spacing:3px;">${g.text}</strong></span><span>🟢 ${g.s}S &nbsp; 🟡 ${g.b}B</span></div>
  `).join("");
  board.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:5px;">${rows || `<div class="wait-pill">4자리 숫자(중복 없음)를 입력해 암호를 해독하세요!</div>`}</div>
    <div class="d1-score-grid" style="margin-top:6px;">${d.players.map((p) => `<div class="d1-pcell ${p.id === d.viewer_id ? "me" : ""}"><span>${p.name}</span><strong>${p.solved ? "🏆 해독!" : `${p.tries}회`}</strong></div>`).join("")}</div>`;
  if (d.phase === "DONE") return mpDoneFooter(ctrl, isHost);
  ctrl.innerHTML = `
    <div style="display:flex;gap:8px;">
      <input id="mp-sc-in" class="text-input code-input" maxlength="4" inputmode="numeric" placeholder="예: 1479" />
      <button class="btn btn-gold" style="padding:0 16px;white-space:nowrap;" onclick="mpSend({guess:$('mp-sc-in').value})">🔐 해독</button>
    </div>`;
}
