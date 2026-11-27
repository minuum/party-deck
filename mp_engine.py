import random
import string
from typing import Dict, List, Optional

BOT_NAMES = ["VIPER", "NOVA", "KRONOS", "ORION", "ZEPHYR", "ATLAS"]

GAME_META = {
    "choice": {"title": "양자택일", "day": "1일차 메인매치", "max_players": 7, "min_players": 2},
    "heavy_13": {"title": "무거운 13", "day": "1일차 감옥매치", "max_players": 5, "min_players": 2},
    "mystery_exchange": {"title": "미스터리 거래소", "day": "2일차 메인매치", "max_players": 6, "min_players": 2},
    "russian_roulette": {"title": "러시안 룰렛", "day": "2일차 감옥매치", "max_players": 6, "min_players": 2},
    "gem_market": {"title": "보석 암시장", "day": "3일차 메인매치", "max_players": 6, "min_players": 2},
    "piggy_bank": {"title": "돼지 저금통", "day": "3일차 감옥매치", "max_players": 5, "min_players": 2},
}

GM_CARDS = [
    {"id": "dia", "label": "💎 다이아", "pts": 5, "isBomb": False},
    {"id": "gold", "label": "🥇 금", "pts": 4, "isBomb": False},
    {"id": "silver", "label": "🥈 은", "pts": 3, "isBomb": False},
    {"id": "bronze", "label": "🥉 동", "pts": 2, "isBomb": False},
    {"id": "bomb4", "label": "💣 폭탄", "pts": -4, "isBomb": True},
    {"id": "bomb6", "label": "💥 대폭탄", "pts": -6, "isBomb": True},
]

EX_INIT_STOCKS = [
    {"id": "matso", "name": "맛소금융", "price": 10000, "prev": 10000, "streakDown": 0},
    {"id": "mujo", "name": "무조건설", "price": 10000, "prev": 10000, "streakDown": 0},
    {"id": "bangeo", "name": "방어제철", "price": 10000, "prev": 10000, "streakDown": 0},
    {"id": "alt", "name": "알트엔터", "price": 10000, "prev": 10000, "streakDown": 0},
    {"id": "yeolim", "name": "열림보안", "price": 10000, "prev": 10000, "streakDown": 0},
    {"id": "koyo", "name": "코요테크", "price": 10000, "prev": 10000, "streakDown": 0},
    {"id": "huja", "name": "후자전자", "price": 10000, "prev": 10000, "streakDown": 0},
]


def gen_code() -> str:
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=4))


def create_mp_room(game_type: str, host_name: str, room_id: str) -> dict:
    pid = f"mp_{random.randint(10000, 99999)}"
    return {
        "room_id": room_id,
        "game_type": game_type,
        "host_id": pid,
        "phase": "LOBBY",  # LOBBY, PLAYING, DONE
        "round": 1,
        "players": [{"id": pid, "name": host_name, "is_ai": False}],
        "state": {},
        "banner": "친구들을 초대하거나 AI를 추가한 뒤 게임을 시작하세요!",
        "log": "",
    }


def add_ai_to_room(room: dict) -> bool:
    meta = GAME_META[room["game_type"]]
    if len(room["players"]) >= meta["max_players"]:
        return False
    existing = {p["name"] for p in room["players"]}
    for idx, bn in enumerate(BOT_NAMES, start=1):
        if bn not in existing:
            room["players"].append({"id": f"ai_{idx}_{random.randint(100,999)}", "name": bn, "is_ai": True})
            return True
    return False


def remove_ai_from_room(room: dict, target_id: Optional[str] = None) -> bool:
    for i in range(len(room["players"]) - 1, -1, -1):
        p = room["players"][i]
        if p["is_ai"] and (target_id is None or p["id"] == target_id):
            room["players"].pop(i)
            return True
    return False


# ---------------------------------------------------------------------------
# Start Game Initializers
# ---------------------------------------------------------------------------
def start_mp_game(room: dict):
    gt = room["game_type"]
    room["phase"] = "PLAYING"
    room["round"] = 1
    ps = room["players"]

    if gt == "choice":
        for p in ps:
            p["score"] = 0
            p["last"] = "-"
            p["pending"] = None
        room["state"] = {"max_rounds": 6, "prize": 0, "betray_rate": 0.3}
        room["banner"] = f"🤝 라운드 1 시작! ({len(ps)}명 중 과반 {(len(ps)//2)+1}명 이상 공공 선택 시 성공)"
        room["log"] = "모든 플레이어가 동시에 공공의 이익 / 개인의 이익을 선택합니다."

    elif gt == "heavy_13":
        for p in ps:
            p["penalty"] = 0
            p["cards"] = [0, 1, 2, 3, 4, 5, 6]
            p["chips"] = {"red": 2, "green": 2, "blue": 2, "rainbow": 1}
            p["pending"] = None
            p["last"] = "-"
        room["state"] = {
            "max_rounds": 14,
            "pedestals": {
                "red": {"sum": 0, "count": 0},
                "green": {"sum": 0, "count": 0},
                "blue": {"sum": 0, "count": 0},
            },
        }
        room["banner"] = "🪨 라운드 1 시작! 바위 카드 1장 + 받침대 칩 1개를 동시 제출하세요."
        room["log"] = "합이 13 이상 폭발 시 놓여있던 카드 장수만큼 벌점!"

    elif gt == "mystery_exchange":
        for p in ps:
            p["cash"] = 100000
            p["holdings"] = {s["id"]: 0 for s in EX_INIT_STOCKS}
            p["ready"] = False
        room["state"] = {
            "max_rounds": 10,
            "stocks": [dict(s) for s in EX_INIT_STOCKS],
        }
        room["banner"] = "📈 라운드 1 장 개장! 매수/매도 후 [거래 완료]를 누르세요."
        room["log"] = "모든 플레이어가 거래 완료를 누르면 다음 라운드 시세가 변동됩니다."

    elif gt == "russian_roulette":
        chambers = [{"idx": i, "bullet": False, "pub": False, "priv_by": [], "fired": False} for i in range(16)]
        b1, b2 = random.sample(range(16), 2)
        chambers[b1]["bullet"] = True
        chambers[b2]["bullet"] = True
        for p in ps:
            p["credits"] = 10
            p["dead"] = False
            p["passed"] = False
        room["state"] = {
            "aim_idx": 0,
            "turn_idx": 0,
            "swap_gauge": 0,
            "chambers": chambers,
            "victims": [],
        }
        room["banner"] = f"🔫 러시안 룰렛 시작! {ps[0]['name']}님 차례입니다."
        room["log"] = "16개 약실 중 실탄 2발! 크레딧 소진 또는 전원 패스 시 격발!"
        _rr_advance_ai(room)

    elif gt == "gem_market":
        n = len(ps)
        shift = random.randint(1, n - 1) if n > 1 else 0
        for i, p in enumerate(ps):
            p["pts"] = 2
            p["manitto_idx"] = (i + shift) % n
            p["hand"] = [dict(random.choice(GM_CARDS)) for _ in range(3)]
            p["pending"] = None
        buyers = random.sample([c for c in GM_CARDS if not c["isBomb"]], 2)
        room["state"] = {"max_rounds": 5, "buyers": buyers}
        room["banner"] = "💎 라운드 1 시작! 교환할 카드 1장과 상대를 선택해 제출하세요."
        room["log"] = "최종 점수 = 내 기본 점수 × 내 마니또 기본 점수!"

    elif gt == "piggy_bank":
        for p in ps:
            p["score"] = 0
        banks = [{"id": i + 1, "black": 1, "white": 1} for i in range(5)]
        room["state"] = {
            "sub_phase": "PUT",  # PUT, ANSWER, DOUBT
            "turn_idx": 0,
            "responder_idx": 1 % len(ps),
            "active_bank": 0,
            "ask_color": "black",
            "claim": None,
            "doubt_votes": {},
            "banks": banks,
        }
        room["banner"] = f"🐷 {ps[0]['name']}님 차례! #1 저금통에 동전을 넣고 상대를 지목하세요."
        room["log"] = "모든 저금통은 ⚫1, ⚪1개로 시작합니다. 먼저 5점 달성 시 우승!"
        _pb_advance_ai(room)


# ---------------------------------------------------------------------------
# Action Handlers per Game
# ---------------------------------------------------------------------------
def handle_mp_action(room: dict, pid: str, payload: dict) -> Optional[str]:
    gt = room["game_type"]
    act = payload.get("action", "")
    ps = room["players"]
    me = next((p for p in ps if p["id"] == pid), None)
    if not me:
        return "권한이 없습니다."

    if room["phase"] == "LOBBY":
        if pid != room["host_id"]:
            return "방장만 조작할 수 있습니다."
        if act == "add_ai":
            add_ai_to_room(room)
        elif act == "remove_ai":
            remove_ai_from_room(room, payload.get("target_id"))
        elif act == "start":
            if len(ps) < GAME_META[gt]["min_players"]:
                return "최소 2명 이상 필요합니다."
            start_mp_game(room)
        return None

    if act == "restart" and pid == room["host_id"]:
        start_mp_game(room)
        return None

    if act == "end_game" and pid == room["host_id"] and room["phase"] == "PLAYING":
        room["phase"] = "DONE"
        room["banner"] = "🏁 방장 권한으로 게임이 종료되었습니다."
        return None

    if room["phase"] != "PLAYING":
        return None

    if gt == "choice":
        return _act_choice(room, me, payload)
    if gt == "heavy_13":
        return _act_heavy13(room, me, payload)
    if gt == "mystery_exchange":
        return _act_exchange(room, me, payload)
    if gt == "russian_roulette":
        return _act_roulette(room, me, payload)
    if gt == "gem_market":
        return _act_gem_market(room, me, payload)
    if gt == "piggy_bank":
        return _act_piggy_bank(room, me, payload)
    return None


def _act_choice(room: dict, me: dict, payload: dict):
    pick = payload.get("pick")
    if pick not in ("public", "private"):
        return "잘못된 선택입니다."
    me["pending"] = pick
    # Auto-pick for AI
    st = room["state"]
    for p in room["players"]:
        if p["is_ai"] and p["pending"] is None:
            prob = min(0.82, 0.32 + st["betray_rate"] * 0.25 + (0.15 if room["round"] >= 5 else 0))
            p["pending"] = "private" if random.random() < prob else "public"

    if all(p["pending"] is not None for p in room["players"]):
        n = len(room["players"])
        pub_cnt = sum(1 for p in room["players"] if p["pending"] == "public")
        priv_cnt = n - pub_cnt
        need = (n // 2) + 1
        success = pub_cnt >= need
        for p in room["players"]:
            pk = p["pending"]
            p["last"] = "🤝공공" if pk == "public" else "😈개인"
            if success:
                p["score"] += 3 if pk == "public" else 5
            else:
                if pk == "private":
                    p["score"] += 2 if priv_cnt >= n - 1 else 5
            p["pending"] = None
        if success:
            st["prize"] += 1
            room["banner"] = f"✅ R{room['round']} 과반 성공! (공공 {pub_cnt} vs 개인 {priv_cnt})"
        else:
            room["banner"] = f"💥 R{room['round']} 과반 실패! (공공 {pub_cnt} vs 개인 {priv_cnt})"
        st["betray_rate"] = priv_cnt / max(1, n)
        if room["round"] >= st["max_rounds"]:
            room["phase"] = "DONE"
            top = max(room["players"], key=lambda x: x["score"])
            room["banner"] = f"🏆 최종 1위: {top['name']} ({top['score']}점 · 연맹의 징표!)"
        else:
            room["round"] += 1
    else:
        waiting = sum(1 for p in room["players"] if p["pending"] is None)
        room["log"] = f"⏳ 다른 플레이어 {waiting}명 선택 대기 중..."
    return None


def _act_heavy13(room: dict, me: dict, payload: dict):
    card = payload.get("card")
    chip = payload.get("chip")
    rb_color = payload.get("rb_color", "red")
    if card not in me["cards"] or me["chips"].get(chip, 0) <= 0:
        return "유효하지 않은 카드 또는 칩입니다."
    me["pending"] = {"card": card, "chip": chip, "target": rb_color if chip == "rainbow" else chip}

    peds = room["state"]["pedestals"]
    for p in room["players"]:
        if p["is_ai"] and p["pending"] is None:
            avail_chips = [k for k, v in p["chips"].items() if v > 0]
            ch = random.choice(avail_chips)
            tgt = min(["red", "green", "blue"], key=lambda c: peds[c]["sum"]) if ch == "rainbow" else ch
            safe = [c for c in p["cards"] if peds[tgt]["sum"] + c < 13]
            cd = random.choice(safe) if safe else min(p["cards"])
            p["pending"] = {"card": cd, "chip": ch, "target": tgt}

    if all(p["pending"] is not None for p in room["players"]):
        moves = []
        for idx, p in enumerate(room["players"]):
            mv = p["pending"]
            p["cards"].remove(mv["card"])
            p["chips"][mv["chip"]] -= 1
            em = {"red": "🔴", "green": "🟢", "blue": "🔵"}[mv["target"]]
            p["last"] = f"{'🌈→' if mv['chip']=='rainbow' else ''}{em}{mv['card']}"
            moves.append((p, idx, mv))
            p["pending"] = None
        moves.sort(key=lambda x: (0 if x[2]["chip"] == "rainbow" else 1, -x[2]["card"], x[1]))
        booms = []
        for p, _, mv in moves:
            ped = peds[mv["target"]]
            if ped["sum"] + mv["card"] >= 13:
                pen = ped["count"]
                p["penalty"] += pen
                ped["sum"] = 0
                ped["count"] = 0
                booms.append(f"{p['name']}💥(+{pen})")
            else:
                ped["sum"] += mv["card"]
                ped["count"] += 1
        room["banner"] = f"💥 폭발! {', '.join(booms)}" if booms else f"✅ R{room['round']} 전원 무사 통과!"
        room["log"] = "배치순서: " + " → ".join(f"{p['name']}({mv['card']})" for p, _, mv in moves)
        if room["round"] >= room["state"]["max_rounds"]:
            room["phase"] = "DONE"
            win = min(room["players"], key=lambda x: x["penalty"])
            room["banner"] = f"🏆 우승: {win['name']} (최소 벌점 {win['penalty']}점!)"
        else:
            room["round"] += 1
            if room["round"] == 8:
                for p in room["players"]:
                    p["cards"] = [0, 1, 2, 3, 4, 5, 6]
                    p["chips"] = {"red": 2, "green": 2, "blue": 2, "rainbow": 1}
                room["log"] = "🔄 8라운드! 모든 바위 카드와 칩이 리필되었습니다."
    else:
        w = sum(1 for p in room["players"] if p["pending"] is None)
        room["log"] = f"⏳ 다른 플레이어 {w}명 제출 대기 중..."
    return None


def _act_exchange(room: dict, me: dict, payload: dict):
    act = payload.get("action")
    stocks = room["state"]["stocks"]
    if act in ("buy1", "buyMax", "sellAll"):
        sid = payload.get("stock_id")
        st = next((s for s in stocks if s["id"] == sid), None)
        if not st:
            return "종목 없음"
        if act == "buy1" and me["cash"] >= st["price"]:
            me["cash"] -= st["price"]
            me["holdings"][sid] += 1
        elif act == "buyMax" and me["cash"] >= st["price"]:
            cnt = me["cash"] // st["price"]
            me["cash"] -= cnt * st["price"]
            me["holdings"][sid] += cnt
        elif act == "sellAll" and me["holdings"][sid] > 0:
            me["cash"] += me["holdings"][sid] * st["price"]
            me["holdings"][sid] = 0
        return None

    if act == "ready":
        me["ready"] = True
        for p in room["players"]:
            if p["is_ai"] and not p["ready"]:
                # Simple AI random trade
                s_pick = random.choice(stocks)
                if p["cash"] >= s_pick["price"] and random.random() < 0.7:
                    cnt = max(1, (p["cash"] // 2) // s_pick["price"])
                    p["cash"] -= cnt * s_pick["price"]
                    p["holdings"][s_pick["id"]] += cnt
                p["ready"] = True

        if all(p["ready"] for p in room["players"]):
            r = room["round"]
            prev_ups = sum(1 for s in stocks if s["price"] > s["prev"])
            up_cnt = 0
            for s in stocks:
                s["prev"] = s["price"]
                if s["id"] == "bangeo":
                    continue
                if s["id"] == "matso":
                    m = 1.35 if r % 2 == 0 else 0.85
                elif s["id"] == "mujo":
                    m = 0.72 if r % 3 == 0 else 1.2
                elif s["id"] == "alt":
                    if s["streakDown"] >= 2:
                        m = 1.68
                        s["streakDown"] = 0
                    else:
                        m = 0.84
                        s["streakDown"] += 1
                elif s["id"] == "yeolim":
                    m = 1.28 if prev_ups >= 4 else 0.9
                elif s["id"] == "koyo":
                    m = 1.42 if s["price"] <= 10500 else (0.75 if s["price"] >= 17000 else 1.08)
                else:
                    m = 1.18 if r <= 7 else (1.45 if random.random() < 0.5 else 0.65)
                s["price"] = max(2000, round((s["price"] * m) / 100) * 100)
                if s["price"] > s["prev"]:
                    up_cnt += 1
            bg = next(s for s in stocks if s["id"] == "bangeo")
            bg["price"] = max(2000, round((bg["price"] * (1.38 if up_cnt <= 2 else 0.88)) / 100) * 100)
            for p in room["players"]:
                p["ready"] = False
            if room["round"] >= room["state"]["max_rounds"]:
                room["phase"] = "DONE"
                def total_a(pl):
                    return pl["cash"] + sum(pl["holdings"][s["id"]] * s["price"] for s in stocks)
                top = max(room["players"], key=total_a)
                room["banner"] = f"🏆 최종 1위: {top['name']} ({total_a(top):,}원!)"
            else:
                room["round"] += 1
                room["banner"] = f"📊 R{r} 마감! 상승 종목 {up_cnt}개 · 다음 거래를 준비하세요."
    return None


def _rr_advance_ai(room: dict):
    st = room["state"]
    ps = room["players"]
    guard = 0
    while room["phase"] == "PLAYING" and guard < 12:
        guard += 1
        if all(p["passed"] or p["credits"] <= 0 for p in ps):
            _rr_fire_all(room)
            return
        curr = ps[st["turn_idx"]]
        if curr["passed"] or curr["credits"] <= 0:
            st["turn_idx"] = (st["turn_idx"] + 1) % len(ps)
            continue
        if not curr["is_ai"]:
            return
        # AI takes 1 action
        if curr["credits"] >= 3 and random.random() < 0.35:
            curr["credits"] -= 3
            st["aim_idx"] = (st["aim_idx"] + 1) % len(ps)
            room["log"] = f"🤖 {curr['name']} 총구 +1칸 회전!"
        elif curr["credits"] >= 1 and random.random() < 0.55:
            curr["credits"] -= 1
            s1 = random.randint(0, 15)
            st["chambers"][s1]["pub"] = True
            st["chambers"][(s1 + 1) % 16]["pub"] = True
            room["log"] = f"🤖 {curr['name']} #{s1+1}, #{(s1+1)%16+1} 공개 조사!"
        else:
            curr["passed"] = True
            room["log"] = f"🤖 {curr['name']} 크레딧 종료(패스)"
        st["turn_idx"] = (st["turn_idx"] + 1) % len(ps)


def _rr_fire_all(room: dict):
    st = room["state"]
    ps = room["players"]
    victims = []
    hits = 0
    for i, c in enumerate(st["chambers"]):
        c["pub"] = True
        c["fired"] = True
        if c["bullet"] and hits < 2:
            hits += 1
            tp = ps[(st["aim_idx"] + i) % len(ps)]
            tp["dead"] = True
            if tp["name"] not in victims:
                victims.append(tp["name"])
    st["victims"] = victims
    room["phase"] = "DONE"
    room["banner"] = f"🔫 격발 완료! 피탄 탈락자: {', '.join(victims)}"


def _act_roulette(room: dict, me: dict, payload: dict):
    st = room["state"]
    ps = room["players"]
    if ps[st["turn_idx"]]["id"] != me["id"]:
        return "내 차례가 아닙니다."
    act = payload.get("action")
    s1 = int(payload.get("slot", 0)) % 16
    s2 = (s1 + 1) % 16

    if act == "pub" and me["credits"] >= 1:
        me["credits"] -= 1
        st["chambers"][s1]["pub"] = True
        st["chambers"][s2]["pub"] = True
        room["banner"] = f"👁️ {me['name']} 공개 조사: #{s1+1}, #{s2+1}"
    elif act == "priv" and me["credits"] >= 2:
        me["credits"] -= 2
        if me["id"] not in st["chambers"][s1]["priv_by"]:
            st["chambers"][s1]["priv_by"].append(me["id"])
        if me["id"] not in st["chambers"][s2]["priv_by"]:
            st["chambers"][s2]["priv_by"].append(me["id"])
        room["banner"] = f"🕵️ {me['name']} 비공개 조사 완료"
    elif act == "rot1" and me["credits"] >= 3:
        me["credits"] -= 3
        st["aim_idx"] = (st["aim_idx"] + 1) % len(ps)
        room["banner"] = f"🔄 {me['name']} 총구 +1칸 회전 → {ps[st['aim_idx']]['name']}"
    elif act == "rot2" and me["credits"] >= 4:
        me["credits"] -= 4
        st["aim_idx"] = (st["aim_idx"] + 2) % len(ps)
        room["banner"] = f"🔄 {me['name']} 총구 +2칸 회전 → {ps[st['aim_idx']]['name']}"
    elif act == "swap" and me["credits"] >= 2:
        me["credits"] -= 2
        st["swap_gauge"] += 2
        if st["swap_gauge"] >= 6:
            st["swap_gauge"] = 0
            b1 = st["chambers"][s1]["bullet"]
            st["chambers"][s1]["bullet"] = st["chambers"][s2]["bullet"]
            st["chambers"][s2]["bullet"] = b1
            room["banner"] = f"🔀 {me['name']} 조작 발동! #{s1+1} ↔ #{s2+1} 교체!"
        else:
            room["banner"] = f"🔀 {me['name']} 조작 투자 (게이지 {st['swap_gauge']}/6)"
    elif act == "pass":
        me["passed"] = True
        room["banner"] = f"✋ {me['name']} 패스"
    else:
        return "크레딧이 부족합니다."

    st["turn_idx"] = (st["turn_idx"] + 1) % len(ps)
    _rr_advance_ai(room)
    return None


def _act_gem_market(room: dict, me: dict, payload: dict):
    c_idx = int(payload.get("card_idx", -1))
    t_idx = int(payload.get("target_idx", -1))
    ps = room["players"]
    if not (0 <= c_idx < len(me["hand"])) or not (0 <= t_idx < len(ps)) or ps[t_idx]["id"] == me["id"]:
        return "유효하지 않은 교환입니다."
    me["pending"] = {"card_idx": c_idx, "target_idx": t_idx}

    for i, p in enumerate(ps):
        if p["is_ai"] and p["pending"] is None:
            others = [j for j in range(len(ps)) if j != i]
            p["pending"] = {"card_idx": random.randint(0, len(p["hand"]) - 1), "target_idx": random.choice(others)}

    if all(p["pending"] is not None for p in ps):
        buyer_ids = {b["id"] for b in room["state"]["buyers"]}
        for p in ps:
            mv = p["pending"]
            tgt = ps[mv["target_idx"]]
            ti = random.randint(0, len(tgt["hand"]) - 1)
            p["hand"][mv["card_idx"]], tgt["hand"][ti] = tgt["hand"][ti], p["hand"][mv["card_idx"]]
            p["pending"] = None
        for p in ps:
            delta = sum(c["pts"] for c in p["hand"] if c["isBomb"] or c["id"] in buyer_ids)
            p["pts"] = max(0, p["pts"] + delta)
        if room["round"] >= room["state"]["max_rounds"]:
            room["phase"] = "DONE"
            ranked = sorted(ps, key=lambda x: x["pts"] * ps[x["manitto_idx"]]["pts"], reverse=True)
            top = ranked[0]
            top_score = top["pts"] * ps[top["manitto_idx"]]["pts"]
            room["banner"] = f"🏆 마니또 곱셈 최종 1위: {top['name']} ({top_score}점!)"
        else:
            room["round"] += 1
            room["state"]["buyers"] = random.sample([c for c in GM_CARDS if not c["isBomb"]], 2)
            for p in ps:
                p["hand"] = [dict(random.choice(GM_CARDS)) for _ in range(3)]
            room["banner"] = f"💎 라운드 {room['round']} 시작! 새 카드 & 구매자 공개!"
    else:
        w = sum(1 for p in ps if p["pending"] is None)
        room["log"] = f"⏳ 다른 플레이어 {w}명 교환 대기 중..."
    return None


def _pb_advance_ai(room: dict):
    st = room["state"]
    ps = room["players"]
    guard = 0
    while room["phase"] == "PLAYING" and guard < 8:
        guard += 1
        if st["sub_phase"] == "PUT":
            actor = ps[st["turn_idx"]]
            if not actor["is_ai"]:
                return
            col = random.choice(["black", "white"])
            cnt = random.randint(1, 4)
            st["banks"][st["active_bank"]][col] += cnt
            others = [i for i in range(len(ps)) if i != st["turn_idx"]]
            st["responder_idx"] = random.choice(others)
            st["sub_phase"] = "ANSWER"
            room["banner"] = f"🤖 {actor['name']}이(가) #{st['active_bank']+1}에 {'⚫' if col=='black' else '⚪'} {cnt}개 투입 → {ps[st['responder_idx']]['name']} 지목!"
        elif st["sub_phase"] == "ANSWER":
            resp = ps[st["responder_idx"]]
            if not resp["is_ai"]:
                return
            actual = st["banks"][st["active_bank"]][st["ask_color"]]
            wrong = random.random() < 0.42
            st["claim"] = max(0, actual + random.choice([-1, 1])) if wrong else actual
            st["sub_phase"] = "DOUBT"
            st["doubt_votes"] = {}
            room["banner"] = f"🤖 {resp['name']}: '#{st['active_bank']+1} {'⚫흑' if st['ask_color']=='black' else '⚪백'} 동전은 {st['claim']}개!'"
            # If all non-responders are AI, auto-resolve
            humans = [p for i, p in enumerate(ps) if i != st["responder_idx"] and not p["is_ai"]]
            if not humans:
                _pb_resolve_doubt(room, None)
            else:
                return
        else:
            return


def _pb_resolve_doubt(room: dict, doubter_id: Optional[str]):
    st = room["state"]
    ps = room["players"]
    resp = ps[st["responder_idx"]]
    actual = st["banks"][st["active_bank"]][st["ask_color"]]
    if doubter_id:
        doubter = next(p for p in ps if p["id"] == doubter_id)
        if st["claim"] != actual:
            doubter["score"] += 1
            resp["score"] -= 1
            room["banner"] = f"🎯 {doubter['name']} 의심 성공! (실제 {actual} vs 답 {st['claim']}) +1점!"
        else:
            doubter["score"] -= 1
            resp["score"] += 1
            room["banner"] = f"💥 {doubter['name']} 의심 실패! ({resp['name']} 정답 {actual}개!)"
    else:
        if st["claim"] == actual:
            resp["score"] += 1
            room["banner"] = f"✅ 전원 통과! {resp['name']} +1점"
        else:
            room["banner"] = f"✅ 전원 통과! (실제 개수는 비공개 유지)"

    win = next((p for p in ps if p["score"] >= 5), None)
    if win:
        room["phase"] = "DONE"
        room["banner"] = f"🏆 5점 달성! {win['name']} 최종 우승!"
        return

    room["round"] += 1
    st["turn_idx"] = st["responder_idx"]
    st["active_bank"] = (st["active_bank"] + 1) % 5
    st["ask_color"] = "white" if st["ask_color"] == "black" else "black"
    st["sub_phase"] = "PUT"
    st["claim"] = None
    st["doubt_votes"] = {}
    _pb_advance_ai(room)


def _act_piggy_bank(room: dict, me: dict, payload: dict):
    st = room["state"]
    ps = room["players"]
    act = payload.get("action")
    if st["sub_phase"] == "PUT" and act == "put":
        if ps[st["turn_idx"]]["id"] != me["id"]:
            return "내 차례가 아닙니다."
        col = payload.get("color", "black")
        cnt = max(1, min(5, int(payload.get("count", 1))))
        t_idx = int(payload.get("target_idx", 0))
        if not (0 <= t_idx < len(ps)) or ps[t_idx]["id"] == me["id"]:
            return "올바른 상대를 지목하세요."
        st["banks"][st["active_bank"]][col] += cnt
        st["responder_idx"] = t_idx
        st["sub_phase"] = "ANSWER"
        room["banner"] = f"🐷 {me['name']}이(가) #{st['active_bank']+1}에 {'⚫' if col=='black' else '⚪'} {cnt}개 투입 → {ps[t_idx]['name']} 지목!"
        _pb_advance_ai(room)
        return None
    if st["sub_phase"] == "ANSWER" and act == "answer":
        if ps[st["responder_idx"]]["id"] != me["id"]:
            return "대답 차례가 아닙니다."
        st["claim"] = max(0, int(payload.get("claim", 0)))
        st["sub_phase"] = "DOUBT"
        st["doubt_votes"] = {}
        room["banner"] = f"💬 {me['name']}: '#{st['active_bank']+1} {'⚫흑' if st['ask_color']=='black' else '⚪백'} 동전은 {st['claim']}개!'"
        # If no other humans, let AI decide doubt
        other_humans = [p for i, p in enumerate(ps) if i != st["responder_idx"] and not p["is_ai"]]
        if not other_humans:
            actual = st["banks"][st["active_bank"]][st["ask_color"]]
            ai_doubter = next((p["id"] for i, p in enumerate(ps) if i != st["responder_idx"]), None)
            if st["claim"] != actual or random.random() < 0.35:
                _pb_resolve_doubt(room, ai_doubter)
            else:
                _pb_resolve_doubt(room, None)
        return None
    if st["sub_phase"] == "DOUBT" and act in ("doubt", "pass"):
        if ps[st["responder_idx"]]["id"] == me["id"]:
            return "대답한 사람은 의심할 수 없습니다."
        if act == "doubt":
            _pb_resolve_doubt(room, me["id"])
        else:
            st["doubt_votes"][me["id"]] = "pass"
            other_humans = [p["id"] for i, p in enumerate(ps) if i != st["responder_idx"] and not p["is_ai"]]
            if all(hid in st["doubt_votes"] for hid in other_humans):
                _pb_resolve_doubt(room, None)
        return None
    return "현재 수행할 수 없는 행동입니다."


# ---------------------------------------------------------------------------
# Privacy-Safe Serializer per Viewer
# ---------------------------------------------------------------------------
def serialize_mp_room(room: dict, viewer_id: str) -> dict:
    gt = room["game_type"]
    done = room["phase"] == "DONE"
    st = room["state"]
    ps = room["players"]

    players_out = []
    for idx, p in enumerate(ps):
        is_me = p["id"] == viewer_id
        po = {"id": p["id"], "name": p["name"], "is_ai": p["is_ai"], "is_host": p["id"] == room["host_id"]}
        if gt == "choice":
            po.update({"score": p.get("score", 0), "last": p.get("last", "-"), "submitted": p.get("pending") is not None})
        elif gt == "heavy_13":
            po.update({
                "penalty": p.get("penalty", 0),
                "last": p.get("last", "-"),
                "submitted": p.get("pending") is not None,
                "cards": p.get("cards", []) if is_me else [],
                "chips": p.get("chips", {}) if is_me else {},
            })
        elif gt == "mystery_exchange":
            stocks = st.get("stocks", [])
            tot = p.get("cash", 0) + sum(p.get("holdings", {}).get(s["id"], 0) * s["price"] for s in stocks)
            po.update({
                "cash": p.get("cash", 0) if is_me else None,
                "holdings": p.get("holdings", {}) if is_me else {},
                "total_asset": tot,
                "ready": p.get("ready", False),
            })
        elif gt == "russian_roulette":
            po.update({
                "credits": p.get("credits", 0) if (is_me or done) else None,
                "dead": p.get("dead", False),
                "passed": p.get("passed", False),
                "is_turn": idx == st.get("turn_idx", 0) and room["phase"] == "PLAYING",
                "is_aimed": idx == st.get("aim_idx", 0),
            })
        elif gt == "gem_market":
            m_idx = p.get("manitto_idx", 0)
            po.update({
                "pts": p.get("pts", 0),
                "submitted": p.get("pending") is not None,
                "hand": p.get("hand", []) if (is_me or done) else [],
                "manitto_idx": m_idx if (is_me or done) else None,
                "manitto_name": ps[m_idx]["name"] if (is_me or done) and m_idx < len(ps) else None,
                "final_score": p.get("pts", 0) * ps[m_idx].get("pts", 0) if done and m_idx < len(ps) else None,
            })
        elif gt == "piggy_bank":
            po.update({"score": p.get("score", 0)})
        players_out.append(po)

    state_out = dict(st)
    if gt == "russian_roulette" and "chambers" in st:
        state_out["chambers"] = [
            {
                "idx": c["idx"],
                "known": c["pub"] or (viewer_id in c["priv_by"]) or done,
                "priv": (viewer_id in c["priv_by"]) and not c["pub"],
                "bullet": c["bullet"] if (c["pub"] or (viewer_id in c["priv_by"]) or done) else None,
                "fired": c["fired"],
            }
            for c in st["chambers"]
        ]
    elif gt == "piggy_bank" and "banks" in st:
        state_out["banks"] = [
            {"id": b["id"], "black": b["black"] if done else None, "white": b["white"] if done else None}
            for b in st["banks"]
        ]

    return {
        "room_id": room["room_id"],
        "game_type": gt,
        "meta": GAME_META[gt],
        "host_id": room["host_id"],
        "viewer_id": viewer_id,
        "phase": room["phase"],
        "round": room["round"],
        "players": players_out,
        "state": state_out,
        "banner": room["banner"],
        "log": room["log"],
    }
