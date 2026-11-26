// ===========================================================================
// FINAL ROUND 3: 수식 신호등 (Equation Traffic Light — Solo / AI Duel / Friend 1:1)
// ===========================================================================

const FL_EQUATIONS = [
  "2^5+18=50", "3^3+15=42", "2^6-19=45", "5^2+17=42", "9^2-37=44",
  "4^3-28=36", "7^2+26=75", "8^2-29=35", "3^4-18=63", "5^3-48=77",
  "6^2+49=85", "7^2-13=36", "8^2+19=83", "9^2-16=65", "2^7-39=89",
  "2^4+68=84", "4^3+29=93", "5^2+68=93", "6^2-18=18", "2^3×11=88",
  "12×7-9=75", "48÷6+7=15", "96÷8+5=17", "125-48=77", "36×2-8=64",
  "72÷9×8=64", "14×6-9=75", "84÷7+9=21", "144÷12=12", "124-57=67",
  "56+78=134", "67+89=156", "49+76=125", "83+59=142", "11×8-9=79",
  "13×7-6=85", "15×6-8=82", "16×5-7=73", "17×4+9=77", "19×5-8=87",
  "63÷7×9=81", "54÷6×8=72", "81÷9×7=63", "45÷5×9=81",
];

let flState = null;
let flPollTimer = null;
let flPollBusy = false;
let flLastServerSig = "";
let flAnimateRowIdx = -1;

function flStopPoll() {
  if (flPollTimer) {
    clearInterval(flPollTimer);
    flPollTimer = null;
  }
}

function flExitToHub() {
  flStopPoll();
  showScreen("hub");
}

function evaluateTrafficLight(guess, answer) {
  const res = Array(9).fill("r");
  const rem = {};
  for (let i = 0; i < 9; i++) {
    if (guess[i] === answer[i]) {
      res[i] = "g";
    } else {
      rem[answer[i]] = (rem[answer[i]] || 0) + 1;
    }
  }
  for (let i = 0; i < 9; i++) {
    if (res[i] === "g") continue;
    const ch = guess[i];
    if (rem[ch] && rem[ch] > 0) {
      res[i] = "y";
      rem[ch] -= 1;
    }
  }
  return res;
}

function rebuildFlKeyColors(guesses) {
  const keyColors = {};
  const rank = { "": 0, r: 1, y: 2, g: 3 };
  guesses.forEach((g) => {
    for (let i = 0; i < 9; i++) {
      const ch = g.text[i];
      const col = g.colors[i];
      if (rank[col] > rank[keyColors[ch] || ""]) keyColors[ch] = col;
    }
  });
  return keyColors;
}

function startFormulaLightGame(mode = "duel") {
  flStopPoll();
  flLastServerSig = "";
  flAnimateRowIdx = -1;
  const answer = FL_EQUATIONS[Math.floor(Math.random() * FL_EQUATIONS.length)];
  flState = {
    mode,
    answer,
    guesses: [],
    input: "",
    keyColors: {},
    aiProgress: Array(9).fill(""),
    aiSolvedCount: 0,
    done: false,
    won: false,
    // Friend 1:1 multiplayer fields
    roomId: "",
    playerId: "",
    hostId: "",
    mpPhase: "IDLE", // IDLE, WAITING, SETUP, PLAYING, DONE
    secretSet: false,
    mySecret: "",
    oppSecretSet: false,
    oppName: "",
    oppTries: 0,
    oppColors: Array(9).fill(""),
    winnerName: "",
    winnerId: "",
    revealedAnswer: "",
  };
  document.querySelectorAll(".fl-mode-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.mode === mode);
  });
  showScreen("formula-light");
  if (mode === "friend") {
    $("fl-banner").textContent = "👥 친구와 1:1 대결! 방을 만들거나 4자리 코드로 입장하세요.";
    $("fl-log").textContent = "방이 시작되면 먼저 9칸 초록불을 켜는 쪽이 우승합니다!";
  } else if (mode === "duel") {
    $("fl-banner").textContent = "⚔️ 결승 3회전 시작! AI보다 먼저 9칸 수식을 맞히세요!";
    $("fl-log").textContent = "계산이 틀린 더미 수식도 제출 가능 · 0으로 시작하는 수 없음";
  } else {
    $("fl-banner").textContent = "🎯 숨겨진 9칸 수식을 최소 횟수로 추리하세요!";
    $("fl-log").textContent = "계산이 틀린 더미 수식도 제출 가능 · 0으로 시작하는 수 없음";
  }
  renderFormulaLight();
  if (typeof SFX !== "undefined") SFX.dice();
}

function renderFormulaLight() {
  if (!flState) return;
  $("fl-tries").textContent = flState.guesses.length;

  // Friend 1:1 Box visibility
  const fBox = $("fl-friend-box");
  const isFriend = flState.mode === "friend";
  const showEntry = isFriend && flState.mpPhase === "IDLE";
  const showWait = isFriend && flState.mpPhase === "WAITING";
  const showSetup = isFriend && flState.mpPhase === "SETUP";
  fBox.classList.toggle("hidden", !(showEntry || showWait || showSetup));
  $("fl-friend-entry").classList.toggle("hidden", !showEntry);
  $("fl-friend-wait").classList.toggle("hidden", !showWait);
  if ($("fl-friend-setup")) $("fl-friend-setup").classList.toggle("hidden", !showSetup);
  if (showWait) {
    $("fl-wait-code").textContent = flState.roomId;
  }
  if (showSetup) {
    $("fl-setup-status").textContent = flState.secretSet
      ? `✅ 내 수식 [${flState.mySecret}] 출제 완료! ${flState.oppName || "상대"} 출제 대기 중...`
      : `🔐 ${flState.oppName || "상대"}이(가) 맞힐 내 9칸 비밀 수식을 입력하세요!`;
    $("btn-fl-rand-secret").disabled = flState.secretSet;
    $("btn-fl-confirm-secret").disabled = flState.secretSet;
  }

  // Rival progress bar (AI duel OR Friend playing/done)
  const aiBar = $("fl-ai-bar");
  const showRival = flState.mode === "duel" || (isFriend && (flState.mpPhase === "PLAYING" || flState.mpPhase === "DONE"));
  aiBar.classList.toggle("hidden", !showRival);
  if (showRival) {
    if (isFriend) {
      $("fl-rival-label").textContent = `🔥 ${flState.oppName || "친구"} (${flState.oppTries}회 · 내 출제: ${flState.mySecret})`;
      $("fl-ai-dots").innerHTML = flState.oppColors.map((c) => `<span class="fl-ai-dot ${c}"></span>`).join("");
    } else {
      $("fl-rival-label").textContent = "🤖 결승 상대 AI 추리 현황";
      $("fl-ai-dots").innerHTML = flState.aiProgress.map((c) => `<span class="fl-ai-dot ${c}"></span>`).join("");
    }
  }

  // Board
  const board = $("fl-board");
  board.innerHTML = "";
  const canPlayBoard = !isFriend || flState.mpPhase === "SETUP" || flState.mpPhase === "PLAYING" || flState.mpPhase === "DONE";
  if (canPlayBoard) {
    flState.guesses.forEach((g, rIdx) => {
      const row = document.createElement("div");
      row.className = "fl-row";
      const isNew = rIdx === flAnimateRowIdx;
      for (let i = 0; i < 9; i++) {
        const cell = document.createElement("div");
        cell.className = `fl-cell ${g.colors[i]}` + (isNew ? " pop-new" : "");
        cell.textContent = g.text[i];
        row.appendChild(cell);
      }
      board.appendChild(row);
    });
    flAnimateRowIdx = -1;

    if (!flState.done && !(showSetup && flState.secretSet)) {
      const row = document.createElement("div");
      row.className = "fl-row";
      for (let i = 0; i < 9; i++) {
        const cell = document.createElement("div");
        cell.className = "fl-cell" + (i === flState.input.length ? " active-input" : "");
        cell.textContent = flState.input[i] || "";
        row.appendChild(cell);
      }
      board.appendChild(row);
    }
  }
  board.scrollTop = board.scrollHeight;

  // Keypad
  const kp = $("fl-keypad");
  kp.innerHTML = "";
  if (isFriend && (flState.mpPhase === "IDLE" || flState.mpPhase === "WAITING" || (showSetup && flState.secretSet))) {
    return;
  }

  if (flState.done) {
    if (isFriend) {
      const isHost = flState.playerId === flState.hostId;
      kp.innerHTML = `
        <div class="action-row cols-2">
          ${isHost ? `<button type="button" class="btn btn-gold" onclick="flFriendRestart()">🔄 친구와 재경기</button>` : `<div class="wait-pill">방장이 재경기를 누르면 시작됩니다</div>`}
          <button type="button" class="btn btn-outline" onclick="flExitToHub()">게임 목록</button>
        </div>
      `;
    } else {
      kp.innerHTML = `
        <div class="action-row cols-2">
          <button type="button" class="btn btn-gold" onclick="startFormulaLightGame('${flState.mode}')">새 수식으로 다시 하기 ↺</button>
          <button type="button" class="btn btn-outline" onclick="flExitToHub()">게임 목록</button>
        </div>
      `;
    }
    return;
  }

  const row1 = ["1", "2", "3", "4", "5"];
  const row2 = ["6", "7", "8", "9", "0"];
  const row3 = ["+", "-", "×", "÷", "^", "="];

  [row1, row2].forEach((keys) => {
    const r = document.createElement("div");
    r.className = "fl-key-row nums";
    keys.forEach((k) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "fl-key " + (flState.keyColors[k] || "");
      b.textContent = k;
      b.onclick = () => flPressKey(k);
      r.appendChild(b);
    });
    kp.appendChild(r);
  });

  const r3 = document.createElement("div");
  r3.className = "fl-key-row ops";
  row3.forEach((k) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "fl-key op " + (flState.keyColors[k] || "");
    b.textContent = k;
    b.onclick = () => flPressKey(k);
    r3.appendChild(b);
  });
  const bk = document.createElement("button");
  bk.type = "button";
  bk.className = "fl-key";
  bk.textContent = "⌫";
  bk.onclick = () => flPressKey("BACK");
  r3.appendChild(bk);

  const sub = document.createElement("button");
  sub.type = "button";
  sub.className = "fl-key submit";
  sub.style.gridColumn = "span 1";
  sub.textContent = "제출";
  sub.onclick = () => flSubmit();
  r3.appendChild(sub);
  kp.appendChild(r3);
}

function flPressKey(k) {
  if (!flState || flState.done) return;
  if (flState.mode === "friend" && flState.mpPhase !== "PLAYING" && !(flState.mpPhase === "SETUP" && !flState.secretSet)) return;
  if (k === "BACK") {
    flState.input = flState.input.slice(0, -1);
  } else if (flState.input.length < 9) {
    flState.input += k;
    if (typeof SFX !== "undefined") SFX.chip();
  }
  renderFormulaLight();
}

async function flSubmit() {
  if (!flState || flState.done) return;
  if (flState.mode === "friend" && flState.mpPhase === "SETUP") {
    return flConfirmSecret();
  }
  if (flState.input.length !== 9) {
    $("fl-banner").textContent = "⚠️ 9칸을 모두 채워야 제출할 수 있습니다!";
    if (typeof SFX !== "undefined") SFX.fold();
    return;
  }

  const guess = flState.input;
  flState.input = "";

  // Friend 1:1 Server Submit
  if (flState.mode === "friend") {
    if (flState.mpPhase !== "PLAYING") return;
    try {
      const res = await fetch(`/api/fl/${flState.roomId}/guess`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ player_id: flState.playerId, guess }),
      });
      const out = await res.json();
      if (out.data) flApplyServerData(out.data, true);
    } catch (_) {}
    return;
  }

  // Local Solo / AI Duel Submit
  const colors = evaluateTrafficLight(guess, flState.answer);
  flState.guesses.push({ text: guess, colors });
  flAnimateRowIdx = flState.guesses.length - 1;
  flState.keyColors = rebuildFlKeyColors(flState.guesses);

  const greens = colors.filter((c) => c === "g").length;
  const yellows = colors.filter((c) => c === "y").length;

  if (greens === 9) {
    flState.done = true;
    flState.won = true;
    $("fl-banner").textContent = `🏆 정답 적중! (${flState.guesses.length}회 만에 결승전 우승!)`;
    $("fl-log").textContent = `정답 수식: ${flState.answer}`;
    if (typeof SFX !== "undefined") SFX.win();
    renderFormulaLight();
    return;
  }

  if (flState.mode === "duel") {
    const t = flState.guesses.length;
    const gain = t >= 6 ? 2 : (Math.random() < 0.7 ? 2 : 1);
    flState.aiSolvedCount = Math.min(9, flState.aiSolvedCount + gain);
    flState.aiProgress = Array.from({ length: 9 }, (_, i) => {
      if (i < flState.aiSolvedCount) return "g";
      return Math.random() < 0.45 ? "y" : "r";
    });
    if (flState.aiSolvedCount >= 9 && t >= 6) {
      flState.done = true;
      flState.won = false;
      $("fl-banner").textContent = `💀 아쉽습니다! AI가 먼저 9칸 수식을 맞혔습니다.`;
      $("fl-log").textContent = `정답 수식 공개: ${flState.answer}`;
      if (typeof SFX !== "undefined") SFX.bust();
      renderFormulaLight();
      return;
    }
  }

  $("fl-banner").textContent = `🟩 초록 ${greens}개 · 🟨 노랑 ${yellows}개 · 🟥 빨강 ${9 - greens - yellows}개`;
  $("fl-log").textContent =
    flState.mode === "duel"
      ? `AI도 초록불 ${flState.aiSolvedCount}/9개를 찾았습니다!`
      : `힌트를 조합해 다음 9칸 수식을 입력하세요.`;
  if (typeof SFX !== "undefined") {
    if (greens >= 5) SFX.stay();
    else SFX.cardFlip();
  }
  renderFormulaLight();
}

// ---------------------------------------------------------------------------
// Friend 1:1 Multiplayer Polling & Actions
// ---------------------------------------------------------------------------
function flApplyServerData(d, fromSubmit = false) {
  if (!flState || flState.mode !== "friend") return;
  const sig = JSON.stringify([
    d.phase,
    d.winner_id,
    d.me ? d.me.secret_set : false,
    d.me ? d.me.guesses.length : 0,
    d.opp ? d.opp.name : "",
    d.opp ? d.opp.secret_set : false,
    d.opp ? d.opp.tries : 0,
    d.opp ? d.opp.last_colors : [],
  ]);
  if (!fromSubmit && sig === flLastServerSig) return;
  flLastServerSig = sig;

  const prevPhase = flState.mpPhase;
  const prevGuessLen = flState.guesses.length;
  flState.roomId = d.room_id;
  flState.hostId = d.host_id;
  flState.mpPhase = d.phase;
  flState.done = d.phase === "DONE";
  if (d.me) {
    flState.secretSet = Boolean(d.me.secret_set);
    flState.mySecret = d.me.my_secret || "";
    flState.guesses = d.me.guesses || [];
    if (flState.guesses.length > prevGuessLen) {
      flAnimateRowIdx = flState.guesses.length - 1;
    }
    flState.keyColors = rebuildFlKeyColors(flState.guesses);
    flState.revealedAnswer = d.me.target_answer || "";
  }
  if (d.opp) {
    flState.oppSecretSet = Boolean(d.opp.secret_set);
    flState.oppName = d.opp.name;
    flState.oppTries = d.opp.tries;
    flState.oppColors = d.opp.last_colors || Array(9).fill("");
  }

  if (prevPhase !== "SETUP" && d.phase === "SETUP") {
    flState.input = "";
    $("fl-banner").textContent = `🔐 ${flState.oppName}님 입장! 각자 상대가 맞힐 9칸 비밀 수식을 출제하세요!`;
    $("fl-log").textContent = "키패드로 직접 입력하거나 [🎲 추천 수식 자동 입력]을 누르세요.";
    if (typeof SFX !== "undefined") SFX.myTurn();
  } else if (prevPhase !== "PLAYING" && d.phase === "PLAYING") {
    flState.input = "";
    $("fl-banner").textContent = `⚔️ 출제 완료! ${flState.oppName}님의 비밀 9칸 수식을 먼저 맞히세요!`;
    $("fl-log").textContent = `내가 출제한 수식: ${flState.mySecret}`;
    if (typeof SFX !== "undefined") SFX.myTurn();
  } else if (d.phase === "DONE" && prevPhase !== "DONE") {
    const iWon = d.winner_id === flState.playerId;
    $("fl-banner").textContent = iWon
      ? `🏆 결승전 우승! ${flState.oppName}님의 비밀 수식을 먼저 맞혔습니다!`
      : `💀 ${d.winner_name}님이 내 수식을 먼저 맞혔습니다!`;
    $("fl-log").textContent = `상대 비밀 수식: ${flState.revealedAnswer}`;
    if (typeof SFX !== "undefined") {
      if (iWon) SFX.win();
      else SFX.bust();
    }
  } else if (fromSubmit && flState.guesses.length > 0) {
    const last = flState.guesses[flState.guesses.length - 1];
    const g = last.colors.filter((c) => c === "g").length;
    const y = last.colors.filter((c) => c === "y").length;
    $("fl-banner").textContent = `🟩 초록 ${g}개 · 🟨 노랑 ${y}개 · 🟥 빨강 ${9 - g - y}개`;
    if (typeof SFX !== "undefined") {
      if (g >= 5) SFX.stay();
      else SFX.cardFlip();
    }
  }
  renderFormulaLight();
}

function flStartPoll() {
  flStopPoll();
  flPollTimer = setInterval(async () => {
    if (!flState || flState.mode !== "friend" || !flState.roomId || !flState.playerId || flPollBusy) return;
    flPollBusy = true;
    try {
      const res = await fetch(`/api/fl/${flState.roomId}?player_id=${encodeURIComponent(flState.playerId)}`);
      if (res.ok) {
        const out = await res.json();
        if (out.data) flApplyServerData(out.data, false);
      }
    } catch (_) {
    } finally {
      flPollBusy = false;
    }
  }, 800);
}

function flShowFriendErr(msg) {
  const el = $("fl-friend-err");
  el.textContent = msg;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 3000);
}

async function flFriendCreate() {
  const name = ($("fl-nick").value || "방장").trim();
  const res = await fetch("/api/fl/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const out = await res.json();
  if (!res.ok || out.error) return flShowFriendErr(out.error || "방 생성 실패");
  flState.roomId = out.room_id;
  flState.playerId = out.player_id;
  flApplyServerData(out.data);
  flStartPoll();
}

async function flFriendJoin() {
  const name = ($("fl-nick").value || "도전자").trim();
  const code = ($("fl-code-in").value || "").trim().toUpperCase();
  if (code.length < 4) return flShowFriendErr("4자리 방 코드를 입력하세요.");
  const res = await fetch("/api/fl/join", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ room_id: code, name }),
  });
  const out = await res.json();
  if (!res.ok || out.error) return flShowFriendErr(out.error || "입장 실패");
  flState.roomId = out.room_id;
  flState.playerId = out.player_id;
  flApplyServerData(out.data);
  flStartPoll();
}

async function flFriendRestart() {
  if (!flState || !flState.roomId) return;
  const res = await fetch(`/api/fl/${flState.roomId}/restart`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ player_id: flState.playerId }),
  });
  const out = await res.json();
  if (out.data) {
    flState.input = "";
    flApplyServerData(out.data);
  }
}

async function flConfirmSecret() {
  if (!flState || flState.mpPhase !== "SETUP" || flState.secretSet) return;
  const errEl = $("fl-setup-err");
  const showErr = (m) => {
    errEl.textContent = m;
    errEl.classList.remove("hidden");
    setTimeout(() => errEl.classList.add("hidden"), 3000);
  };
  if (flState.input.length !== 9) return showErr("9칸 수식을 모두 입력하거나 추천 수식을 눌러주세요.");
  const res = await fetch(`/api/fl/${flState.roomId}/set_secret`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ player_id: flState.playerId, secret: flState.input }),
  });
  const out = await res.json();
  if (!res.ok || out.error) return showErr(out.error || "출제 실패");
  flState.input = "";
  if (typeof SFX !== "undefined") SFX.stay();
  flApplyServerData(out.data);
}

if ($("btn-fl-rand-secret")) {
  $("btn-fl-rand-secret").onclick = () => {
    if (!flState || flState.mpPhase !== "SETUP" || flState.secretSet) return;
    flState.input = FL_EQUATIONS[Math.floor(Math.random() * FL_EQUATIONS.length)];
    if (typeof SFX !== "undefined") SFX.dice();
    renderFormulaLight();
  };
}
if ($("btn-fl-confirm-secret")) $("btn-fl-confirm-secret").onclick = flConfirmSecret;

if ($("btn-fl-create")) $("btn-fl-create").onclick = flFriendCreate;
if ($("btn-fl-join")) $("btn-fl-join").onclick = flFriendJoin;
if ($("btn-fl-copy-code")) {
  $("btn-fl-copy-code").onclick = () => {
    navigator.clipboard?.writeText(flState.roomId);
    $("btn-fl-copy-code").textContent = "✅ 복사됨!";
    setTimeout(() => ($("btn-fl-copy-code").textContent = "📋 코드 복사"), 1800);
  };
}
if ($("btn-fl-copy-link")) {
  $("btn-fl-copy-link").onclick = () => {
    const url = `${location.origin}/?fl_room=${flState.roomId}`;
    navigator.clipboard?.writeText(url);
    $("btn-fl-copy-link").textContent = "✅ 링크 복사됨!";
    setTimeout(() => ($("btn-fl-copy-link").textContent = "🔗 초대 링크 복사"), 1800);
  };
}

// Mode switch buttons
document.querySelectorAll(".fl-mode-btn").forEach((btn) => {
  btn.addEventListener("click", () => startFormulaLightGame(btn.dataset.mode));
});

// Physical keyboard support
window.addEventListener("keydown", (e) => {
  const scr = $("screen-formula-light");
  if (!scr || !scr.classList.contains("active") || !flState || flState.done) return;
  if (document.activeElement && document.activeElement.tagName === "INPUT") return;
  if (e.key >= "0" && e.key <= "9") flPressKey(e.key);
  else if (e.key === "+" || e.key === "-" || e.key === "^" || e.key === "=") flPressKey(e.key);
  else if (e.key === "*" || e.key.toLowerCase() === "x") flPressKey("×");
  else if (e.key === "/") { e.preventDefault(); flPressKey("÷"); }
  else if (e.key === "Backspace") flPressKey("BACK");
  else if (e.key === "Enter") flSubmit();
});

// ---------------------------------------------------------------------------
// Formula Light Interactive 4-Slide Swipeable Guide & Simulator
// ---------------------------------------------------------------------------
let flGuideIdx = 0;
const FL_TOTAL_SLIDES = 4;

function setFlGuideSlide(idx) {
  flGuideIdx = Math.max(0, Math.min(FL_TOTAL_SLIDES - 1, idx));
  $("fl-guide-track").style.transform = `translateX(-${flGuideIdx * 100}%)`;
  const dots = $("fl-guide-dots");
  dots.innerHTML = "";
  for (let i = 0; i < FL_TOTAL_SLIDES; i++) {
    const d = document.createElement("span");
    d.className = "g-dot" + (i === flGuideIdx ? " active" : "");
    d.onclick = () => setFlGuideSlide(i);
    dots.appendChild(d);
  }
  $("btn-fl-guide-prev").style.opacity = flGuideIdx === 0 ? "0.35" : "1";
  $("btn-fl-guide-next").textContent = flGuideIdx === FL_TOTAL_SLIDES - 1 ? "게임하기 ▶" : "다음 ▶";
}

if ($("btn-fl-rules")) {
  $("btn-fl-rules").onclick = () => {
    setFlGuideSlide(0);
    $("modal-fl-rules").classList.remove("hidden");
  };
}
if ($("btn-close-fl-guide")) {
  $("btn-close-fl-guide").onclick = () => $("modal-fl-rules").classList.add("hidden");
}
if ($("modal-fl-rules")) {
  const bd = $("modal-fl-rules").querySelector(".modal-backdrop");
  if (bd) bd.onclick = () => $("modal-fl-rules").classList.add("hidden");
}
if ($("btn-fl-guide-prev")) $("btn-fl-guide-prev").onclick = () => setFlGuideSlide(flGuideIdx - 1);
if ($("btn-fl-guide-next")) {
  $("btn-fl-guide-next").onclick = () => {
    if (flGuideIdx === FL_TOTAL_SLIDES - 1) $("modal-fl-rules").classList.add("hidden");
    else setFlGuideSlide(flGuideIdx + 1);
  };
}

// Swipe gesture for FL Guide
let flTouchX = 0;
if ($("fl-guide-viewport")) {
  $("fl-guide-viewport").addEventListener("touchstart", (e) => { flTouchX = e.touches[0].clientX; }, { passive: true });
  $("fl-guide-viewport").addEventListener("touchend", (e) => {
    const diff = e.changedTouches[0].clientX - flTouchX;
    if (diff < -42) setFlGuideSlide(flGuideIdx + 1);
    else if (diff > 42) setFlGuideSlide(flGuideIdx - 1);
  });
}

// Slide 3 Simulator
function runFlSim(guess) {
  const ans = "2^5+18=50";
  const cols = evaluateTrafficLight(guess, ans);
  const row = $("fl-sim-row");
  row.innerHTML = "";
  for (let i = 0; i < 9; i++) {
    const c = document.createElement("div");
    c.className = `fl-cell ${cols[i]}`;
    c.textContent = guess[i];
    row.appendChild(c);
  }
  const g = cols.filter((x) => x === "g").length;
  const y = cols.filter((x) => x === "y").length;
  $("fl-sim-msg").textContent =
    g === 9
      ? "🏆 9칸 모두 초록불! 정답 적중!"
      : `🟩 ${g}개 · 🟨 ${y}개 · 🟥 ${9 - g - y}개 — 계산이 틀려도 힌트를 얻었습니다!`;
  if (typeof SFX !== "undefined") {
    if (g === 9) SFX.win();
    else SFX.cardFlip();
  }
}
if ($("btn-fl-sim-dummy")) $("btn-fl-sim-dummy").onclick = () => runFlSim("123456789");
if ($("btn-fl-sim-solve")) $("btn-fl-sim-solve").onclick = () => runFlSim("2^5+18=50");

// Auto-open Friend 1:1 if URL has ?fl_room=XXXX
const flUrlCode = new URLSearchParams(window.location.search).get("fl_room");
if (flUrlCode) {
  startFormulaLightGame("friend");
  if ($("fl-code-in")) $("fl-code-in").value = flUrlCode.toUpperCase();
}
