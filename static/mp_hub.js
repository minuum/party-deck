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

// Local UI selection state per game
let mpSel = {
  h13Card: null, h13Chip: null, h13Rb: "red",
  rrSlot: 0, gmCard: null, gmTarget: null,
  pbCol: "black", pbCnt: 2, pbTarget: null,
  abBid: 3, wgR: null, wgC: null, wgWall: "N",
  exRuleMode: "classic",
};

function mpStopPoll() {
  if (mpPollTimer) { clearInterval(mpPollTimer); mpPollTimer = null; }
}

function mpExitToHub() {
  mpStopPoll();
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
      body: JSON.stringify({ game_type: mpGameType, name, mode, rule_mode: mpSel.exRuleMode }),
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

function mpStartPoll() {
  mpStopPoll();
  mpPollTimer = setInterval(async () => {
    if (!mpRoomId || !mpPlayerId || mpPollBusy) return;
    mpPollBusy = true;
    try {
      const res = await fetch(`/api/mp/${mpRoomId}?player_id=${encodeURIComponent(mpPlayerId)}`);
      if (res.ok) {
        const out = await res.json();
        if (out.data) mpApply(out.data, false);
      }
    } catch (_) {} finally { mpPollBusy = false; }
  }, 850);
}

function mpApply(d, force = false) {
  const sig = JSON.stringify(d);
  if (!force && sig === mpLastSig) return;
  const prevPhase = mpData ? mpData.phase : "";
  const prevRound = mpData ? mpData.round : 0;
  mpLastSig = sig;
  mpData = d;
  mpGameType = d.game_type;

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
      const kick = isHost && p.is_ai ? `<button type="button" class="ai-kick-btn" onclick="mpSend({action:'remove_ai',target_id:'${p.id}'})">제거</button>` : "";
      li.innerHTML = `<div class="lobby-left"><span class="role-pill ${rCls}">${rTxt}</span><span>${p.name}</span>${p.id === d.viewer_id ? '<span class="role-pill me">나</span>' : ""}</div>${kick}`;
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

// --- 4. 러시안 룰렛 (Circular 16-Chamber Interactive SVG Revolver Cylinder!) ---
function renderMpRoulette(d, me, board, ctrl, isHost) {
  const aimed = d.players[d.state.aim_idx];
  $("mp-hud-round").textContent = `🎯 ${aimed ? aimed.name : "-"}`;
  $("mp-hud-mid").textContent = `조작 ${d.state.swap_gauge}/6`;
  $("mp-hud-right").textContent = `크레딧 ${me.credits}C`;

  const cx = 110, cy = 110, r = 82;
  const nodes = d.state.chambers.map((c, i) => {
    const angle = ((i / 16) * Math.PI * 2) - Math.PI / 2;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    const isSel = mpSel.rrSlot === i;
    const fill = c.known ? (c.bullet ? "#c0392b" : "#1e6b44") : "#1a1b24";
    const stroke = isSel ? "#f7df8c" : (c.known ? (c.bullet ? "#ff6b6b" : "#5ee695") : "rgba(255,255,255,0.22)");
    const label = c.known ? (c.bullet ? "●" : "○") : (i + 1);
    return `<g class="rr-chamber-node" onclick="mpSel.rrSlot=${i};renderMp()">
      <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${isSel ? 13 : 11}" fill="${fill}" stroke="${stroke}" stroke-width="${isSel ? 2.5 : 1.5}"/>
      <text x="${x.toFixed(1)}" y="${(y + 3.5).toFixed(1)}" text-anchor="middle" font-size="9.5" font-weight="900" fill="#fff">${label}</text>
    </g>`;
  }).join("");

  const cylSvg = `<div class="rr-cylinder-wrap">
    <svg class="rr-cylinder-svg" viewBox="0 0 220 220">
      <circle cx="110" cy="110" r="98" fill="#101016" stroke="rgba(255,92,92,0.4)" stroke-width="2"/>
      <circle cx="110" cy="110" r="34" fill="#181822" stroke="rgba(212,175,55,0.45)" stroke-width="1.5"/>
      <text x="110" y="106" text-anchor="middle" font-size="10" font-weight="800" fill="#aaa">선택 약실</text>
      <text x="110" y="123" text-anchor="middle" font-size="16" font-weight="900" fill="#f7df8c">#${mpSel.rrSlot + 1}</text>
      ${nodes}
    </svg>
  </div>`;

  board.innerHTML = `
    <div class="rr-players-row">${d.players.map((p) => `<div class="rr-p ${p.dead ? "dead" : p.is_aimed ? "aimed" : ""}">${p.is_turn ? "⚡" : ""}${p.name}${p.dead ? "💀" : p.passed ? "✋" : ""}</div>`).join("")}</div>
    ${cylSvg}`;
  if (d.phase === "DONE") return mpDoneFooter(ctrl, isHost);
  if (!me.is_turn) {
    ctrl.innerHTML = `<div class="wait-pill">⏳ 다른 플레이어의 차례입니다...</div>`;
    return;
  }
  ctrl.innerHTML = `
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
if ($("btn-mp-add-ai")) $("btn-mp-add-ai").onclick = () => mpSend({ action: "add_ai" });
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
        <input id="mp-hw-hint" class="text-input" placeholder="한글 명사 힌트 입력 (95%↑ 조기종료)" />
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
