// ===========================================================================
// FINAL ROUND 3: 수식 신호등 (Equation Traffic Light — Solo, vs AI, & 1:1 Friend)
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

function rebuildKeyColors(guesses) {
  const rank = { "": 0, r: 1, y: 2, g: 3 };
  const map = {};
  guesses.forEach((g) => {
    for (let i = 0; i < 9; i++) {
      const ch = g.text[i];
      const col = g.colors[i];
      if (rank[col] > rank[map[ch] || ""]) map[ch] = col;
    }
  });
  return map;
}

function startFormulaLightGame(mode = "duel") {
  flStopPoll();
  const answer = FL_EQUATIONS[Math.floor(Math.random() * FL_EQUATIONS.length)];
  flState = {
    mode, // 'duel', 'solo', 'friend'
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
    remote: null,
  };
  document.querySelectorAll(".fl-mode-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.mode === mode);
  });
  showScreen("formula-light");
  if (mode === "friend") {
    $("fl-banner").textContent = "👥 친구 1:1 방을 만들거나 초대 코드로 입장하세요!";
    $("fl-log").textContent = "친구가 입장하면 실시간 9칸 수식 레이스가 즉시 시작됩니다.";
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

function flShowFriendErr(msg) {
  const el = $("fl-friend-err");
  if (!el) return;
  el.textContent = msg;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 3200);
}

async function flCreateRoom() {
  const name = ($("fl-nick") && $("fl-nick").value.trim()) || "방장";
  try {
    const res = await fetch("/api/fl/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const d = await res.json();
    if (!res.ok || d.error) return flShowFriendErr(d.error || "방 생성 실패");
    flState.roomId = d.room_id;
    flState.playerId = d.player_id;
    flApplyRemote(d.data);
    flStartPoll();
  } catch (_) {
    flShowFriendErr("네트워크 오류");
  }
}

async function flJoinRoom() {
  const name = ($("fl-nick") && $("fl-nick").value.trim()) || "도전자";
  const code = ($("fl-code-in") && $("fl-code-in").value.trim().toUpperCase()) || "";
  if (code.length < 4) return flShowFriendErr("4자리 방 코드를 입력하세요.");
  try {
    const res = await fetch("/api/fl/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room_id: code, name }),
    });
    const d = await res.json();
    if (!res.ok || d.error) return flShowFriendErr(d.error || "입장 실패");
    flState.roomId = d.room_id;
    flState.playerId = d.player_id;
    flApplyRemote(d.data);
    flStartPoll();
  } catch (_) {
    flShowFriendErr("네트워크 오류");
  }
}

function flStartPoll() {
  flStopPoll();
  flPollTimer = setInterval(async () => {
    if (!flState || flState.mode !== "friend" || !flState.roomId || flPollBusy) return;
    flPollBusy = true;
    try {
      const res = await fetch(`/api/fl/${flState.roomId}?player_id=${encodeURIComponent(flState.playerId)}`);
      if (res.ok) {
        const d = await res.json();
        if (d.data) flApplyRemote(d.data);
      }
    } catch (_) {
    } finally {
      flPollBusy = false;
    }
  }, 850);
}

function flApplyRemote(rem) {
  const prevPhase = flState.remote ? flState.remote.phase : "";
  flState.remote = rem;
  flState.guesses = rem.me ? rem.me.guesses : [];
  flState.keyColors = rebuildKeyColors(flState.guesses);
  flState.done = rem.phase === "DONE";
  flState.won = rem.winner_id === flState.playerId;

  if (rem.phase === "WAITING") {
    $("fl-banner").textContent = `👑 방 코드 [ ${rem.room_id} ] · 친구 입장 대기 중...`;
    $("fl-log").textContent = "초대 링크나 코드를 친구에게 보내주세요!";
  } else if (rem.phase === "PLAYING") {
    if (prevPhase === "WAITING" && typeof SFX !== "undefined") SFX.myTurn();
    const oppName = rem.opp ? rem.opp.name : "상대";
    const oppG = rem.opp ? rem.opp.best_greens : 0;
    $("fl-banner").textContent = `⚔️ ${oppName}님과 1:1 결승전 진행 중!`;
    $("fl-log").textContent = `${oppName}님 최고 기록: 초록불 ${oppG}/9개 (${rem.opp ? rem.opp.tries : 0}회 시도)`;
  } else if (rem.phase === "DONE") {
    if (prevPhase !== "DONE" && typeof SFX !== "undefined") {
      if (flState.won) SFX.win();
      else SFX.bust();
    }
    const myAns = rem.me && rem.me.target_answer ? rem.me.target_answer : "";
    $("fl-banner").textContent = flState.won
      ? `🏆 결승전 승리! ${rem.winner_name}님이 먼저 9칸을 맞혔습니다!`
      : `💀 패배! ${rem.winner_name}님이 먼저 정답을 맞혔습니다.`;
    $("fl-log").textContent = `내 문제 정답: ${myAns}`;
  }
  renderFormulaLight();
}

function renderFormulaLight() {
  if (!flState) return;
  $("fl-tries").textContent = flState.guesses.length;

  // Friend setup / wait panel
  const fBox = $("fl-friend-box");
  const isFriend = flState.mode === "friend";
  const inWaiting = isFriend && flState.remote && flState.remote.phase === "WAITING";
  const needsRoom = isFriend && !flState.roomId;
  fBox.classList.toggle("hidden", !(needsRoom || inWaiting));
  if (needsRoom) {
    $("fl-friend-entry").classList.remove("hidden");
    $("fl-friend-wait").classList.add("hidden");
  } else if (inWaiting) {
    $("fl-friend-entry").classList.add("hidden");
    $("fl-friend-wait").classList.remove("hidden");
    $("fl-wait-code").textContent = flState.roomId;
  }

  // Rival Bar (AI or Friend Playing/Done)
  const aiBar = $("fl-ai-bar");
  const showRival =
    flState.mode === "duel" ||
    (isFriend && flState.remote && flState.remote.opp && flState.remote.phase !== "WAITING");
  aiBar.classList.toggle("hidden", !showRival);
  if (showRival) {
    if (flState.mode === "duel") {
      $("fl-rival-label").textContent = "🤖 결승 상대 AI 추리 현황";
      $("fl-ai-dots").innerHTML = flState.aiProgress
        .map((c) => `<span class="fl-ai-dot ${c}"></span>`)
        .join("");
    } else {
      const opp = flState.remote.opp;
      $("fl-rival-label").textContent = `🔥 ${opp.name} (${opp.tries}회)`;
      $("fl-ai-dots").innerHTML = opp.last_colors
        .map((c) => `<span class="fl-ai-dot ${c}"></span>`)
        .join("");
    }
  }

  // Board
  const board = $("fl-board");
  board.innerHTML = "";
  const canInput = !flState.done && (!isFriend || (flState.remote && flState.remote.phase === "PLAYING"));

  flState.guesses.forEach((g) => {
    const row = document.createElement("div");
    row.className = "fl-row";
    for (let i = 0; i < 9; i++) {
      const cell = document.createElement("div");
      cell.className = `fl-cell ${g.colors[i]}`;
      cell.textContent = g.text[i];
      row.appendChild(cell);
    }
    board.appendChild(row);
  });

  if (canInput) {
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
  board.scrollTop = board.scrollHeight;

  // Keypad
  const kp = $("fl-keypad");
  kp.innerHTML = "";
  if (needsRoom || inWaiting) return;

  if (flState.done) {
    if (isFriend) {
      const isHost = flState.remote && flState.remote.host_id === flState.playerId;
      kp.innerHTML = `
        <div class="action-row cols-2">
          ${isHost ? '<button type="button" class="btn btn-gold" id="btn-fl-rematch">재경기 시작 ↺</button>' : '<div class="wait-pill">방장 재경기 대기 중</div>'}
          <button type="button" class="btn btn-outline" onclick="flExitToHub()">게임 목록</button>
        </div>
      `;
      if (isHost && $("btn-fl-rematch")) {
        $("btn-fl-rematch").onclick = async () => {
          const res = await fetch(`/api/fl/${flState.roomId}/restart`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ player_id: flState.playerId }),
          });
          if (res.ok) {
            const d = await res.json();
            flState.input = "";
            flApplyRemote(d.data);
          }
        };
      }
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
  if (flState.mode === "friend" && (!flState.remote || flState.remote.phase !== "PLAYING")) return;
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
  if (flState.input.length !== 9) {
    $("fl-banner").textContent = "⚠️ 9칸을 모두 채워야 제출할 수 있습니다!";
    if (typeof SFX !== "undefined") SFX.fold();
    return;
  }

  const guess = flState.input;
  flState.input = "";

  // Friend 1:1 multiplayer submit
  if (flState.mode === "friend") {
    try {
      const res = await fetch(`/api/fl/${flState.roomId}/guess`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ player_id: flState.playerId, guess }),
      });
      if (res.ok) {
        const d = await res.json();
        if (typeof SFX !== "undefined") SFX.cardFlip();
        flApplyRemote(d.data);
      }
    } catch (_) {}
    return;
  }

  // Solo / vs AI submit
  const colors = evaluateTrafficLight(guess, flState.answer);
  flState.guesses.push({ text: guess, colors });
  flState.keyColors = rebuildKeyColors(flState.guesses);

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

// Mode & Friend buttons
document.querySelectorAll(".fl-mode-btn").forEach((btn) => {
  btn.addEventListener("click", () => startFormulaLightGame(btn.dataset.mode));
});
if ($("btn-fl-create")) $("btn-fl-create").onclick = flCreateRoom;
if ($("btn-fl-join")) $("btn-fl-join").onclick = flJoinRoom;
if ($("btn-fl-copy-code")) {
  $("btn-fl-copy-code").onclick = () => {
    navigator.clipboard?.writeText(flState.roomId);
    $("btn-fl-copy-code").textContent = "✅ 코드 복사됨!";
    setTimeout(() => ($("btn-fl-copy-code").textContent = "📋 코드 복사"), 2000);
  };
}
if ($("btn-fl-copy-link")) {
  $("btn-fl-copy-link").onclick = () => {
    const url = `${location.origin}/?fl_room=${flState.roomId}`;
    navigator.clipboard?.writeText(url);
    $("btn-fl-copy-link").textContent = "✅ 링크 복사됨!";
    setTimeout(() => ($("btn-fl-copy-link").textContent = "🔗 초대 링크 복사"), 2000);
  };
}

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
// Formula Light Interactive 4-Slide Rule Guide & Simulator
// ---------------------------------------------------------------------------
let flGuideIdx = 0;
const FL_SLIDES = 4;

function setFlGuideSlide(idx) {
  flGuideIdx = Math.max(0, Math.min(FL_SLIDES - 1, idx));
  $("fl-guide-track").style.transform = `translateX(-${flGuideIdx * 100}%)`;
  const dots = $("fl-guide-dots");
  dots.innerHTML = "";
  for (let i = 0; i < FL_SLIDES; i++) {
    const d = document.createElement("span");
    d.className = "g-dot" + (i === flGuideIdx ? " active" : "");
    d.onclick = () => setFlGuideSlide(i);
    dots.appendChild(d);
  }
  $("btn-fl-guide-prev").style.opacity = flGuideIdx === 0 ? "0.35" : "1";
  $("btn-fl-guide-next").textContent = flGuideIdx === FL_SLIDES - 1 ? "게임하기 ▶" : "다음 ▶";
}

if ($("btn-fl-rules")) {
  $("btn-fl-rules").onclick = () => {
    setFlGuideSlide(0);
    $("modal-fl-rules").classList.remove("hidden");
  };
}
if ($("btn-fl-guide-prev")) $("btn-fl-guide-prev").onclick = () => setFlGuideSlide(flGuideIdx - 1);
if ($("btn-fl-guide-next")) {
  $("btn-fl-guide-next").onclick = () => {
    if (flGuideIdx === FL_SLIDES - 1) $("modal-fl-rules").classList.add("hidden");
    else setFlGuideSlide(flGuideIdx + 1);
  };
}

let flTouchX = 0;
const flVp = $("fl-guide-viewport");
if (flVp) {
  flVp.addEventListener("touchstart", (e) => (flTouchX = e.touches[0].clientX), { passive: true });
  flVp.addEventListener("touchend", (e) => {
    const d = e.changedTouches[0].clientX - flTouchX;
    if (d < -42) setFlGuideSlide(flGuideIdx + 1);
    else if (d > 42) setFlGuideSlide(flGuideIdx - 1);
  });
}

function runFlSim(guess) {
  const ans = "2^5+18=50";
  const cols = evaluateTrafficLight(guess, ans);
  const row = $("fl-sim-row");
  row.innerHTML = "";
  for (let i = 0; i < 9; i++) {
    const cell = document.createElement("div");
    cell.className = `fl-cell ${cols[i]}`;
    cell.textContent = guess[i];
    row.appendChild(cell);
  }
  const g = cols.filter((c) => c === "g").length;
  const y = cols.filter((c) => c === "y").length;
  $("fl-sim-msg").textContent =
    g === 9
      ? "🏆 9칸 모두 초록불! 결승전 승리!"
      : `🟩 초록 ${g} · 🟨 노랑 ${y} · 🟥 빨강 ${9 - g - y} (정답 2^5+18=50 기준)`;
  if (typeof SFX !== "undefined") {
    if (g === 9) SFX.win();
    else SFX.cardFlip();
  }
}

if ($("btn-fl-sim-dummy")) $("btn-fl-sim-dummy").onclick = () => runFlSim("123456789");
if ($("btn-fl-sim-solve")) $("btn-fl-sim-solve").onclick = () => runFlSim("2^5+18=50");

// Auto-open Formula Light Friend tab if ?fl_room=XXXX in URL
const flUrlCode = new URLSearchParams(window.location.search).get("fl_room");
if (flUrlCode) {
  startFormulaLightGame("friend");
  if ($("fl-code-in")) $("fl-code-in").value = flUrlCode.toUpperCase();
}

// Close Formula Light guide modal via X or backdrop
if ($("btn-close-fl-guide")) {
  $("btn-close-fl-guide").onclick = () => $("modal-fl-rules").classList.add("hidden");
}
const flModalBackdrop = document.querySelector("#modal-fl-rules .modal-backdrop");
if (flModalBackdrop) {
  flModalBackdrop.onclick = () => $("modal-fl-rules").classList.add("hidden");
}
