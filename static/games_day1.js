// ===========================================================================
// DAY 1 GAMES: 양자택일 (Main Match) & 무거운 13 (Prison Match)
// ===========================================================================

// ---------------------------------------------------------------------------
// 1. 양자택일 (Choice Dilemma - 6 Rounds, 7 Players)
// ---------------------------------------------------------------------------
let chState = null;

function startChoiceGame() {
  const myName = ($("input-name") && $("input-name").value.trim()) || "나";
  chState = {
    round: 1,
    maxRounds: 6,
    prize: 0,
    betrayRate: 0.3,
    players: [
      { name: myName, isMe: true, score: 0, last: "-" },
      { name: "VIPER", isMe: false, score: 0, last: "-", greed: 0.45 },
      { name: "NOVA", isMe: false, score: 0, last: "-", greed: 0.25 },
      { name: "KRONOS", isMe: false, score: 0, last: "-", greed: 0.55 },
      { name: "ORION", isMe: false, score: 0, last: "-", greed: 0.35 },
      { name: "ZEPHYR", isMe: false, score: 0, last: "-", greed: 0.4 },
      { name: "ATLAS", isMe: false, score: 0, last: "-", greed: 0.2 },
    ],
    done: false,
  };
  showScreen("choice");
  renderChoice();
  if (typeof SFX !== "undefined") SFX.dice();
}

function renderChoice() {
  if (!chState) return;
  $("ch-round").textContent = `R${Math.min(chState.round, chState.maxRounds)} / ${chState.maxRounds}`;
  $("ch-prize").textContent = `공동상금 ${(chState.prize * 0.5).toFixed(1)}억`;
  $("ch-my-score").textContent = chState.players[0].score;

  const themes = [
    "ROUND 1 · 신뢰의 시작",
    "ROUND 2 · 균열의 조짐",
    "ROUND 3 · 심리전 심화",
    "ROUND 4 · 배신의 유혹",
    "ROUND 5 · 막판 역전전",
    "ROUND 6 · 최후의 선택",
  ];
  $("ch-theme").textContent = chState.done ? "GAME OVER · 최종 결과" : themes[chState.round - 1];

  const grid = $("ch-scoreboard");
  grid.innerHTML = "";
  const sorted = [...chState.players].sort((a, b) => b.score - a.score);
  sorted.forEach((p, idx) => {
    const div = document.createElement("div");
    div.className = "d1-pcell" + (p.isMe ? " me" : "");
    div.innerHTML = `<span>${idx + 1}위 ${p.name} <small style="opacity:0.75;">(${p.last})</small></span><strong>${p.score}점</strong>`;
    grid.appendChild(div);
  });

  const act = $("ch-actions");
  if (chState.done) {
    act.innerHTML = `
      <div class="action-row cols-2">
        <button type="button" class="btn btn-gold" onclick="startChoiceGame()">다시 하기</button>
        <button type="button" class="btn btn-outline" onclick="showScreen('hub')">게임 목록</button>
      </div>
    `;
  } else {
    act.innerHTML = `
      <div class="action-row cols-2">
        <button type="button" class="act-btn act-hit" onclick="playChoiceRound('public')">🤝 공공의 이익</button>
        <button type="button" class="act-btn act-fold" onclick="playChoiceRound('private')">😈 개인의 이익</button>
      </div>
    `;
  }
}

function playChoiceRound(myPick) {
  if (!chState || chState.done) return;
  const picks = chState.players.map((p) => {
    if (p.isMe) return myPick;
    // AI adapts greed based on previous betrayals & final round pressure
    const roundBoost = chState.round >= 5 ? 0.15 : 0;
    const probPrivate = Math.min(0.85, p.greed + chState.betrayRate * 0.25 + roundBoost);
    return Math.random() < probPrivate ? "private" : "public";
  });

  const pubCount = picks.filter((x) => x === "public").length;
  const privCount = picks.length - pubCount;
  const majoritySuccess = pubCount >= 4;

  chState.players.forEach((p, i) => {
    const pk = picks[i];
    p.last = pk === "public" ? "🤝공공" : "😈개인";
    if (majoritySuccess) {
      if (pk === "public") p.score += 3;
      else p.score += 5;
    } else {
      if (pk === "private") p.score += privCount >= 6 ? 2 : 5;
    }
  });

  if (majoritySuccess) {
    chState.prize += 1;
    $("ch-banner").textContent = `✅ 과반 성공! (공공 ${pubCount}명 vs 개인 ${privCount}명)`;
    $("ch-log").textContent = `공동상금 +0.5억 누적! 공공 +3점 / 개인 +5점`;
    if (typeof SFX !== "undefined") SFX.stay();
  } else {
    $("ch-banner").textContent = `💥 과반 실패! (공공 ${pubCount}명 vs 개인 ${privCount}명)`;
    $("ch-log").textContent = `공공 선택자 0점! 개인 선택자만 +${privCount >= 6 ? 2 : 5}점 획득`;
    if (typeof SFX !== "undefined") SFX.bust();
  }

  chState.betrayRate = privCount / picks.length;
  if (chState.round >= chState.maxRounds) {
    chState.done = true;
    const sorted = [...chState.players].sort((a, b) => b.score - a.score);
    const champ = sorted[0];
    $("ch-banner").textContent = `🏆 최종 1위: ${champ.name} (${champ.score}점 · 연맹의 징표 획득!)`;
    if (typeof SFX !== "undefined") {
      if (champ.isMe) SFX.win();
      else SFX.chip();
    }
  } else {
    chState.round += 1;
  }
  renderChoice();
}

// ---------------------------------------------------------------------------
// 2. 무거운 13 (Heavy 13 - 14 Rounds, 4 Players, 3 Pedestals)
// ---------------------------------------------------------------------------
let h13State = null;

function makeH13Set() {
  return {
    cards: [0, 1, 2, 3, 4, 5, 6],
    chips: { red: 2, green: 2, blue: 2, rainbow: 1 },
  };
}

function startHeavy13Game() {
  const myName = ($("input-name") && $("input-name").value.trim()) || "나";
  h13State = {
    round: 1,
    maxRounds: 14,
    pedestals: {
      red: { sum: 0, count: 0, boom: false },
      green: { sum: 0, count: 0, boom: false },
      blue: { sum: 0, count: 0, boom: false },
    },
    players: [
      { name: myName, isMe: true, penalty: 0, ...makeH13Set(), last: "-" },
      { name: "VIPER", isMe: false, penalty: 0, ...makeH13Set(), last: "-" },
      { name: "NOVA", isMe: false, penalty: 0, ...makeH13Set(), last: "-" },
      { name: "KRONOS", isMe: false, penalty: 0, ...makeH13Set(), last: "-" },
    ],
    selCard: null,
    selChip: null,
    selRainbowColor: "red",
    done: false,
  };
  showScreen("heavy13");
  renderHeavy13();
  if (typeof SFX !== "undefined") SFX.dice();
}

function renderHeavy13() {
  if (!h13State) return;
  const me = h13State.players[0];
  $("h13-round").textContent = `R${Math.min(h13State.round, h13State.maxRounds)} / ${h13State.maxRounds}`;
  $("h13-refill").textContent = h13State.round <= 7 ? "세트 1 (R1~7)" : "세트 2 (R8~14)";
  $("h13-my-pen").textContent = me.penalty;

  // Pedestals
  const peds = $("h13-pedestals");
  const meta = [
    ["red", "🔴 빨강"],
    ["green", "🟢 초록"],
    ["blue", "🔵 파랑"],
  ];
  peds.innerHTML = meta
    .map(([key, label]) => {
      const ped = h13State.pedestals[key];
      return `
        <div class="ped-box ${key} ${ped.boom ? "boom" : ""}">
          <span class="ped-name">${label}</span>
          <span class="ped-sum">${ped.sum}</span>
          <span class="ped-cnt">바위 ${ped.count}장 / 13</span>
        </div>
      `;
    })
    .join("");

  // Players
  const pg = $("h13-players");
  pg.innerHTML = h13State.players
    .map((p) => {
      return `
        <div class="d1-pcell ${p.isMe ? "me" : ""}">
          <span>${p.name} <small style="opacity:0.75;">${p.last}</small></span>
          <strong style="color:${p.penalty > 0 ? "#ff7675" : "#5ee695"};">벌점 ${p.penalty}</strong>
        </div>
      `;
    })
    .join("");

  // Cards
  const cardRow = $("h13-cards");
  cardRow.innerHTML = "";
  [0, 1, 2, 3, 4, 5, 6].forEach((val) => {
    const has = me.cards.includes(val);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "h13-btn" + (h13State.selCard === val ? " selected" : "");
    btn.textContent = val;
    btn.disabled = !has || h13State.done;
    btn.onclick = () => {
      h13State.selCard = val;
      if (typeof SFX !== "undefined") SFX.cardFlip();
      renderHeavy13();
    };
    cardRow.appendChild(btn);
  });

  // Chips
  const chipRow = $("h13-chips");
  chipRow.innerHTML = "";
  const chipMeta = [
    ["red", "🔴 빨강"],
    ["green", "🟢 초록"],
    ["blue", "🔵 파랑"],
    ["rainbow", "🌈 레인보우"],
  ];
  chipMeta.forEach(([key, label]) => {
    const cnt = me.chips[key];
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "h13-chip" + (h13State.selChip === key ? " selected" : "");
    btn.textContent = `${label} (${cnt})`;
    btn.disabled = cnt <= 0 || h13State.done;
    btn.onclick = () => {
      h13State.selChip = key;
      if (typeof SFX !== "undefined") SFX.chip();
      renderHeavy13();
    };
    chipRow.appendChild(btn);
  });

  // Rainbow target selector
  const rbBox = $("h13-rainbow-pick");
  rbBox.classList.toggle("hidden", h13State.selChip !== "rainbow" || h13State.done);
  rbBox.querySelectorAll(".rb-target").forEach((b) => {
    b.classList.toggle("active", b.dataset.color === h13State.selRainbowColor);
    b.onclick = () => {
      h13State.selRainbowColor = b.dataset.color;
      renderHeavy13();
    };
  });

  const sub = $("btn-h13-submit");
  if (h13State.done) {
    sub.disabled = false;
    sub.textContent = "다시 하기 ↺";
    sub.onclick = () => startHeavy13Game();
  } else {
    sub.disabled = h13State.selCard === null || h13State.selChip === null;
    sub.textContent = "선택 완료 · 동시 제출";
    sub.onclick = () => resolveHeavy13Round();
  }
}

function resolveHeavy13Round() {
  if (!h13State || h13State.done) return;
  Object.values(h13State.pedestals).forEach((p) => (p.boom = false));

  // Gather moves from all 4 players
  const moves = h13State.players.map((p, idx) => {
    let card, chip, targetColor;
    if (p.isMe) {
      card = h13State.selCard;
      chip = h13State.selChip;
      targetColor = chip === "rainbow" ? h13State.selRainbowColor : chip;
    } else {
      // Smart AI: pick safest chip + card combination
      const availChips = Object.keys(p.chips).filter((k) => p.chips[k] > 0);
      chip = availChips[Math.floor(Math.random() * availChips.length)];
      targetColor = chip === "rainbow"
        ? ["red", "green", "blue"].sort((a, b) => h13State.pedestals[a].sum - h13State.pedestals[b].sum)[0]
        : chip;
      const curSum = h13State.pedestals[targetColor].sum;
      const safeCards = p.cards.filter((c) => curSum + c < 13);
      card = safeCards.length
        ? safeCards[Math.floor(Math.random() * safeCards.length)]
        : Math.min(...p.cards);
    }
    // Consume card & chip
    p.cards.splice(p.cards.indexOf(card), 1);
    p.chips[chip] -= 1;
    const colorEmoji = targetColor === "red" ? "🔴" : targetColor === "green" ? "🟢" : "🔵";
    p.last = `${chip === "rainbow" ? "🌈→" : ""}${colorEmoji}${card}`;
    return { player: p, idx, card, isRainbow: chip === "rainbow", targetColor };
  });

  // Sort order: rainbow first, then highest card value, then seat order
  moves.sort((a, b) => {
    if (a.isRainbow !== b.isRainbow) return a.isRainbow ? -1 : 1;
    if (b.card !== a.card) return b.card - a.card;
    return a.idx - b.idx;
  });

  const booms = [];
  moves.forEach((m) => {
    const ped = h13State.pedestals[m.targetColor];
    if (ped.sum + m.card >= 13) {
      const pen = ped.count;
      m.player.penalty += pen;
      ped.sum = 0;
      ped.count = 0;
      ped.boom = true;
      booms.push(`${m.player.name} 💥 (+${pen}벌점)`);
    } else {
      ped.sum += m.card;
      ped.count += 1;
    }
  });

  if (booms.length > 0) {
    $("h13-banner").textContent = `💥 임계점 13 폭발! ${booms.join(", ")}`;
    if (typeof SFX !== "undefined") SFX.bust();
  } else {
    $("h13-banner").textContent = `✅ 라운드 ${h13State.round} 전원 무사 통과!`;
    if (typeof SFX !== "undefined") SFX.stay();
  }
  $("h13-log").textContent = "배치 순서: " + moves.map((m) => `${m.player.name}(${m.card})`).join(" → ");

  h13State.selCard = null;
  h13State.selChip = null;

  if (h13State.round >= h13State.maxRounds) {
    h13State.done = true;
    const sorted = [...h13State.players].sort((a, b) => a.penalty - b.penalty);
    const champ = sorted[0];
    $("h13-banner").textContent = `🏆 우승: ${champ.name} (최소 벌점 ${champ.penalty}점!)`;
    if (typeof SFX !== "undefined") {
      if (champ.isMe) SFX.win();
      else SFX.chip();
    }
  } else {
    h13State.round += 1;
    if (h13State.round === 8) {
      h13State.players.forEach((p) => {
        const fresh = makeH13Set();
        p.cards = fresh.cards;
        p.chips = fresh.chips;
      });
      $("h13-log").textContent = "🔄 8라운드 시작! 모든 플레이어의 바위 카드와 칩이 리필되었습니다!";
    }
  }
  renderHeavy13();
}
