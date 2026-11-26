// ===========================================================================
// DAY 2 GAMES: 미스터리 거래소 (Main Match) & 러시안 룰렛 (Prison Match)
// ===========================================================================

// ---------------------------------------------------------------------------
// 1. 미스터리 거래소 (Mystery Exchange - 7 Stocks, 10 Rounds)
// ---------------------------------------------------------------------------
let exState = null;

function startExchangeGame() {
  exState = {
    round: 1,
    maxRounds: 10,
    cash: 100000,
    done: false,
    stocks: [
      { id: "matso", name: "맛소금융", price: 10000, prev: 10000, qty: 0, streakDown: 0, rule: "짝수 라운드 급등 / 홀수 라운드 조정" },
      { id: "mujo", name: "무조건설", price: 10000, prev: 10000, qty: 0, streakDown: 0, rule: "꾸준히 상승하다 3의 배수 라운드 급락" },
      { id: "bangeo", name: "방어제철", price: 10000, prev: 10000, qty: 0, streakDown: 0, rule: "다른 종목 평균이 하락할 때 반대로 급등 (인버스)" },
      { id: "alt", name: "알트엔터", price: 10000, prev: 10000, qty: 0, streakDown: 0, rule: "2연속 하락 후 대폭등(+65%) 반등" },
      { id: "yeolim", name: "열림보안", price: 10000, prev: 10000, qty: 0, streakDown: 0, rule: "직전 라운드 상승 종목이 많으면 동반 급등" },
      { id: "koyo", name: "코요테크", price: 10000, prev: 10000, qty: 0, streakDown: 0, rule: "1만원 이하 반등 / 1.8만원 이상 차익실현 박스권" },
      { id: "huja", name: "후자전자", price: 10000, prev: 10000, qty: 0, streakDown: 0, rule: "초반 꾸준히 상승하다 8라운드 이후 고변동성" },
    ],
    aiAssets: [
      { name: "VIPER", asset: 100000 },
      { name: "NOVA", asset: 100000 },
      { name: "KRONOS", asset: 100000 },
    ],
  };
  showScreen("exchange");
  renderExchange();
  if (typeof SFX !== "undefined") SFX.dice();
}

function getExTotalAsset() {
  if (!exState) return 0;
  return exState.cash + exState.stocks.reduce((s, st) => s + st.price * st.qty, 0);
}

function renderExchange() {
  if (!exState) return;
  const total = getExTotalAsset();
  $("ex-round").textContent = `R${Math.min(exState.round, exState.maxRounds)} / ${exState.maxRounds}`;
  $("ex-cash").textContent = exState.cash.toLocaleString();
  $("ex-total").textContent = `총자산 ${total.toLocaleString()}원`;

  const list = $("ex-stocks");
  list.innerHTML = "";
  exState.stocks.forEach((st, idx) => {
    const diff = st.price - st.prev;
    const pct = st.prev > 0 ? Math.round((diff / st.prev) * 100) : 0;
    const diffHtml =
      diff > 0
        ? `<span class="up">▲ +${pct}%</span>`
        : diff < 0
        ? `<span class="down">▼ ${pct}%</span>`
        : `<span>- 0%</span>`;

    const row = document.createElement("div");
    row.className = "stock-row";
    row.innerHTML = `
      <div class="stock-info">
        <div class="stock-name">${st.name} ${st.qty > 0 ? `<span class="stock-qty">${st.qty}주</span>` : ""}</div>
        <div class="stock-price">${st.price.toLocaleString()}원 ${diffHtml}</div>
      </div>
      <div class="stock-btns">
        <button type="button" class="st-act buy" ${exState.done || exState.cash < st.price ? "disabled" : ""}>+1</button>
        <button type="button" class="st-act all" ${exState.done || exState.cash < st.price ? "disabled" : ""}>MAX</button>
        <button type="button" class="st-act sell" ${exState.done || st.qty <= 0 ? "disabled" : ""}>전량매도</button>
      </div>
    `;
    const btns = row.querySelectorAll("button");
    btns[0].onclick = () => tradeStock(idx, "buy1");
    btns[1].onclick = () => tradeStock(idx, "buyMax");
    btns[2].onclick = () => tradeStock(idx, "sellAll");
    list.appendChild(row);
  });

  const ranks = [{ name: "나", asset: total }, ...exState.aiAssets].sort((a, b) => b.asset - a.asset);
  $("ex-rank").innerHTML = ranks
    .map((r, i) => `<span>${i + 1}위 ${r.name} <strong>${Math.round(r.asset / 1000)}k</strong></span>`)
    .join("");

  const nextBtn = $("btn-ex-next");
  if (exState.done) {
    nextBtn.textContent = "다시 하기 ↺";
    nextBtn.onclick = () => startExchangeGame();
  } else {
    nextBtn.textContent = exState.round === exState.maxRounds ? "🏁 최종 정산하기" : "📈 장 마감 · 다음 라운드";
    nextBtn.onclick = () => advanceExchangeRound();
  }
}

function tradeStock(idx, mode) {
  if (!exState || exState.done) return;
  const st = exState.stocks[idx];
  if (mode === "buy1" && exState.cash >= st.price) {
    exState.cash -= st.price;
    st.qty += 1;
    if (typeof SFX !== "undefined") SFX.chip();
  } else if (mode === "buyMax" && exState.cash >= st.price) {
    const can = Math.floor(exState.cash / st.price);
    exState.cash -= can * st.price;
    st.qty += can;
    if (typeof SFX !== "undefined") SFX.raise();
  } else if (mode === "sellAll" && st.qty > 0) {
    exState.cash += st.qty * st.price;
    st.qty = 0;
    if (typeof SFX !== "undefined") SFX.stay();
  }
  renderExchange();
}

function advanceExchangeRound() {
  if (!exState || exState.done) return;
  const r = exState.round;
  let upCount = 0;
  const prevUps = exState.stocks.filter((s) => s.price > s.prev).length;

  // Apply hidden patterns
  exState.stocks.forEach((st) => {
    st.prev = st.price;
    let mult = 1.0;
    if (st.id === "matso") {
      mult = r % 2 === 0 ? 1.35 : 0.85;
    } else if (st.id === "mujo") {
      mult = r % 3 === 0 ? 0.72 : 1.2;
    } else if (st.id === "alt") {
      if (st.streakDown >= 2) {
        mult = 1.68;
        st.streakDown = 0;
      } else {
        mult = 0.84;
        st.streakDown += 1;
      }
    } else if (st.id === "yeolim") {
      mult = prevUps >= 4 ? 1.28 : 0.9;
    } else if (st.id === "koyo") {
      mult = st.price <= 10500 ? 1.42 : st.price >= 17000 ? 0.75 : 1.08;
    } else if (st.id === "huja") {
      mult = r <= 7 ? 1.18 : (Math.random() < 0.5 ? 1.45 : 0.65);
    } else {
      return; // bangeo calculated after others
    }
    st.price = Math.max(2000, Math.round((st.price * mult) / 100) * 100);
    if (st.price > st.prev) upCount++;
  });

  // Inverse stock (방어제철)
  const bangeo = exState.stocks.find((s) => s.id === "bangeo");
  const bgMult = upCount <= 2 ? 1.38 : 0.88;
  bangeo.price = Math.max(2000, Math.round((bangeo.price * bgMult) / 100) * 100);

  // AI traders grow moderately
  exState.aiAssets.forEach((ai) => {
    ai.asset = Math.round(ai.asset * (0.94 + Math.random() * 0.26));
  });

  if (exState.round >= exState.maxRounds) {
    exState.done = true;
    const total = getExTotalAsset();
    const ranks = [{ name: "나", asset: total }, ...exState.aiAssets].sort((a, b) => b.asset - a.asset);
    const winner = ranks[0];
    $("ex-banner").textContent = `🏆 최종 1위: ${winner.name} (${winner.asset.toLocaleString()}원)!`;
    $("ex-log").textContent = `내 최종 수익률: ${Math.round(((total - 100000) / 100000) * 100)}%`;
    if (typeof SFX !== "undefined") {
      if (winner.name === "나") SFX.win();
      else SFX.chip();
    }
  } else {
    exState.round += 1;
    $("ex-banner").textContent = `📊 라운드 ${r} 마감 완료! 패턴을 분석해 다음 거래를 준비하세요`;
    $("ex-log").textContent = `상승 종목 ${upCount}개 · 짝수/3배수/연속하락/인버스 패턴에 주목!`;
    if (typeof SFX !== "undefined") SFX.cardFlip();
  }
  renderExchange();
}

// ---------------------------------------------------------------------------
// 2. 러시안 룰렛 (Russian Roulette - 16 Chambers, 2 Bullets, 6 Players)
// ---------------------------------------------------------------------------
let rrState = null;

function startRouletteGame() {
  const myName = ($("input-name") && $("input-name").value.trim()) || "나";
  const chambers = Array.from({ length: 16 }, (_, i) => ({
    idx: i,
    bullet: false,
    pubSeen: false,
    privSeen: false,
    fired: false,
  }));
  // Place 2 random bullets
  const b1 = Math.floor(Math.random() * 16);
  let b2 = Math.floor(Math.random() * 16);
  while (b2 === b1) b2 = Math.floor(Math.random() * 16);
  chambers[b1].bullet = true;
  chambers[b2].bullet = true;

  rrState = {
    players: [
      { name: myName, isMe: true, dead: false },
      { name: "VIPER", isMe: false, dead: false },
      { name: "NOVA", isMe: false, dead: false },
      { name: "KRONOS", isMe: false, dead: false },
      { name: "ORION", isMe: false, dead: false },
      { name: "ZEPHYR", isMe: false, dead: false },
    ],
    aimIdx: 0,
    credits: 10,
    swapGauge: 0,
    selectedSlot: 0,
    chambers,
    firing: false,
    done: false,
  };
  showScreen("roulette");
  renderRoulette();
  if (typeof SFX !== "undefined") SFX.dice();
}

function renderRoulette() {
  if (!rrState) return;
  $("rr-aim").textContent = `🎯 조준: ${rrState.players[rrState.aimIdx].name}`;
  $("rr-swap-gauge").textContent = `조작 게이지 ${rrState.swapGauge}/6`;
  $("rr-credits").textContent = rrState.credits;

  const pRow = $("rr-players");
  pRow.innerHTML = rrState.players
    .map((p, i) => {
      const cls = p.dead ? "dead" : i === rrState.aimIdx ? "aimed" : "";
      return `<div class="rr-p ${cls}">${i === rrState.aimIdx ? "🎯" : ""}${p.name}${p.dead ? " 💀" : ""}</div>`;
    })
    .join("");

  const grid = $("rr-chambers");
  grid.innerHTML = "";
  rrState.chambers.forEach((c, i) => {
    const ownerIdx = (rrState.aimIdx + i) % 6;
    const ownerName = rrState.players[ownerIdx].name.slice(0, 3);
    const known = c.pubSeen || c.privSeen || rrState.done;
    const div = document.createElement("div");
    div.className = "rr-slot";
    if (i === rrState.selectedSlot && !rrState.done) div.classList.add("selected");
    if (c.fired) div.classList.add("fired");
    if (known) div.classList.add(c.bullet ? "bullet" : "safe");

    const icon = known ? (c.bullet ? "🔴" : "⚪") : "❓";
    const privTag = c.privSeen && !c.pubSeen ? "🕵️" : "";
    div.innerHTML = `<div>#${i + 1} ${icon}${privTag}</div><div style="font-size:9.5px;opacity:0.75;">${ownerName}</div>`;
    div.onclick = () => {
      if (rrState.done || rrState.firing) return;
      rrState.selectedSlot = i;
      renderRoulette();
    };
    grid.appendChild(div);
  });

  const disabled = rrState.done || rrState.firing;
  $("btn-rr-pub").disabled = disabled || rrState.credits < 1;
  $("btn-rr-priv").disabled = disabled || rrState.credits < 2;
  $("btn-rr-rot1").disabled = disabled || rrState.credits < 3;
  $("btn-rr-rot2").disabled = disabled || rrState.credits < 4;
  $("btn-rr-swap").disabled = disabled || rrState.credits < 2;

  const fireBtn = $("btn-rr-fire");
  if (rrState.done) {
    fireBtn.disabled = false;
    fireBtn.textContent = "다시 하기 ↺";
    fireBtn.onclick = () => startRouletteGame();
  } else {
    fireBtn.disabled = rrState.firing;
    fireBtn.textContent = "🔫 크레딧 종료 · 격발 시작!";
    fireBtn.onclick = () => startRouletteFiring();
  }
}

function rrDoAction(type) {
  if (!rrState || rrState.done || rrState.firing) return;
  const s1 = rrState.selectedSlot;
  const s2 = (s1 + 1) % 16;

  if (type === "pub" && rrState.credits >= 1) {
    rrState.credits -= 1;
    rrState.chambers[s1].pubSeen = true;
    rrState.chambers[s2].pubSeen = true;
    $("rr-banner").textContent = `👁️ 공개 조사: #${s1 + 1}, #${s2 + 1} 약실 공개!`;
    if (typeof SFX !== "undefined") SFX.cardFlip();
  } else if (type === "priv" && rrState.credits >= 2) {
    rrState.credits -= 2;
    rrState.chambers[s1].privSeen = true;
    rrState.chambers[s2].privSeen = true;
    $("rr-banner").textContent = `🕵️ 비공개 조사: #${s1 + 1}, #${s2 + 1} 나만 확인 완료!`;
    if (typeof SFX !== "undefined") SFX.stay();
  } else if (type === "rot1" && rrState.credits >= 3) {
    rrState.credits -= 3;
    rrState.aimIdx = (rrState.aimIdx + 1) % 6;
    $("rr-banner").textContent = `🔄 총구 +1칸 회전 → ${rrState.players[rrState.aimIdx].name} 조준!`;
    if (typeof SFX !== "undefined") SFX.chip();
  } else if (type === "rot2" && rrState.credits >= 4) {
    rrState.credits -= 4;
    rrState.aimIdx = (rrState.aimIdx + 2) % 6;
    $("rr-banner").textContent = `🔄 총구 +2칸 회전 → ${rrState.players[rrState.aimIdx].name} 조준!`;
    if (typeof SFX !== "undefined") SFX.raise();
  } else if (type === "swap" && rrState.credits >= 2) {
    rrState.credits -= 2;
    rrState.swapGauge += 2;
    if (rrState.swapGauge >= 6) {
      rrState.swapGauge = 0;
      const tmp = rrState.chambers[s1].bullet;
      rrState.chambers[s1].bullet = rrState.chambers[s2].bullet;
      rrState.chambers[s2].bullet = tmp;
      $("rr-banner").textContent = `🔀 조작 발동! #${s1 + 1} ↔ #${s2 + 1} 약실 위치가 맞교환되었습니다!`;
      if (typeof SFX !== "undefined") SFX.minusCard();
    } else {
      $("rr-banner").textContent = `🔀 조작 크레딧 투입! (게이지 ${rrState.swapGauge}/6)`;
      if (typeof SFX !== "undefined") SFX.chip();
    }
  }

  // AI random minor reaction (small chance to rotate or contribute to swap gauge)
  if (Math.random() < 0.35 && rrState.credits > 0) {
    rrState.swapGauge = Math.min(5, rrState.swapGauge + 1);
    $("rr-log").textContent = "🤖 AI 플레이어가 조작 게이지에 몰래 크레딧을 투입했습니다.";
  }

  renderRoulette();
}

function startRouletteFiring() {
  if (!rrState || rrState.firing || rrState.done) return;
  rrState.firing = true;
  renderRoulette();

  let step = 0;
  let hits = 0;
  const victims = [];
  const timer = setInterval(() => {
    if (step >= 16 || hits >= 2) {
      clearInterval(timer);
      rrState.firing = false;
      rrState.done = true;
      const meDead = rrState.players[0].dead;
      $("rr-banner").textContent = meDead
        ? `💀 피탄 탈락! (탈락자: ${victims.join(", ")})`
        : `🎉 생존 성공! (탈락자: ${victims.join(", ")})`;
      $("rr-log").textContent = "모든 약실이 공개되었습니다.";
      if (typeof SFX !== "undefined") {
        if (meDead) SFX.bust();
        else SFX.win();
      }
      renderRoulette();
      return;
    }

    const c = rrState.chambers[step];
    c.fired = true;
    c.pubSeen = true;
    const targetP = rrState.players[(rrState.aimIdx + step) % 6];
    if (c.bullet) {
      hits++;
      targetP.dead = true;
      if (!victims.includes(targetP.name)) victims.push(targetP.name);
      $("rr-banner").textContent = `💥 탕!! #${step + 1}번 실탄 발사 → ${targetP.name} 피탄!`;
      if (typeof SFX !== "undefined") SFX.bust();
    } else {
      $("rr-banner").textContent = `찰칵… #${step + 1}번 빈 약실 (${targetP.name} 생존)`;
      if (typeof SFX !== "undefined") SFX.chip();
    }
    step++;
    renderRoulette();
  }, 420);
}

if ($("btn-rr-pub")) $("btn-rr-pub").onclick = () => rrDoAction("pub");
if ($("btn-rr-priv")) $("btn-rr-priv").onclick = () => rrDoAction("priv");
if ($("btn-rr-rot1")) $("btn-rr-rot1").onclick = () => rrDoAction("rot1");
if ($("btn-rr-rot2")) $("btn-rr-rot2").onclick = () => rrDoAction("rot2");
if ($("btn-rr-swap")) $("btn-rr-swap").onclick = () => rrDoAction("swap");
