// ===========================================================================
// FINAL ROUND 3: 수식 신호등 (Equation Traffic Light — 9-char Equation Wordle)
// ===========================================================================

// All equations are strictly 9 characters, mathematically exact (^ > ×÷ > +-), no leading zeros.
const FL_EQUATIONS = [
  "2^5+18=50",
  "3^3+15=42",
  "2^6-19=45",
  "5^2+17=42",
  "9^2-37=44",
  "4^3-28=36",
  "7^2+26=75",
  "8^2-29=35",
  "3^4-18=63",
  "5^3-48=77",
  "6^2+49=85",
  "7^2-13=36",
  "8^2+19=83",
  "9^2-16=65",
  "2^7-39=89",
  "2^4+68=84",
  "4^3+29=93",
  "5^2+68=93",
  "6^2-18=18",
  "2^3×11=88",
  "12×7-9=75",
  "48÷6+7=15",
  "96÷8+5=17",
  "125-48=77",
  "36×2-8=64",
  "72÷9×8=64",
  "14×6-9=75",
  "84÷7+9=21",
  "144÷12=12",
  "124-57=67",
  "56+78=134",
  "67+89=156",
  "49+76=125",
  "83+59=142",
  "11×8-9=79",
  "13×7-6=85",
  "15×6-8=82",
  "16×5-7=73",
  "17×4+9=77",
  "19×5-8=87",
  "63÷7×9=81",
  "54÷6×8=72",
  "81÷9×7=63",
  "45÷5×9=81",
];

let flState = null;

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

function startFormulaLightGame(mode = "duel") {
  const answer = FL_EQUATIONS[Math.floor(Math.random() * FL_EQUATIONS.length)];
  flState = {
    mode,
    answer,
    guesses: [], // { text, colors }
    input: "",
    keyColors: {}, // char -> 'g' | 'y' | 'r'
    aiProgress: Array(9).fill(""), // visual traffic light for AI rival
    aiSolvedCount: 0,
    done: false,
    won: false,
  };
  document.querySelectorAll(".fl-mode-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.mode === mode);
  });
  showScreen("formula-light");
  $("fl-banner").textContent =
    mode === "duel"
      ? "⚔️ 결승 3회전 시작! AI보다 먼저 9칸 수식을 맞히세요!"
      : "🎯 숨겨진 9칸 수식을 최소 횟수로 추리하세요!";
  $("fl-log").textContent = "계산이 틀린 더미 수식도 제출 가능 · 0으로 시작하는 수 없음";
  renderFormulaLight();
  if (typeof SFX !== "undefined") SFX.dice();
}

function renderFormulaLight() {
  if (!flState) return;
  $("fl-tries").textContent = flState.guesses.length;

  // AI Bar
  const aiBar = $("fl-ai-bar");
  aiBar.classList.toggle("hidden", flState.mode !== "duel");
  if (flState.mode === "duel") {
    $("fl-ai-dots").innerHTML = flState.aiProgress
      .map((c) => `<span class="fl-ai-dot ${c}"></span>`)
      .join("");
  }

  // Board
  const board = $("fl-board");
  board.innerHTML = "";
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

  // Current active input row
  if (!flState.done) {
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
  if (flState.done) {
    kp.innerHTML = `
      <div class="action-row cols-2">
        <button type="button" class="btn btn-gold" onclick="startFormulaLightGame('${flState.mode}')">새 수식으로 다시 하기 ↺</button>
        <button type="button" class="btn btn-outline" onclick="showScreen('hub')">게임 목록</button>
      </div>
    `;
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
  if (k === "BACK") {
    flState.input = flState.input.slice(0, -1);
  } else if (flState.input.length < 9) {
    flState.input += k;
    if (typeof SFX !== "undefined") SFX.chip();
  }
  renderFormulaLight();
}

function flSubmit() {
  if (!flState || flState.done) return;
  if (flState.input.length !== 9) {
    $("fl-banner").textContent = "⚠️ 9칸을 모두 채워야 제출할 수 있습니다!";
    if (typeof SFX !== "undefined") SFX.fold();
    return;
  }

  const guess = flState.input;
  const colors = evaluateTrafficLight(guess, flState.answer);
  flState.guesses.push({ text: guess, colors });
  flState.input = "";

  // Update keyboard best color priority: g > y > r
  const rank = { "": 0, r: 1, y: 2, g: 3 };
  for (let i = 0; i < 9; i++) {
    const ch = guess[i];
    const col = colors[i];
    if (rank[col] > rank[flState.keyColors[ch] || ""]) {
      flState.keyColors[ch] = col;
    }
  }

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

  // Advance AI rival in duel mode (solves gradually over ~6-8 turns)
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

// Mode switch buttons
document.querySelectorAll(".fl-mode-btn").forEach((btn) => {
  btn.addEventListener("click", () => startFormulaLightGame(btn.dataset.mode));
});

// Physical keyboard support when on screen-formula-light
window.addEventListener("keydown", (e) => {
  const scr = $("screen-formula-light");
  if (!scr || !scr.classList.contains("active") || !flState || flState.done) return;
  if (e.key >= "0" && e.key <= "9") flPressKey(e.key);
  else if (e.key === "+" || e.key === "-" || e.key === "^" || e.key === "=") flPressKey(e.key);
  else if (e.key === "*" || e.key.toLowerCase() === "x") flPressKey("×");
  else if (e.key === "/") { e.preventDefault(); flPressKey("÷"); }
  else if (e.key === "Backspace") flPressKey("BACK");
  else if (e.key === "Enter") flSubmit();
});
