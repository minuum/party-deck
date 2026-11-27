import json
import math
import os
import random
import string
import urllib.request
from typing import Dict, List, Optional, Tuple

BOT_NAMES = ["VIPER", "NOVA", "KRONOS", "ORION", "ZEPHYR", "ATLAS"]

AI_TIERS = ("easy", "normal", "pro", "devil")

GAME_META = {
    "choice": {"title": "양자택일", "day": "1일차 메인매치", "max_players": 7, "min_players": 2},
    "heavy_13": {"title": "무거운 13", "day": "1일차 감옥매치", "max_players": 5, "min_players": 2},
    "mystery_exchange": {"title": "미스터리 거래소", "day": "2일차 메인매치", "max_players": 6, "min_players": 2},
    "russian_roulette": {"title": "러시안 룰렛", "day": "2일차 감옥매치", "max_players": 6, "min_players": 2},
    "gem_market": {"title": "보석 암시장", "day": "3일차 메인매치", "max_players": 6, "min_players": 2},
    "piggy_bank": {"title": "돼지 저금통", "day": "3일차 감옥매치", "max_players": 5, "min_players": 2},
    "auction_bingo": {"title": "경매 빙고", "day": "4일차 메인매치", "max_players": 5, "min_players": 2},
    "wall_go_2": {"title": "벽바둑 2", "day": "4일차 감옥매치", "max_players": 4, "min_players": 2},
    "hidden_word": {"title": "히든 워드", "day": "5일차 메인매치", "max_players": 6, "min_players": 2},
    "formula_tower": {"title": "수식의 탑", "day": "5일차 감옥매치", "max_players": 5, "min_players": 2},
    "gradation": {"title": "그라데이션", "day": "6일차 감옥매치", "max_players": 5, "min_players": 2},
    "card_janggi": {"title": "카드 장기", "day": "결승 1회전", "max_players": 2, "min_players": 2},
    "color_link": {"title": "컬러 링크", "day": "결승 2회전", "max_players": 4, "min_players": 2},
    "secret_code": {"title": "비밀 코드", "day": "유배지 03", "max_players": 6, "min_players": 2},
}

HW_ENVELOPES = [
    ["우산", "도서관", "화산", "나침반", "시계"],
    ["지하철", "사막", "피아노", "망원경", "등대"],
    ["커피", "우주선", "바이올린", "미로", "빙하"],
    ["카메라", "오로라", "체스", "열기구", "모래시계"],
    ["비행기", "해바라기", "가면", "다이아몬드", "폭포"],
    ["교실", "펭귄", "거울", "잠수함", "불꽃놀이"],
]

HW_HINTS_BANK = {
    "우산": ["비", "장마", "손잡이", "방수", "날씨", "우비"],
    "도서관": ["책", "열람실", "사서", "대출", "공부", "서점"],
    "화산": ["용암", "마그마", "분화", "지진", "산", "폭발"],
    "나침반": ["방향", "자석", "북쪽", "지도", "항해", "탐험"],
    "시계": ["시간", "바늘", "알람", "손목", "초침", "약속"],
    "지하철": ["전철", "역", "선로", "출퇴근", "교통카드", "열차"],
    "사막": ["모래", "낙타", "오아시스", "건조", "태양", "선인장"],
    "피아노": ["건반", "음악", "연주", "악기", "화음", "클래식"],
    "망원경": ["별", "관측", "렌즈", "우주", "천문학", "확대"],
    "등대": ["바다", "불빛", "항구", "배", "해안", "안내"],
    "커피": ["카페", "원두", "카페인", "에스프레소", "아침", "향기"],
    "우주선": ["로켓", "우주", "발사", "행성", "비행", "달"],
    "바이올린": ["현악기", "활", "오케스트라", "선율", "음악", "연주"],
    "미로": ["출구", "길", "복잡", "퍼즐", "탈출", "벽"],
    "빙하": ["얼음", "남극", "북극", "바다", "눈", "추위"],
    "카메라": ["사진", "렌즈", "셔터", "촬영", "필름", "추억"],
    "오로라": ["극지방", "하늘", "빛", "밤", "초록", "자연"],
    "체스": ["킹", "퀸", "보드게임", "전략", "말", "체크메이트"],
    "열기구": ["하늘", "풍선", "바람", "불꽃", "비행", "여행"],
    "모래시계": ["모래", "시간", "유리", "측정", "제한", "뒤집기"],
    "비행기": ["공항", "하늘", "날개", "여행", "조종사", "활주로"],
    "해바라기": ["꽃", "태양", "노랑", "씨앗", "여름", "식물"],
    "가면": ["얼굴", "위장", "축제", "비밀", "연극", "마스크"],
    "다이아몬드": ["보석", "반지", "광채", "투명", "고급", "경도"],
    "폭포": ["물", "절벽", "계곡", "시원", "물줄기", "자연"],
    "교실": ["칠판", "학교", "책상", "학생", "선생님", "수업"],
    "펭귄": ["남극", "얼음", "새", "수영", "흑백", "추위"],
    "거울": ["반사", "얼굴", "유리", "모습", "화장대", "빛"],
    "잠수함": ["바다", "심해", "잠수", "해군", "어뢰", "수중"],
    "불꽃놀이": ["밤하늘", "축제", "폭죽", "빛", "소리", "여름"],
}


def _gemini_korean_relation_score(secret: str, word: str, api_key: str) -> Optional[float]:
    prompt = (
        f"너는 한국어 의미 유사도 판정기다. 두 한국어 명사 '{secret}'와(과) '{word}'의 종합 유사도를 0.0~99.0 사이의 숫자 하나로만 평가하라.\n"
        "기준: 1) 의미적 거리(유의어/하위어 85~98), 2) 문맥적 공생(같은 상황·장소 60~84), 3) 관계적 구조(약한 연상 30~59, 무관 5~29).\n"
        '반드시 JSON 형식으로만 답하라: {"score": 72.5}'
    )
    for model in ("gemini-2.5-flash", "gemini-2.0-flash"):
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
        gen_cfg = {
            "temperature": 0.0,
            "maxOutputTokens": 128,
            "responseMimeType": "application/json",
        }
        if model.startswith("gemini-2.5"):
            gen_cfg["thinkingConfig"] = {"thinkingBudget": 0}
        body = json.dumps({
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": gen_cfg,
        }).encode("utf-8")
        req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"}, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=6) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                txt = data["candidates"][0]["content"]["parts"][0]["text"]
                parsed = json.loads(txt)
                sc = float(parsed.get("score"))
                return round(max(1.0, min(99.0, sc)), 1)
        except Exception:
            continue
    return None


def _gemini_embed(text: str, api_key: str) -> Optional[List[float]]:
    for model in ("gemini-embedding-001", "text-embedding-004"):
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:embedContent?key={api_key}"
        body = json.dumps({
            "model": f"models/{model}",
            "taskType": "SEMANTIC_SIMILARITY",
            "content": {"parts": [{"text": text}]},
        }).encode("utf-8")
        req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"}, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=5) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                vals = data.get("embedding", {}).get("values")
                if vals:
                    return vals
        except Exception:
            continue
    return None


def compute_korean_similarity(secret: str, word: str) -> Tuple[float, str]:
    s = secret.strip()
    w = word.strip()
    if not s or not w:
        return 0.0, "empty"
    if s == w:
        return 100.0, "exact"

    api_key = os.environ.get("GEMINI_API_KEY", "").strip().strip('"').strip("'")
    if api_key:
        # 1) Primary: Korean 3-axis semantic relationship model (Gemini Flash)
        llm_score = _gemini_korean_relation_score(s, w, api_key)
        if llm_score is not None:
            return llm_score, "gemini-kr"

        # 2) Secondary: Gemini Embedding cosine similarity
        v1 = _gemini_embed(s, api_key)
        v2 = _gemini_embed(w, api_key)
        if v1 and v2 and len(v1) == len(v2):
            dot = sum(a * b for a, b in zip(v1, v2))
            n1 = math.sqrt(sum(a * a for a in v1))
            n2 = math.sqrt(sum(b * b for b in v2))
            cos = dot / (n1 * n2) if n1 and n2 else 0.0
            norm = max(0.0, min(1.0, (cos - 0.52) / 0.38))
            pct = 5.0 + (norm ** 1.25) * 93.5
            return round(pct, 1), "gemini"

    # Built-in fallback semantic + lexical scorer when GEMINI_API_KEY is not set
    rel = HW_HINTS_BANK.get(s, [])
    if w in rel:
        idx = rel.index(w)
        return round(88.0 - idx * 4.5 + random.uniform(-1.5, 1.5), 1), "local"
    if any(w in r or r in w for r in rel):
        return round(72.0 + random.uniform(-4.0, 6.0), 1), "local"
    # Shared Hangul syllables
    overlap = len(set(s) & set(w))
    base = 18.0 + overlap * 19.0
    # Deterministic hash jitter so same word always yields same score
    h = sum(ord(ch) for ch in (s + w)) % 17
    return round(min(94.0, base + h), 1), "local"

GM_CARDS = [
    {"id": "dia", "label": "💎 다이아", "pts": 5, "isBomb": False},
    {"id": "gold", "label": "🥇 금", "pts": 4, "isBomb": False},
    {"id": "silver", "label": "🥈 은", "pts": 3, "isBomb": False},
    {"id": "bronze", "label": "🥉 동", "pts": 2, "isBomb": False},
    {"id": "bomb4", "label": "💣 폭탄", "pts": -4, "isBomb": True},
    {"id": "bomb6", "label": "💥 대폭탄", "pts": -6, "isBomb": True},
]

EX_RULE_POOL = [
    {"rule_id": "even_up", "desc": "짝수 라운드 +35% 급등 / 홀수 라운드 -15% 조정"},
    {"rule_id": "mod3_drop", "desc": "평소 +20% 상승 / 3의 배수 라운드 -28% 급락"},
    {"rule_id": "inverse", "desc": "상승 종목 2개 이하일 때 반대로 +38% 급등 (인버스)"},
    {"rule_id": "streak2_boom", "desc": "2연속 하락 후 반드시 +68% 대폭등 반등"},
    {"rule_id": "follow_bull", "desc": "직전 라운드 상승 종목 4개 이상이면 +28% 동반 급등"},
    {"rule_id": "box_range", "desc": "10,500원↓ +42% 반등 / 17,000원↑ -25% 차익실현"},
    {"rule_id": "late_volatile", "desc": "R1~7 꾸준히 +18% 상승 / R8~10 고변동성(±40%)"},
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


def add_ai_to_room(room: dict, difficulty: str = "normal") -> bool:
    meta = GAME_META[room["game_type"]]
    if len(room["players"]) >= meta["max_players"]:
        return False
    diff = difficulty if difficulty in AI_TIERS else "normal"
    existing = {p["name"] for p in room["players"]}
    for idx, bn in enumerate(BOT_NAMES, start=1):
        if bn not in existing:
            room["players"].append({
                "id": f"ai_{idx}_{random.randint(100,999)}",
                "name": bn,
                "is_ai": True,
                "ai_level": diff,
            })
            return True
    return False


def set_ai_level_in_room(room: dict, target_id: str, level: str) -> bool:
    if level not in AI_TIERS:
        return False
    for p in room["players"]:
        if p["id"] == target_id and p["is_ai"]:
            p["ai_level"] = level
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
        rule_mode = room.get("rule_mode", "classic")  # classic or shuffle
        rules = [dict(r) for r in EX_RULE_POOL]
        if rule_mode == "shuffle":
            random.shuffle(rules)
        stocks = []
        for s, rl in zip(EX_INIT_STOCKS, rules):
            sd = dict(s)
            sd["history"] = [10000]
            sd["rule_id"] = rl["rule_id"]
            sd["rule_desc"] = rl["desc"]
            sd["rule_revealed"] = False
            stocks.append(sd)
        for p in ps:
            p["cash"] = 100000
            p["holdings"] = {s["id"]: 0 for s in EX_INIT_STOCKS}
            p["ready"] = False
        room["state"] = {
            "max_rounds": 10,
            "rule_mode": rule_mode,
            "stocks": stocks,
        }
        mode_lbl = "🎲 랜덤 룰 섞기" if rule_mode == "shuffle" else "🏛️ 데블스 원작 룰"
        room["banner"] = f"📈 라운드 1 개장 ({mode_lbl})! 매 라운드 종료 시 종목 1개의 비밀 룰이 공개됩니다."
        room["log"] = "초반엔 주가 차트로 추리하고, 매 라운드 공개되는 비밀 룰을 공략하세요!"

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

    elif gt == "auction_bingo":
        pool = list(range(1, 26))
        random.shuffle(pool)
        for p in ps:
            board = list(range(1, 26))
            random.shuffle(board)
            p["board"] = board
            p["marked"] = []
            p["chips"] = 40
            p["lines"] = 0
            p["pending"] = None
        room["state"] = {"max_rounds": 15, "pool": pool[1:], "current_num": pool[0]}
        room["banner"] = f"🔨 경매 1라운드! 매물 번호 [ {pool[0]} ] — 칩을 비공개 입찰하세요!"
        room["log"] = "최고 입찰자가 번호를 낙찰받아 빙고판에 체크! 먼저 3줄 빙고 시 우승!"

    elif gt == "wall_go_2":
        # 5x5 grid: each player gets 1 piece at corners
        starts = [(0, 0), (4, 4), (0, 4), (4, 0)]
        for i, p in enumerate(ps):
            r, c = starts[i % 4]
            p["pos"] = [r, c]
            p["territory"] = 1
        room["state"] = {
            "turn_idx": 0,
            "max_rounds": 20,
            "walls": [],  # list of "r,c,dir" where dir in ("N","S","E","W")
        }
        room["banner"] = f"🧱 벽바둑 2 시작! {ps[0]['name']}님 차례 — 인접 칸으로 이동 후 벽을 세우세요!"
        room["log"] = "벽으로 영토를 넓히고 상대를 가두세요! 20턴 종료 시 최대 영토 우승!"
        _wg_advance_ai(room)

    elif gt == "hidden_word":
        for p in ps:
            p["score"] = 0
            p["pending_guess"] = None
            p["last_guess"] = "-"
        env = random.choice(HW_ENVELOPES)
        room["state"] = {
            "sub_phase": "PICK_SECRET",  # PICK_SECRET, HINT, GUESS
            "setter_idx": 0,
            "envelope": list(env),
            "secret": "",
            "hints": [],  # [{word, sim, engine}]
            "max_hints": 10,
            "max_rounds": len(ps),
            "ai_engine": "gemini" if os.environ.get("GEMINI_API_KEY") else "local",
        }
        room["banner"] = f"🔤 라운드 1 · 출제자 [{ps[0]['name']}]님이 봉투(5개 명사) 중 1개를 히든 워드로 고릅니다!"
        room["log"] = "유사도 95% 이상 힌트가 나오면 즉시 힌트 단계가 조기 종료됩니다!"
        _hw_advance_ai(room)

    elif gt == "formula_tower":
        for p in ps:
            p["tower"] = 0
            p["pending"] = None
            p["last_expr"] = "-"
        nums = sorted(random.sample(range(1, 10), 4))
        target = random.randint(12, 48)
        room["state"] = {"target": target, "nums": nums, "goal_floors": 5}
        room["banner"] = f"🗼 목표 숫자 [ {target} ]! 주어진 4개 숫자({nums})와 + - × 로 가장 가깝게 만드세요!"
        room["log"] = "매 라운드 목표에 가장 가까운 플레이어가 탑 +1층! 먼저 5층 달성 시 우승!"

    elif gt == "gradation":
        deck = list(range(1, 31))
        random.shuffle(deck)
        for p in ps:
            p["hand"] = sorted([deck.pop() for _ in range(5)])
        line = [deck.pop()]
        room["state"] = {"deck": deck, "line": line, "turn_idx": 0}
        room["banner"] = f"🌈 그라데이션 시작! 기준선 {line}에 오름차순으로 카드를 끼워 넣으세요!"
        room["log"] = "손패를 가장 먼저 0장으로 만드는 플레이어가 우승! 못 넣으면 카드 +1장 드로우!"
        _gr_advance_ai(room)

    elif gt == "card_janggi":
        # 4x4 tactical board: 0=Top(P1), 3=Bottom(P0)
        # Pieces: K(왕), R(차), N(마), P(졸)
        pieces = [
            {"id": "p0_K", "owner": 0, "type": "K", "label": "👑", "r": 3, "c": 1},
            {"id": "p0_R", "owner": 0, "type": "R", "label": "♜", "r": 3, "c": 0},
            {"id": "p0_N", "owner": 0, "type": "N", "label": "🐴", "r": 3, "c": 2},
            {"id": "p0_P", "owner": 0, "type": "P", "label": "⚔️", "r": 2, "c": 1},
            {"id": "p1_K", "owner": 1, "type": "K", "label": "👑", "r": 0, "c": 2},
            {"id": "p1_R", "owner": 1, "type": "R", "label": "♜", "r": 0, "c": 3},
            {"id": "p1_N", "owner": 1, "type": "N", "label": "🐴", "r": 0, "c": 1},
            {"id": "p1_P", "owner": 1, "type": "P", "label": "⚔️", "r": 1, "c": 2},
        ]
        room["state"] = {"pieces": pieces, "turn_idx": 0, "max_rounds": 30}
        room["banner"] = f"♟️ 결승 1회전 카드 장기! {ps[0]['name']}님 선공 — 상대 왕(👑)을 잡으세요!"
        room["log"] = "👑상하좌우 1칸 · ♜직선 2칸 · 🐴대각선 1칸 · ⚔️전진/좌우 1칸"
        _cj_advance_ai(room)

    elif gt == "color_link":
        for p in ps:
            p["max_chain"] = 0
        grid = [-1] * 25
        room["state"] = {"grid": grid, "turn_idx": 0, "goal_chain": 6}
        room["banner"] = f"🔗 결승 2회전 컬러 링크! {ps[0]['name']}님 차례 — 빈 칸을 눌러 내 색상을 연결하세요!"
        room["log"] = "상하좌우로 연결된 내 색상 체인이 먼저 6칸이 되거나 보드 종료 시 최장 체인 승리!"
        _cl_advance_ai(room)

    elif gt == "secret_code":
        digits = [str(d) for d in random.sample(range(10), 4)]
        code = "".join(digits)
        for p in ps:
            p["guesses"] = []
            p["solved"] = False
        room["state"] = {"secret": code, "winner_name": None}
        room["banner"] = "🔐 비밀 코드(중복 없는 4자리 숫자)를 가장 먼저 해독하세요!"
        room["log"] = "🟢 스트라이크(자리+숫자 일치) · 🟡 볼(숫자만 포함)"


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
            add_ai_to_room(room, payload.get("ai_level", "normal"))
        elif act == "remove_ai":
            remove_ai_from_room(room, payload.get("target_id"))
        elif act == "set_ai_level":
            set_ai_level_in_room(room, payload.get("target_id", ""), payload.get("ai_level", "normal"))
        elif act == "set_rule_mode":
            rm = payload.get("rule_mode", "classic")
            if rm in ("classic", "shuffle"):
                room["rule_mode"] = rm
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
    if gt == "auction_bingo":
        return _act_auction_bingo(room, me, payload)
    if gt == "wall_go_2":
        return _act_wall_go(room, me, payload)
    if gt == "hidden_word":
        return _act_hidden_word(room, me, payload)
    if gt == "formula_tower":
        return _act_formula_tower(room, me, payload)
    if gt == "gradation":
        return _act_gradation(room, me, payload)
    if gt == "card_janggi":
        return _act_card_janggi(room, me, payload)
    if gt == "color_link":
        return _act_color_link(room, me, payload)
    if gt == "secret_code":
        return _act_secret_code(room, me, payload)
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
            inv_stocks = []
            for s in stocks:
                s["prev"] = s["price"]
                rid = s.get("rule_id", "even_up")
                if rid == "inverse":
                    inv_stocks.append(s)
                    continue
                if rid == "even_up":
                    m = 1.35 if r % 2 == 0 else 0.85
                elif rid == "mod3_drop":
                    m = 0.72 if r % 3 == 0 else 1.2
                elif rid == "streak2_boom":
                    if s["streakDown"] >= 2:
                        m = 1.68
                        s["streakDown"] = 0
                    else:
                        m = 0.84
                        s["streakDown"] += 1
                elif rid == "follow_bull":
                    m = 1.28 if prev_ups >= 4 else 0.9
                elif rid == "box_range":
                    m = 1.42 if s["price"] <= 10500 else (0.75 if s["price"] >= 17000 else 1.08)
                else:
                    m = 1.18 if r <= 7 else (1.42 if random.random() < 0.5 else 0.64)
                s["price"] = max(2000, round((s["price"] * m) / 100) * 100)
                s.setdefault("history", [10000]).append(s["price"])
                if s["price"] > s["prev"]:
                    up_cnt += 1
            for bg in inv_stocks:
                bg["price"] = max(2000, round((bg["price"] * (1.38 if up_cnt <= 2 else 0.88)) / 100) * 100)
                bg.setdefault("history", [10000]).append(bg["price"])

            # Reveal 1 hidden stock rule per round!
            hidden_stocks = [s for s in stocks if not s.get("rule_revealed")]
            revealed_msg = ""
            if hidden_stocks:
                pick_rev = random.choice(hidden_stocks)
                pick_rev["rule_revealed"] = True
                revealed_msg = f"🔓 [{pick_rev['name']}] 룰 공개: {pick_rev['rule_desc']}"

            for p in room["players"]:
                p["ready"] = False
            if room["round"] >= room["state"]["max_rounds"]:
                room["phase"] = "DONE"
                for s in stocks:
                    s["rule_revealed"] = True
                def total_a(pl):
                    return pl["cash"] + sum(pl["holdings"][s["id"]] * s["price"] for s in stocks)
                top = max(room["players"], key=total_a)
                room["banner"] = f"🏆 최종 1위: {top['name']} ({total_a(top):,}원!)"
                room["log"] = "모든 종목의 숨겨진 룰이 공개되었습니다!"
            else:
                room["round"] += 1
                room["banner"] = f"📊 R{r} 마감! (상승 {up_cnt}종목) {revealed_msg}"
                room["log"] = revealed_msg or "모든 룰이 공개되었습니다! 마지막까지 수익을 극대화하세요."
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


# --- 7. 경매 빙고 (Auction Bingo) ---
def _count_bingo_lines(board: List[int], marked: List[int]) -> int:
    mset = set(marked)
    lines = 0
    for r in range(5):
        if all(board[r * 5 + c] in mset for c in range(5)):
            lines += 1
    for c in range(5):
        if all(board[r * 5 + c] in mset for r in range(5)):
            lines += 1
    if all(board[i * 5 + i] in mset for i in range(5)):
        lines += 1
    if all(board[i * 5 + (4 - i)] in mset for i in range(5)):
        lines += 1
    return lines


def _act_auction_bingo(room: dict, me: dict, payload: dict):
    bid = max(0, min(me["chips"], int(payload.get("bid", 0))))
    me["pending"] = bid
    for p in room["players"]:
        if p["is_ai"] and p["pending"] is None:
            p["pending"] = min(p["chips"], random.randint(0, min(8, p["chips"])))

    if all(p["pending"] is not None for p in room["players"]):
        st = room["state"]
        num = st["current_num"]
        max_bid = max(p["pending"] for p in room["players"])
        top_bidders = [p for p in room["players"] if p["pending"] == max_bid]
        winner = random.choice(top_bidders)
        winner["chips"] -= max_bid
        if num not in winner["marked"]:
            winner["marked"].append(num)
        winner["lines"] = _count_bingo_lines(winner["board"], winner["marked"])
        bid_log = ", ".join(f"{p['name']}({p['pending']}칩)" for p in room["players"])
        for p in room["players"]:
            p["pending"] = None

        if winner["lines"] >= 3 or room["round"] >= st["max_rounds"] or not st["pool"]:
            room["phase"] = "DONE"
            champ = max(room["players"], key=lambda x: (x["lines"], len(x["marked"]), x["chips"]))
            room["banner"] = f"🏆 경매 빙고 우승: {champ['name']} ({champ['lines']}줄 빙고, {len(champ['marked'])}칸!)"
            room["log"] = f"마지막 낙찰: {winner['name']} ({num}번, {max_bid}칩)"
        else:
            room["round"] += 1
            st["current_num"] = st["pool"].pop(0)
            room["banner"] = f"🔨 {winner['name']}님이 [{num}] 낙찰 ({max_bid}칩)! 다음 매물: [ {st['current_num']} ]"
            room["log"] = f"입찰 내역: {bid_log}"
    else:
        w = sum(1 for p in room["players"] if p["pending"] is None)
        room["log"] = f"⏳ 다른 플레이어 {w}명 입찰 대기 중..."
    return None


# --- 8. 벽바둑 2 (Wall Go 2) ---
def _wg_has_wall(walls: List[str], r: int, c: int, d: str) -> bool:
    opp = {"N": (-1, 0, "S"), "S": (1, 0, "N"), "E": (0, 1, "W"), "W": (0, -1, "E")}
    dr, dc, od = opp[d]
    return f"{r},{c},{d}" in walls or f"{r+dr},{c+dc},{od}" in walls


def _wg_calc_territories(room: dict):
    walls = room["state"]["walls"]
    ps = room["players"]
    for p in ps:
        sr, sc = p["pos"]
        seen = {(sr, sc)}
        q = [(sr, sc)]
        while q:
            r, c = q.pop(0)
            for d, (dr, dc) in [("N", (-1, 0)), ("S", (1, 0)), ("E", (0, 1)), ("W", (0, -1))]:
                nr, nc = r + dr, c + dc
                if 0 <= nr < 5 and 0 <= nc < 5 and (nr, nc) not in seen and not _wg_has_wall(walls, r, c, d):
                    seen.add((nr, nc))
                    q.append((nr, nc))
        p["territory"] = len(seen)


def _wg_advance_ai(room: dict):
    st = room["state"]
    ps = room["players"]
    guard = 0
    while room["phase"] == "PLAYING" and guard < 8:
        guard += 1
        curr = ps[st["turn_idx"]]
        if not curr["is_ai"]:
            return
        r, c = curr["pos"]
        dirs = [("N", (-1, 0)), ("S", (1, 0)), ("E", (0, 1)), ("W", (0, -1))]
        valid_moves = []
        occupied = {tuple(p["pos"]) for p in ps if p["id"] != curr["id"]}
        for d, (dr, dc) in dirs:
            nr, nc = r + dr, c + dc
            if 0 <= nr < 5 and 0 <= nc < 5 and (nr, nc) not in occupied and not _wg_has_wall(st["walls"], r, c, d):
                valid_moves.append((nr, nc))
        if valid_moves:
            nr, nc = random.choice(valid_moves)
            curr["pos"] = [nr, nc]
        # Place random wall around new pos
        r2, c2 = curr["pos"]
        w_opts = [d for d, (dr, dc) in dirs if 0 <= r2 + dr < 5 and 0 <= c2 + dc < 5 and not _wg_has_wall(st["walls"], r2, c2, d)]
        if w_opts:
            wd = random.choice(w_opts)
            st["walls"].append(f"{r2},{c2},{wd}")
        _wg_calc_territories(room)
        room["round"] += 1
        if room["round"] > st["max_rounds"]:
            room["phase"] = "DONE"
            champ = max(ps, key=lambda x: x["territory"])
            room["banner"] = f"🏆 벽바둑 2 우승: {champ['name']} (영토 {champ['territory']}칸!)"
            return
        st["turn_idx"] = (st["turn_idx"] + 1) % len(ps)
        room["banner"] = f"🧱 {ps[st['turn_idx']]['name']}님 차례! 이동할 칸과 벽 방향을 선택하세요."


def _act_wall_go(room: dict, me: dict, payload: dict):
    st = room["state"]
    ps = room["players"]
    if ps[st["turn_idx"]]["id"] != me["id"]:
        return "내 차례가 아닙니다."
    nr = int(payload.get("r", me["pos"][0]))
    nc = int(payload.get("c", me["pos"][1]))
    wd = payload.get("wall_dir", "N")
    r, c = me["pos"]
    dist = abs(nr - r) + abs(nc - c)
    if dist > 1 or not (0 <= nr < 5 and 0 <= nc < 5):
        return "인접한 1칸(또는 제자리)으로만 이동할 수 있습니다."
    if dist == 1:
        move_d = "N" if nr < r else ("S" if nr > r else ("W" if nc < c else "E"))
        if _wg_has_wall(st["walls"], r, c, move_d):
            return "벽이 막고 있어 이동할 수 없습니다!"
        if any(p["pos"] == [nr, nc] and p["id"] != me["id"] for p in ps):
            return "다른 플레이어가 있는 칸입니다!"
        me["pos"] = [nr, nc]
    if wd in ("N", "S", "E", "W") and not _wg_has_wall(st["walls"], nr, nc, wd):
        st["walls"].append(f"{nr},{nc},{wd}")
    _wg_calc_territories(room)
    room["round"] += 1
    if room["round"] > st["max_rounds"]:
        room["phase"] = "DONE"
        champ = max(ps, key=lambda x: x["territory"])
        room["banner"] = f"🏆 벽바둑 2 우승: {champ['name']} (영토 {champ['territory']}칸!)"
        return None
    st["turn_idx"] = (st["turn_idx"] + 1) % len(ps)
    room["banner"] = f"🧱 {me['name']} 이동 & 벽 설치! 다음: {ps[st['turn_idx']]['name']}"
    _wg_advance_ai(room)
    return None


# --- 9. 히든 워드 (Original Day 5 Main Match: Korean Noun AI Similarity) ---
def _hw_advance_ai(room: dict):
    st = room["state"]
    ps = room["players"]
    setter = ps[st["setter_idx"]]
    if st["sub_phase"] == "PICK_SECRET" and setter["is_ai"]:
        st["secret"] = random.choice(st["envelope"])
        st["sub_phase"] = "HINT"
        # AI setter gives 3 strategic Korean noun hints automatically
        bank = list(HW_HINTS_BANK.get(st["secret"], ["자연", "사물", "일상"]))
        random.shuffle(bank)
        for hw in bank[:3]:
            sim, eng = compute_korean_similarity(st["secret"], hw)
            st["hints"].append({"word": hw, "sim": sim, "engine": eng})
            st["ai_engine"] = eng
        st["sub_phase"] = "GUESS"
        room["banner"] = f"🤖 출제자 {setter['name']}이(가) 힌트 {len(st['hints'])}개를 공개했습니다! 히든 워드를 유추하세요!"
        room["log"] = "힌트와 AI 유사도(%)를 보고 정확한 한글 명사를 제출하세요!"


def _act_hidden_word(room: dict, me: dict, payload: dict):
    st = room["state"]
    ps = room["players"]
    setter = ps[st["setter_idx"]]
    act = payload.get("action", "")

    if st["sub_phase"] == "PICK_SECRET":
        if me["id"] != setter["id"]:
            return "출제자만 히든 워드를 선택할 수 있습니다."
        word = (payload.get("word") or "").strip()
        if word not in st["envelope"]:
            return "봉투 속 5개 단어 중 1개를 선택하세요."
        st["secret"] = word
        st["sub_phase"] = "HINT"
        room["banner"] = f"🔐 히든 워드 확정! 이제 한글 명사 힌트를 제시하세요 (최대 10개, 95%↑ 조기종료)"
        return None

    if st["sub_phase"] == "HINT":
        if me["id"] != setter["id"]:
            return "출제자만 힌트를 낼 수 있습니다."
        if act == "finish_hints":
            if not st["hints"]:
                return "최소 1개 이상의 힌트를 제시해야 합니다."
            st["sub_phase"] = "GUESS"
            room["banner"] = f"🎯 힌트 종료! 나머지 플레이어들은 {setter['name']}님의 히든 워드를 유추하세요!"
            return None
        word = (payload.get("word") or "").strip()
        if not word or len(word) > 12:
            return "한글 명사 힌트를 입력하세요."
        if word == st["secret"]:
            return "정답 단어 그대로는 힌트로 낼 수 없습니다!"
        sim, eng = compute_korean_similarity(st["secret"], word)
        st["ai_engine"] = eng
        st["hints"].append({"word": word, "sim": sim, "engine": eng})
        if sim >= 95.0 or len(st["hints"]) >= st["max_hints"]:
            st["sub_phase"] = "GUESS"
            reason = "🔥 유사도 95% 이상 조기 종료!" if sim >= 95.0 else "힌트 10개 소진!"
            room["banner"] = f"{reason} 이제 나머지 플레이어들이 히든 워드를 추리합니다!"
        else:
            room["banner"] = f"💡 힌트 [{word}] → AI 유사도 {sim}%! ({len(st['hints'])}/10)"
        return None

    if st["sub_phase"] == "GUESS":
        if me["id"] == setter["id"]:
            return "출제자는 정답을 제출할 수 없습니다."
        guess = (payload.get("guess") or "").strip()
        if not guess:
            return "추리할 한글 명사를 입력하세요."
        sim, eng = compute_korean_similarity(st["secret"], guess)
        st["ai_engine"] = eng
        me["pending_guess"] = {"word": guess, "sim": sim}

        # AI guessers submit
        for p in ps:
            if p["id"] != setter["id"] and p["is_ai"] and p["pending_guess"] is None:
                ai_w = st["secret"] if random.random() < 0.25 else random.choice(st["envelope"])
                asim, _ = compute_korean_similarity(st["secret"], ai_w)
                p["pending_guess"] = {"word": ai_w, "sim": asim}

        guessers = [p for p in ps if p["id"] != setter["id"]]
        if all(p["pending_guess"] is not None for p in guessers):
            any_exact = False
            for p in guessers:
                g = p["pending_guess"]
                p["last_guess"] = f"{g['word']}({g['sim']}%)"
                if g["word"] == st["secret"] or g["sim"] >= 99.9:
                    p["score"] += 3
                    any_exact = True
                elif g["sim"] >= 85.0:
                    p["score"] += 1
                p["pending_guess"] = None
            max_hint_sim = max((h["sim"] for h in st["hints"]), default=0)
            if not any_exact and max_hint_sim >= 50.0:
                setter["score"] += 2
                setter["last_guess"] = "방어성공(+2)"
            else:
                setter["last_guess"] = f"정답:{st['secret']}"

            prev_secret = st["secret"]
            if room["round"] >= st["max_rounds"]:
                room["phase"] = "DONE"
                champ = max(ps, key=lambda x: x["score"])
                room["banner"] = f"🏆 히든 워드 최종 우승: {champ['name']} ({champ['score']}점)!"
                room["log"] = f"마지막 라운드 정답: [{prev_secret}]"
            else:
                room["round"] += 1
                st["setter_idx"] = (st["setter_idx"] + 1) % len(ps)
                st["envelope"] = list(random.choice(HW_ENVELOPES))
                st["secret"] = ""
                st["hints"] = []
                st["sub_phase"] = "PICK_SECRET"
                nxt = ps[st["setter_idx"]]
                room["banner"] = f"✨ 직전 정답 [{prev_secret}]! R{room['round']} 출제자: {nxt['name']}"
                room["log"] = f"{nxt['name']}님이 새 봉투에서 히든 워드를 선택합니다."
                _hw_advance_ai(room)
        else:
            w = sum(1 for p in guessers if p["pending_guess"] is None)
            room["log"] = f"⏳ 다른 추리자 {w}명 제출 대기 중..."
        return None
    return "현재 수행할 수 없는 행동입니다."


# --- 10. 수식의 탑 (Formula Tower) ---
def _act_formula_tower(room: dict, me: dict, payload: dict):
    expr = (payload.get("expr") or "").strip().replace("×", "*").replace("÷", "/")
    st = room["state"]
    if not expr or any(ch not in "0123456789+-*/() " for ch in expr):
        return "숫자와 연산자(+ - × ÷)만 사용하세요."
    try:
        val = eval(expr, {"__builtins__": {}}, {})
        val = round(float(val), 2)
    except Exception:
        return "올바른 수식이 아닙니다."
    me["pending"] = {"expr": payload.get("expr", expr), "val": val, "diff": abs(val - st["target"])}

    for p in room["players"]:
        if p["is_ai"] and p["pending"] is None:
            a, b, c, d = st["nums"]
            cands = [
                (f"{d}×{c}+{b}-{a}", d * c + b - a),
                (f"{d}×{b}+{c}+{a}", d * b + c + a),
                (f"{c}×{b}+{d}-{a}", c * b + d - a),
                (f"({d}+{c})×{a}+{b}", (d + c) * a + b),
            ]
            best_e, best_v = min(cands, key=lambda x: abs(x[1] - st["target"]))
            p["pending"] = {"expr": best_e, "val": best_v, "diff": abs(best_v - st["target"])}

    if all(p["pending"] is not None for p in room["players"]):
        best_diff = min(p["pending"]["diff"] for p in room["players"])
        winners = [p for p in room["players"] if p["pending"]["diff"] == best_diff]
        for p in room["players"]:
            p["last_expr"] = f"{p['pending']['expr']}={p['pending']['val']}"
            if p in winners:
                p["tower"] += 1
            p["pending"] = None
        w_names = ", ".join(w["name"] for w in winners)
        champ = next((p for p in room["players"] if p["tower"] >= st["goal_floors"]), None)
        if champ:
            room["phase"] = "DONE"
            room["banner"] = f"🏆 5층 탑 완성! {champ['name']} 최종 우승!"
        else:
            room["round"] += 1
            st["nums"] = sorted(random.sample(range(1, 10), 4))
            st["target"] = random.randint(12, 48)
            room["banner"] = f"🗼 {w_names} +1층 적재! 다음 목표: [ {st['target']} ]"
            room["log"] = f"새 숫자 카드: {st['nums']}"
    else:
        w = sum(1 for p in room["players"] if p["pending"] is None)
        room["log"] = f"⏳ 다른 플레이어 {w}명 수식 제출 대기 중..."
    return None


# --- 11. 그라데이션 (Gradation - 6일차 감옥매치) ---
def _gr_can_place(line: List[int], val: int, slot: int) -> bool:
    left_ok = (slot == 0) or (line[slot - 1] < val)
    right_ok = (slot == len(line)) or (val < line[slot])
    return left_ok and right_ok


def _gr_advance_ai(room: dict):
    st = room["state"]
    ps = room["players"]
    guard = 0
    while room["phase"] == "PLAYING" and guard < 10:
        guard += 1
        curr = ps[st["turn_idx"]]
        if not curr["is_ai"]:
            return
        lvl = curr.get("ai_level", "normal")
        placed = False
        # Pro/Devil picks card closest to existing line numbers to narrow gaps
        hand_order = sorted(curr["hand"], key=lambda v: min(abs(v - x) for x in st["line"])) if lvl in ("pro", "devil") else list(curr["hand"])
        for val in hand_order:
            for slot in range(len(st["line"]) + 1):
                if _gr_can_place(st["line"], val, slot):
                    curr["hand"].remove(val)
                    st["line"].insert(slot, val)
                    placed = True
                    room["log"] = f"🤖 {curr['name']} [{val}] 배치 성공!"
                    break
            if placed:
                break
        if not placed and st["deck"]:
            curr["hand"].append(st["deck"].pop())
            curr["hand"].sort()
            room["log"] = f"🤖 {curr['name']} 배치 불가 → +1장 드로우"
        if len(curr["hand"]) == 0:
            room["phase"] = "DONE"
            room["banner"] = f"🏆 그라데이션 우승: {curr['name']} (손패 0장 달성!)"
            return
        st["turn_idx"] = (st["turn_idx"] + 1) % len(ps)
        room["banner"] = f"🌈 {ps[st['turn_idx']]['name']}님 차례! 카드를 오름차순 슬롯에 끼워 넣으세요."


def _act_gradation(room: dict, me: dict, payload: dict):
    st = room["state"]
    ps = room["players"]
    if ps[st["turn_idx"]]["id"] != me["id"]:
        return "내 차례가 아닙니다."
    act = payload.get("action", "place")
    if act == "draw":
        if st["deck"]:
            me["hand"].append(st["deck"].pop())
            me["hand"].sort()
        room["log"] = f"🃏 {me['name']} 드로우 선택 (+1장)"
    else:
        val = int(payload.get("card", -1))
        slot = int(payload.get("slot", -1))
        if val not in me["hand"]:
            return "보유한 카드가 아닙니다."
        if not (0 <= slot <= len(st["line"])) or not _gr_can_place(st["line"], val, slot):
            return "오름차순 위치가 맞지 않습니다!"
        me["hand"].remove(val)
        st["line"].insert(slot, val)
        room["log"] = f"🌈 {me['name']} [{val}] 배치 완료!"
        if len(me["hand"]) == 0:
            room["phase"] = "DONE"
            room["banner"] = f"🏆 그라데이션 우승: {me['name']} (손패 모두 소진!)"
            return None
    room["round"] += 1
    st["turn_idx"] = (st["turn_idx"] + 1) % len(ps)
    room["banner"] = f"🌈 다음 차례: {ps[st['turn_idx']]['name']}"
    _gr_advance_ai(room)
    return None


# --- 12. 카드 장기 (Card Janggi - 결승 1회전) ---
def _cj_valid_moves(pieces: List[dict], p: dict) -> List[Tuple[int, int]]:
    r, c, tp, ow = p["r"], p["c"], p["type"], p["owner"]
    res = []
    friendly = {(x["r"], x["c"]) for x in pieces if x["owner"] == ow}
    if tp == "K":
        deltas = [(-1, 0), (1, 0), (0, -1), (0, 1)]
    elif tp == "R":
        deltas = [(-1, 0), (1, 0), (0, -1), (0, 1), (-2, 0), (2, 0), (0, -2), (0, 2)]
    elif tp == "N":
        deltas = [(-1, -1), (-1, 1), (1, -1), (1, 1)]
    else:  # P
        fwd = -1 if ow == 0 else 1
        deltas = [(fwd, 0), (0, -1), (0, 1)]
    for dr, dc in deltas:
        nr, nc = r + dr, c + dc
        if 0 <= nr < 4 and 0 <= nc < 4 and (nr, nc) not in friendly:
            res.append((nr, nc))
    return res


def _cj_advance_ai(room: dict):
    st = room["state"]
    ps = room["players"]
    if room["phase"] != "PLAYING":
        return
    curr_idx = st["turn_idx"]
    if not ps[curr_idx]["is_ai"]:
        return
    lvl = ps[curr_idx].get("ai_level", "normal")
    my_pieces = [x for x in st["pieces"] if x["owner"] == curr_idx]
    all_moves = []
    for pc in my_pieces:
        for nr, nc in _cj_valid_moves(st["pieces"], pc):
            target = next((x for x in st["pieces"] if x["r"] == nr and x["c"] == nc and x["owner"] != curr_idx), None)
            score = 100 if (target and target["type"] == "K") else (25 if target else random.randint(0, 5))
            if lvl == "easy":
                score = random.randint(0, 10)
            all_moves.append((score, pc, nr, nc, target))
    if all_moves:
        all_moves.sort(key=lambda x: x[0], reverse=True)
        _, pc, nr, nc, target = all_moves[0]
        if target:
            st["pieces"].remove(target)
        pc["r"], pc["c"] = nr, nc
        if target and target["type"] == "K":
            room["phase"] = "DONE"
            room["banner"] = f"🏆 카드 장기 우승: {ps[curr_idx]['name']} (상대 왕 포획!)"
            return
    room["round"] += 1
    st["turn_idx"] = 1 - curr_idx
    room["banner"] = f"♟️ {ps[st['turn_idx']]['name']}님 차례! 말을 선택해 이동하세요."


def _act_card_janggi(room: dict, me: dict, payload: dict):
    st = room["state"]
    ps = room["players"]
    my_idx = next(i for i, p in enumerate(ps) if p["id"] == me["id"])
    if st["turn_idx"] != my_idx:
        return "내 차례가 아닙니다."
    pid = payload.get("piece_id")
    nr, nc = int(payload.get("r", -1)), int(payload.get("c", -1))
    pc = next((x for x in st["pieces"] if x["id"] == pid and x["owner"] == my_idx), None)
    if not pc:
        return "내 말을 먼저 선택하세요."
    if (nr, nc) not in _cj_valid_moves(st["pieces"], pc):
        return "이동할 수 없는 칸입니다."
    target = next((x for x in st["pieces"] if x["r"] == nr and x["c"] == nc and x["owner"] != my_idx), None)
    if target:
        st["pieces"].remove(target)
    pc["r"], pc["c"] = nr, nc
    if target and target["type"] == "K":
        room["phase"] = "DONE"
        room["banner"] = f"🏆 카드 장기 우승: {me['name']} (상대 왕 포획!)"
        return None
    room["round"] += 1
    st["turn_idx"] = 1 - my_idx
    room["banner"] = f"♟️ {me['name']} 이동 완료! 다음: {ps[st['turn_idx']]['name']}"
    _cj_advance_ai(room)
    return None


# --- 13. 컬러 링크 (Color Link - 결승 2회전) ---
def _cl_max_chain(grid: List[int], owner_idx: int) -> int:
    seen = set()
    best = 0
    for idx in range(25):
        if grid[idx] != owner_idx or idx in seen:
            continue
        q = [idx]
        seen.add(idx)
        cnt = 0
        while q:
            cur = q.pop(0)
            cnt += 1
            r, c = divmod(cur, 5)
            for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                nr, nc = r + dr, c + dc
                ni = nr * 5 + nc
                if 0 <= nr < 5 and 0 <= nc < 5 and grid[ni] == owner_idx and ni not in seen:
                    seen.add(ni)
                    q.append(ni)
        best = max(best, cnt)
    return best


def _cl_advance_ai(room: dict):
    st = room["state"]
    ps = room["players"]
    guard = 0
    while room["phase"] == "PLAYING" and guard < 8:
        guard += 1
        ci = st["turn_idx"]
        curr = ps[ci]
        if not curr["is_ai"]:
            return
        empties = [i for i, v in enumerate(st["grid"]) if v == -1]
        if not empties:
            room["phase"] = "DONE"
            champ = max(ps, key=lambda x: x["max_chain"])
            room["banner"] = f"🏆 컬러 링크 우승: {champ['name']} (최장 {champ['max_chain']}연결!)"
            return
        lvl = curr.get("ai_level", "normal")
        if lvl in ("pro", "devil"):
            best_i = max(empties, key=lambda i: _cl_max_chain([ci if j == i else v for j, v in enumerate(st["grid"])], ci))
        else:
            best_i = random.choice(empties)
        st["grid"][best_i] = ci
        curr["max_chain"] = _cl_max_chain(st["grid"], ci)
        if curr["max_chain"] >= st["goal_chain"] or all(v != -1 for v in st["grid"]):
            room["phase"] = "DONE"
            champ = max(ps, key=lambda x: x["max_chain"])
            room["banner"] = f"🏆 컬러 링크 우승: {champ['name']} ({champ['max_chain']}칸 연결!)"
            return
        room["round"] += 1
        st["turn_idx"] = (ci + 1) % len(ps)
        room["banner"] = f"🔗 {ps[st['turn_idx']]['name']}님 차례! 빈 칸을 눌러 연결하세요."


def _act_color_link(room: dict, me: dict, payload: dict):
    st = room["state"]
    ps = room["players"]
    ci = next(i for i, p in enumerate(ps) if p["id"] == me["id"])
    if st["turn_idx"] != ci:
        return "내 차례가 아닙니다."
    cell = int(payload.get("cell", -1))
    if not (0 <= cell < 25) or st["grid"][cell] != -1:
        return "빈 칸만 선택할 수 있습니다."
    st["grid"][cell] = ci
    me["max_chain"] = _cl_max_chain(st["grid"], ci)
    if me["max_chain"] >= st["goal_chain"] or all(v != -1 for v in st["grid"]):
        room["phase"] = "DONE"
        champ = max(ps, key=lambda x: x["max_chain"])
        room["banner"] = f"🏆 컬러 링크 우승: {champ['name']} ({champ['max_chain']}칸 연결!)"
        return None
    room["round"] += 1
    st["turn_idx"] = (ci + 1) % len(ps)
    room["banner"] = f"🔗 {me['name']} 연결 ({me['max_chain']}칸)! 다음: {ps[st['turn_idx']]['name']}"
    _cl_advance_ai(room)
    return None


# --- 14. 비밀 코드 (Secret Code - 유배지 03) ---
def _act_secret_code(room: dict, me: dict, payload: dict):
    guess = (payload.get("guess") or "").strip()
    if len(guess) != 4 or not guess.isdigit() or len(set(guess)) != 4:
        return "중복 없는 4자리 숫자(예: 1479)를 입력하세요."
    secret = room["state"]["secret"]
    strikes = sum(1 for i in range(4) if guess[i] == secret[i])
    balls = sum(1 for i in range(4) if guess[i] != secret[i] and guess[i] in secret)
    me["guesses"].append({"text": guess, "s": strikes, "b": balls})
    if strikes == 4:
        me["solved"] = True
        room["phase"] = "DONE"
        room["state"]["winner_name"] = me["name"]
        room["banner"] = f"🏆 비밀 코드 해독 성공! {me['name']}님 우승! (정답: {secret})"
    else:
        room["banner"] = f"🔐 {me['name']} [{guess}] → 🟢 {strikes}S  🟡 {balls}B"
    return None


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
        po = {
            "id": p["id"],
            "name": p["name"],
            "is_ai": p["is_ai"],
            "ai_level": p.get("ai_level", "normal") if p["is_ai"] else None,
            "is_host": p["id"] == room["host_id"],
        }
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
        elif gt == "auction_bingo":
            po.update({
                "chips": p.get("chips", 0),
                "lines": p.get("lines", 0),
                "marked_count": len(p.get("marked", [])),
                "submitted": p.get("pending") is not None,
                "board": p.get("board", []) if is_me else [],
                "marked": p.get("marked", []) if is_me else [],
            })
        elif gt == "wall_go_2":
            po.update({
                "pos": p.get("pos", [0, 0]),
                "territory": p.get("territory", 1),
                "is_turn": idx == st.get("turn_idx", 0) and room["phase"] == "PLAYING",
            })
        elif gt == "hidden_word":
            po.update({
                "score": p.get("score", 0),
                "last_guess": p.get("last_guess", "-"),
                "submitted": p.get("pending_guess") is not None,
                "is_setter": idx == st.get("setter_idx", 0),
            })
        elif gt == "formula_tower":
            po.update({
                "tower": p.get("tower", 0),
                "last_expr": p.get("last_expr", "-"),
                "submitted": p.get("pending") is not None,
            })
        elif gt == "gradation":
            po.update({
                "hand_count": len(p.get("hand", [])),
                "hand": p.get("hand", []) if (is_me or done) else [],
                "is_turn": idx == st.get("turn_idx", 0) and room["phase"] == "PLAYING",
            })
        elif gt == "card_janggi":
            po.update({"is_turn": idx == st.get("turn_idx", 0) and room["phase"] == "PLAYING"})
        elif gt == "color_link":
            po.update({
                "max_chain": p.get("max_chain", 0),
                "is_turn": idx == st.get("turn_idx", 0) and room["phase"] == "PLAYING",
            })
        elif gt == "secret_code":
            po.update({
                "tries": len(p.get("guesses", [])),
                "guesses": p.get("guesses", []) if (is_me or done) else [],
                "solved": p.get("solved", False),
            })
        players_out.append(po)

    state_out = dict(st)
    if gt == "secret_code" and not done:
        state_out["secret"] = None
    if gt == "hidden_word":
        setter_id = ps[st.get("setter_idx", 0)]["id"] if ps else ""
        if viewer_id != setter_id and not done:
            state_out["secret"] = None
            state_out["envelope"] = []
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

    elif gt == "mystery_exchange" and "stocks" in st:
        state_out["stocks"] = [
            {
                "id": s["id"],
                "name": s["name"],
                "price": s["price"],
                "prev": s["prev"],
                "history": s.get("history", [s["price"]]),
                "rule_revealed": s.get("rule_revealed", False) or done,
                "rule_desc": s.get("rule_desc", "") if (s.get("rule_revealed") or done) else None,
            }
            for s in st["stocks"]
        ]

    return {
        "room_id": room["room_id"],
        "game_type": gt,
        "rule_mode": room.get("rule_mode", "classic"),
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
