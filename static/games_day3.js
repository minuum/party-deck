// ===========================================================================
// DAY 3 GAMES: 보석 암시장 (Main Match) & 돼지 저금통 (Prison Match)
// ===========================================================================

// ---------------------------------------------------------------------------
// 1. 보석 암시장 (Gem Black Market — 5 Rounds, 5 Players, Manitto Multiplier)
// ---------------------------------------------------------------------------
const GM_CARDS = [
  { id: "dia", label: "💎 다이아", pts: 5, isBomb: false },
  { id: "gold", label: "🥇 금", pts: 4, isBomb: false },
  { id: "silver", label: "🥈 은", pts: 3, isBomb: false },
  { id: "bronze", label: "🥉 동", pts: 2, isBomb: false },
  { id: "bomb4", label: "💣 폭탄", pts: -4, isBomb: true },
  { id: "bomb6", label: "💥 대폭탄", pts: -6, isBomb: true },
];

let gmState = null;

function drawGmHand() {
  const pool = ["dia", "gold", "silver", "bronze", "bomb4", "bomb6"];
  return Array.from({ length: 3 }, () => {
    const pick = pool[Math.floor(Math.random() * pool.length)];
    return { ...GM_CARDS.find((c) => c.id === pick) };
  });
}

function startGemMarketGame() {
  const myName = ($("input-name") && $("input-name").value.trim()) || "나";
  const names = [myName, "VIPER", "NOVA", "KRONOS", "ORION"];
  // Assign circular secret manitto (everyone has a distinct manitto)
  const shift = 1 + Math.floor(Math.random() * 4);
  const players = names.map((n, i) => ({
    name: n,
    isMe: i === 0,
    pts: 2, // base 2 so multiplication stays interesting
    manittoIdx: (i + shift) % 5,
    hand: drawGmHand(),
  }));

  gmState = {
    round: 1,
    maxRounds: 5,
    players,
    buyers: pickGmBuyers(),
    selCardIdx: null,
    selTargetIdx: null,
    done: false,
  };
  showScreen("gem-market");
  $("gm-banner").textContent = "교환할 내 카드 1장과 상대방을 고르세요!";
  $("gm-log").textContent = `내 마니또 [${players[players[0].manittoIdx].name}]의 점수도 높아야 최종 점수가 폭발합니다!`;
  renderGemMarket();
  if (typeof SFX !== "undefined") SFX.dice();
}

function pickGmBuyers() {
  const gems = GM_CARDS.filter((c) => !c.isBomb);
  const shuffled = [...gems].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 2);
}

function renderGemMarket() {
  if (!gmState) return;
  const me = gmState.players[0];
  const myManitto = gmState.players[me.manittoIdx];
  $("gm-round").textContent = `R${Math.min(gmState.round, gmState.maxRounds)} / ${gmState.maxRounds}`;
  $("gm-manitto").textContent = `🤫 내 마니또: ${myManitto.name}`;
  $("gm-my-pts").textContent = me.pts;

  $("gm-buyers").innerHTML = gmState.buyers
    .map((b) => `<span class="gm-pill">${b.label} (+${b.pts})</span>`)
    .join("");

  $("gm-players").innerHTML = gmState.players
    .map((p, i) => {
      const isManitto = i === me.manittoIdx;
      const finalScore = gmState.done ? p.pts * gmState.players[p.manittoIdx].pts : null;
      return `
        <div class="d1-pcell ${p.isMe ? "me" : ""}">
          <span>${p.name}${isManitto ? " 🤫" : ""}</span>
          <strong>${gmState.done ? `최종 ${finalScore}점` : `${p.pts}점`}</strong>
        </div>
      `;
    })
    .join("");

  const handEl = $("gm-hand");
  handEl.innerHTML = "";
  me.hand.forEach((c, idx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "gm-card" + (c.isBomb ? " bomb" : "") + (gmState.selCardIdx === idx ? " selected" : "");
    btn.innerHTML = `<span>${c.label}</span><small>${c.pts > 0 ? `+${c.pts}` : c.pts}점</small>`;
    btn.disabled = gmState.done;
    btn.onclick = () => {
      gmState.selCardIdx = idx;
      if (typeof SFX !== "undefined") SFX.cardFlip();
      renderGemMarket();
    };
    handEl.appendChild(btn);
  });

  const tEl = $("gm-targets");
  tEl.innerHTML = "";
  gmState.players.forEach((p, idx) => {
    if (idx === 0) return;
    const isManitto = idx === me.manittoIdx;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "h13-chip" + (gmState.selTargetIdx === idx ? " selected" : "");
    btn.textContent = `${p.name}${isManitto ? " (마니또)" : ""}`;
    btn.disabled = gmState.done;
    btn.onclick = () => {
      gmState.selTargetIdx = idx;
      if (typeof SFX !== "undefined") SFX.chip();
      renderGemMarket();
    };
    tEl.appendChild(btn);
  });

  const goBtn = $("btn-gm-trade");
  if (gmState.done) {
    goBtn.disabled = false;
    goBtn.textContent = "다시 하기 ↺";
    goBtn.onclick = () => startGemMarketGame();
  } else {
    goBtn.disabled = gmState.selCardIdx === null || gmState.selTargetIdx === null;
    goBtn.textContent = "🤝 교환 및 라운드 정산";
    goBtn.onclick = () => resolveGemMarketRound();
  }
}

function resolveGemMarketRound() {
  if (!gmState || gmState.done) return;
  const me = gmState.players[0];
  const target = gmState.players[gmState.selTargetIdx];
  const buyerIds = new Set(gmState.buyers.map((b) => b.id));

  // Swap selected card with a random card from target
  const tCardIdx = Math.floor(Math.random() * target.hand.length);
  const mySent = me.hand[gmState.selCardIdx];
  const myGot = target.hand[tCardIdx];
  me.hand[gmState.selCardIdx] = myGot;
  target.hand[tCardIdx] = mySent;

  // Score all players for this round
  let myDelta = 0;
  gmState.players.forEach((p, i) => {
    let delta = 0;
    p.hand.forEach((c) => {
      if (c.isBomb) delta += c.pts;
      else if (buyerIds.has(c.id)) delta += c.pts;
    });
    p.pts = Math.max(0, p.pts + delta);
    if (i === 0) myDelta = delta;
  });

  $("gm-banner").textContent = `🤝 ${target.name}에게 [${mySent.label}] 전달 ↔ [${myGot.label}] 획득! (이번 라운드 ${myDelta >= 0 ? "+" : ""}${myDelta}점)`;

  gmState.selCardIdx = null;
  gmState.selTargetIdx = null;

  if (gmState.round >= gmState.maxRounds) {
    gmState.done = true;
    const ranked = gmState.players
      .map((p) => ({ name: p.name, isMe: p.isMe, final: p.pts * gmState.players[p.manittoIdx].pts, mName: gmState.players[p.manittoIdx].name }))
      .sort((a, b) => b.final - a.final);
    const champ = ranked[0];
    $("gm-banner").textContent = `🏆 마니또 곱셈 최종 1위: ${champ.name} (${champ.final}점)!`;
    $("gm-log").textContent = `최하위 탈락: ${ranked[ranked.length - 1].name} (${ranked[ranked.length - 1].final}점)`;
    if (typeof SFX !== "undefined") {
      if (champ.isMe) SFX.win();
      else SFX.chip();
    }
  } else {
    gmState.round += 1;
    gmState.buyers = pickGmBuyers();
    gmState.players.forEach((p) => (p.hand = drawGmHand()));
    $("gm-log").textContent = `라운드 ${gmState.round} 새 카드 배분 & 구매자 조건 갱신!`;
    if (typeof SFX !== "undefined") {
      if (myDelta >= 0) SFX.stay();
      else SFX.bust();
    }
  }
  renderGemMarket();
}

// ---------------------------------------------------------------------------
// 2. 돼지 저금통 (Piggy Bank — 5 Banks, Black/White Coin Memory & Doubt)
// ---------------------------------------------------------------------------
let pbState = null;

function startPiggyBankGame() {
  const myName = ($("input-name") && $("input-name").value.trim()) || "나";
  pbState = {
    turn: 1,
    askColor: "black", // alternates black -> white
    activeBankIdx: 0,
    phase: "MY_PUT", // MY_PUT, AI_ANSWERED, MY_ANSWER, DONE
    players: [
      { name: myName, isMe: true, score: 0 },
      { name: "VIPER", isMe: false, score: 0 },
      { name: "NOVA", isMe: false, score: 0 },
      { name: "KRONOS", isMe: false, score: 0 },
    ],
    banks: Array.from({ length: 5 }, (_, i) => ({ id: i + 1, black: 1, white: 1 })),
    // Temporary turn data
    putColor: "black",
    putCount: 2,
    putTargetIdx: 1,
    aiClaim: 0,
    aiResponderIdx: 1,
    done: false,
  };
  showScreen("piggy-bank");
  $("pb-banner").textContent = "🐷 모든 저금통은 ⚫1개, ⚪1개로 시작합니다!";
  $("pb-log").textContent = "1번 저금통에 동전을 넣고 상대에게 넘겨 암기력을 시험하세요!";
  renderPiggyBank();
  if (typeof SFX !== "undefined") SFX.dice();
}

function renderPiggyBank() {
  if (!pbState) return;
  const colLabel = pbState.askColor === "black" ? "⚫ 흑 동전" : "⚪ 백 동전";
  $("pb-turn").textContent = `턴 ${pbState.turn}`;
  $("pb-ask-color").textContent = `질문: ${colLabel}`;

  $("pb-scores").innerHTML = pbState.players
    .map((p) => `<div class="d1-pcell ${p.isMe ? "me" : ""}"><span>${p.name}</span><strong>${p.score} / 5점</strong></div>`)
    .join("");

  $("pb-banks").innerHTML = pbState.banks
    .map((b, i) => `
      <div class="pb-bank ${i === pbState.activeBankIdx ? "active" : ""}">
        <span class="pig">🐷</span>
        <span>#${b.id}</span>
        <span style="font-size:10px;color:#999;">${pbState.done ? `⚫${b.black} ⚪${b.white}` : "??"}</span>
      </div>
    `)
    .join("");

  const ctrl = $("pb-controls");
  ctrl.innerHTML = "";

  if (pbState.done) {
    ctrl.innerHTML = `
      <div class="action-row cols-2">
        <button type="button" class="btn btn-gold" onclick="startPiggyBankGame()">다시 하기 ↺</button>
        <button type="button" class="btn btn-outline" onclick="showScreen('hub')">게임 목록</button>
      </div>
    `;
    return;
  }

  if (pbState.phase === "MY_PUT") {
    ctrl.innerHTML = `
      <div class="h13-pick-label">#${pbState.activeBankIdx + 1} 저금통에 넣을 동전 색 &amp; 개수 (1~5개)</div>
      <div class="h13-row">
        <button type="button" class="h13-chip ${pbState.putColor === "black" ? "selected" : ""}" onclick="pbSetPut('color','black')">⚫ 흑 동전</button>
        <button type="button" class="h13-chip ${pbState.putColor === "white" ? "selected" : ""}" onclick="pbSetPut('color','white')">⚪ 백 동전</button>
      </div>
      <div class="h13-row">
        ${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="h13-btn ${pbState.putCount === n ? "selected" : ""}" onclick="pbSetPut('count',${n})">${n}</button>`).join("")}
      </div>
      <div class="h13-row">
        ${[1, 2, 3].map((idx) => `<button type="button" class="h13-chip ${pbState.putTargetIdx === idx ? "selected" : ""}" onclick="pbSetPut('target',${idx})">→ ${pbState.players[idx].name}</button>`).join("")}
      </div>
      <button type="button" class="btn btn-gold" style="padding:11px;" onclick="pbDoMyPut()">🐷 동전 넣고 전달하기</button>
    `;
  } else if (pbState.phase === "AI_ANSWERED") {
    const aiName = pbState.players[pbState.aiResponderIdx].name;
    ctrl.innerHTML = `
      <div class="wait-pill" style="color:#fff;">
        ${aiName}: "#${pbState.activeBankIdx + 1} 저금통의 ${colLabel}은(는) <strong>${pbState.aiClaim}개</strong>입니다!"
      </div>
      <div class="action-row cols-2">
        <button type="button" class="act-btn act-fold" onclick="pbJudgeAi(true)">🚨 의심! (틀렸다)</button>
        <button type="button" class="act-btn act-hit" onclick="pbJudgeAi(false)">✅ 통과 (맞는 듯)</button>
      </div>
    `;
  } else if (pbState.phase === "MY_ANSWER") {
    ctrl.innerHTML = `
      <div class="h13-pick-label">#${pbState.activeBankIdx + 1} 저금통의 현재 ${colLabel} 총개수는?</div>
      <div style="display:flex;gap:8px;">
        <input id="pb-ans-input" type="number" min="0" max="50" class="text-input" style="text-align:center;" placeholder="개수 입력" />
        <button type="button" class="btn btn-gold" style="white-space:nowrap;padding:0 18px;" onclick="pbSubmitMyAnswer()">대답하기</button>
      </div>
    `;
  }
}

function pbSetPut(field, val) {
  if (field === "color") pbState.putColor = val;
  if (field === "count") pbState.putCount = val;
  if (field === "target") pbState.putTargetIdx = val;
  if (typeof SFX !== "undefined") SFX.chip();
  renderPiggyBank();
}

function pbDoMyPut() {
  const bank = pbState.banks[pbState.activeBankIdx];
  bank[pbState.putColor] += pbState.putCount;
  const colTxt = pbState.putColor === "black" ? "⚫ 흑" : "⚪ 백";
  const actual = bank[pbState.askColor];
  // AI answers correctly 60% of the time, or errs by ±1..2
  const isWrong = Math.random() < 0.42;
  const delta = Math.random() < 0.5 ? 1 : -1;
  pbState.aiClaim = isWrong ? Math.max(0, actual + delta * (Math.random() < 0.5 ? 1 : 2)) : actual;
  pbState.aiResponderIdx = pbState.putTargetIdx;
  pbState.phase = "AI_ANSWERED";
  $("pb-banner").textContent = `🐷 #${bank.id}에 ${colTxt} ${pbState.putCount}개 투입 → ${pbState.players[pbState.putTargetIdx].name}에게 전달!`;
  $("pb-log").textContent = `${pbState.players[pbState.putTargetIdx].name}의 대답이 맞는지 의심 여부를 결정하세요!`;
  if (typeof SFX !== "undefined") SFX.cardFlip();
  renderPiggyBank();
}

function pbJudgeAi(doubt) {
  const bank = pbState.banks[pbState.activeBankIdx];
  const actual = bank[pbState.askColor];
  const ai = pbState.players[pbState.aiResponderIdx];
  const me = pbState.players[0];

  if (doubt) {
    if (pbState.aiClaim !== actual) {
      me.score += 1;
      ai.score -= 1;
      $("pb-banner").textContent = `🎯 의심 성공! 실제 ${actual}개 (AI 오답 ${pbState.aiClaim}개) → 나 +1점!`;
      if (typeof SFX !== "undefined") SFX.stay();
    } else {
      me.score -= 1;
      $("pb-banner").textContent = `💥 의심 실패! 실제 ${actual}개로 AI 정답! → 나 -1점`;
      if (typeof SFX !== "undefined") SFX.bust();
    }
  } else {
    $("pb-banner").textContent = `✅ 통과! (참고: 실제 개수는 비공개로 유지됩니다)`;
    if (typeof SFX !== "undefined") SFX.chip();
  }

  if (pbCheckWin()) return;
  pbStartAiTurn();
}

function pbStartAiTurn() {
  pbState.turn += 1;
  pbState.askColor = pbState.askColor === "black" ? "white" : "black";
  pbState.activeBankIdx = (pbState.activeBankIdx + 1) % 5;
  const bank = pbState.banks[pbState.activeBankIdx];
  const aiIdx = 1 + (pbState.turn % 3);
  const putCol = Math.random() < 0.5 ? "black" : "white";
  const putCnt = 1 + Math.floor(Math.random() * 4);
  bank[putCol] += putCnt;
  const colTxt = putCol === "black" ? "⚫ 흑" : "⚪ 백";
  pbState.phase = "MY_ANSWER";
  $("pb-log").textContent = `🤖 ${pbState.players[aiIdx].name}이(가) #${bank.id} 저금통에 ${colTxt} ${putCnt}개를 넣고 나에게 전달했습니다!`;
  renderPiggyBank();
}

function pbSubmitMyAnswer() {
  const val = parseInt(($("pb-ans-input") && $("pb-ans-input").value) || "-1", 10);
  if (isNaN(val) || val < 0) return;
  const bank = pbState.banks[pbState.activeBankIdx];
  const actual = bank[pbState.askColor];
  const me = pbState.players[0];
  const doubter = pbState.players[1 + Math.floor(Math.random() * 3)];

  if (val === actual) {
    // AI doubts 35% of the time and loses a point
    if (Math.random() < 0.35) {
      doubter.score -= 1;
      me.score += 1;
      $("pb-banner").textContent = `🎉 완벽한 암기! ${doubter.name}의 의심을 역으로 꺾었습니다! (+1점)`;
      if (typeof SFX !== "undefined") SFX.stay();
    } else {
      me.score += 1;
      $("pb-banner").textContent = `✅ 정답! (#${bank.id} ${pbState.askColor === "black" ? "⚫" : "⚪"} ${actual}개) 방어 성공 +1점!`;
      if (typeof SFX !== "undefined") SFX.stay();
    }
  } else {
    me.score -= 1;
    doubter.score += 1;
    $("pb-banner").textContent = `🚨 ${doubter.name}의 의심 적중! (내 답 ${val} vs 실제 ${actual}) → 나 -1점`;
    if (typeof SFX !== "undefined") SFX.bust();
  }

  if (pbCheckWin()) return;
  pbState.turn += 1;
  pbState.askColor = pbState.askColor === "black" ? "white" : "black";
  pbState.activeBankIdx = (pbState.activeBankIdx + 1) % 5;
  pbState.phase = "MY_PUT";
  $("pb-log").textContent = `내 차례! #${pbState.activeBankIdx + 1} 저금통에 동전을 넣어 전달하세요.`;
  renderPiggyBank();
}

function pbCheckWin() {
  const winner = pbState.players.find((p) => p.score >= 5);
  if (winner) {
    pbState.done = true;
    pbState.phase = "DONE";
    $("pb-banner").textContent = `🏆 5점 달성! ${winner.name} 최종 우승!`;
    $("pb-log").textContent = "모든 저금통의 최종 동전 개수가 공개되었습니다.";
    if (typeof SFX !== "undefined") {
      if (winner.isMe) SFX.win();
      else SFX.bust();
    }
    renderPiggyBank();
    return true;
  }
  return false;
}
