import json
import os
import random
import string
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Dict, List, Optional

from fastapi import FastAPI
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

import mp_engine

app = FastAPI(title="HIT, STAY — The Devil's Plan")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
os.makedirs(STATIC_DIR, exist_ok=True)


# ---------------------------------------------------------------------------
# Storage Abstraction: Upstash / Vercel KV REST API with Local Memory Fallback
# ---------------------------------------------------------------------------
class RoomStore:
    def __init__(self):
        raw_url = (
            os.environ.get("UPSTASH_REDIS_REST_URL")
            or os.environ.get("KV_REST_API_URL")
            or ""
        )
        raw_token = (
            os.environ.get("UPSTASH_REDIS_REST_TOKEN")
            or os.environ.get("KV_REST_API_TOKEN")
            or ""
        )
        self.url = raw_url.strip().strip('"').strip("'").rstrip("/")
        self.token = raw_token.strip().strip('"').strip("'")
        self.local: Dict[str, str] = {}
        self.local_locks: Dict[str, float] = {}

    @property
    def use_redis(self) -> bool:
        return bool(self.url and self.token)

    def _redis_cmd(self, *args):
        req = urllib.request.Request(
            self.url,
            data=json.dumps([str(a) for a in args]).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {self.token}",
                "Content-Type": "application/json",
                "User-Agent": "party-deck/1.0",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=5) as resp:
                return json.loads(resp.read().decode("utf-8")).get("result")
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Redis HTTP {e.code}: {body}") from e

    def ping(self):
        if not self.use_redis:
            return False, False, "local_memory"
        try:
            res = self._redis_cmd("PING")
            if res != "PONG":
                return False, False, str(res)
            self._redis_cmd("SET", "hs:health_check", "1", "EX", "10")
            return True, True, "PONG+WRITE_OK"
        except Exception as e:
            err = f"{type(e).__name__}: {e}"
            if "NOPERM" in err:
                return True, False, "READ_ONLY_TOKEN"
            return False, False, err

    def get_json(self, key: str) -> Optional[dict]:
        raw = self._redis_cmd("GET", key) if self.use_redis else self.local.get(key)
        return json.loads(raw) if raw else None

    def set_json(self, key: str, obj: dict, ttl: int = 86400):
        raw = json.dumps(obj, ensure_ascii=False)
        if self.use_redis:
            self._redis_cmd("SET", key, raw, "EX", ttl)
        else:
            self.local[key] = raw

    def get_room(self, room_id: str) -> Optional["GameRoom"]:
        key = f"hs:room:{room_id}"
        raw = self._redis_cmd("GET", key) if self.use_redis else self.local.get(key)
        if not raw:
            return None
        return GameRoom.from_dict(json.loads(raw))

    def save_room(self, room: "GameRoom", ttl: int = 86400):
        key = f"hs:room:{room.room_id}"
        raw = json.dumps(room.to_dict(), ensure_ascii=False)
        if self.use_redis:
            self._redis_cmd("SET", key, raw, "EX", ttl)
        else:
            self.local[key] = raw

    def acquire_lock(self, room_id: str, ttl_ms: int = 1500) -> bool:
        key = f"hs:lock:{room_id}"
        if self.use_redis:
            res = self._redis_cmd("SET", key, "1", "NX", "PX", ttl_ms)
            return res == "OK"
        now = time.time()
        if self.local_locks.get(key, 0) > now:
            return False
        self.local_locks[key] = now + (ttl_ms / 1000.0)
        return True

    def release_lock(self, room_id: str):
        key = f"hs:lock:{room_id}"
        if self.use_redis:
            try:
                self._redis_cmd("DEL", key)
            except Exception:
                pass
        else:
            self.local_locks.pop(key, None)


STORE = RoomStore()

FIREBASE_DB_URL = os.environ.get("FIREBASE_DB_URL", "").strip().strip('"').strip("'").rstrip("/")
FIREBASE_DB_SECRET = os.environ.get("FIREBASE_DB_SECRET", "").strip().strip('"').strip("'")


def notify_firebase_signal(sig_key: str):
    """Push a tiny version timestamp to Firebase RTDB so connected clients sync in ~50ms."""
    if not FIREBASE_DB_URL or not FIREBASE_DB_SECRET:
        return
    try:
        url = f"{FIREBASE_DB_URL}/signals/{sig_key}.json?auth={FIREBASE_DB_SECRET}"
        body = json.dumps({"ver": int(time.time() * 1000)}).encode("utf-8")
        req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"}, method="PUT")
        with urllib.request.urlopen(req, timeout=1.2):
            pass
    except Exception:
        pass


def create_deck() -> List[int]:
    deck = (
        [7] * 1
        + [6] * 2
        + [5] * 3
        + [4] * 4
        + [3] * 5
        + [2] * 6
        + [1] * 7
        + [-1] * 7
    )
    random.shuffle(deck)
    return deck


def gen_room_code() -> str:
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=4))


@dataclass
class CardItem:
    value: int
    public: bool = False
    is_hit: bool = False

    def to_dict(self) -> dict:
        return {"value": self.value, "public": self.public, "is_hit": self.is_hit}

    @classmethod
    def from_dict(cls, d: dict) -> "CardItem":
        return cls(value=d["value"], public=d.get("public", False), is_hit=d.get("is_hit", False))


@dataclass
class Player:
    id: str
    name: str
    is_ai: bool = False
    chips: int = 30
    hand: List[CardItem] = field(default_factory=list)
    folded: bool = False
    eliminated: bool = False
    stayed: bool = False
    round_bet: int = 0
    phase_bet: int = 0
    acted_in_bet: bool = False
    revealed_initial: bool = False
    last_action: str = ""

    @property
    def hand_sum(self) -> int:
        return sum(c.value for c in self.hand)

    @property
    def public_sum(self) -> int:
        return sum(c.value for c in self.hand if c.public)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "is_ai": self.is_ai,
            "chips": self.chips,
            "hand": [c.to_dict() for c in self.hand],
            "folded": self.folded,
            "eliminated": self.eliminated,
            "stayed": self.stayed,
            "round_bet": self.round_bet,
            "phase_bet": self.phase_bet,
            "acted_in_bet": self.acted_in_bet,
            "revealed_initial": self.revealed_initial,
            "last_action": self.last_action,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "Player":
        return cls(
            id=d["id"],
            name=d["name"],
            is_ai=d.get("is_ai", False),
            chips=d.get("chips", 30),
            hand=[CardItem.from_dict(c) for c in d.get("hand", [])],
            folded=d.get("folded", False),
            eliminated=d.get("eliminated", False),
            stayed=d.get("stayed", False),
            round_bet=d.get("round_bet", 0),
            phase_bet=d.get("phase_bet", 0),
            acted_in_bet=d.get("acted_in_bet", False),
            revealed_initial=d.get("revealed_initial", False),
            last_action=d.get("last_action", ""),
        )


class GameRoom:
    def __init__(self, room_id: str, host_id: str, starting_chips: int = 30):
        self.room_id = room_id
        self.host_id = host_id
        self.starting_chips = starting_chips
        self.players: List[Player] = []
        self.phase: str = "LOBBY"
        self.round_num: int = 0
        self.target: int = 8
        self.pot: int = 0
        self.carry_pot: int = 0
        self.ante: int = 1
        self.deck: List[int] = []
        self.lead_idx: int = 0
        self.turn_idx: int = 0
        self.current_bet: int = 0
        self.max_round_bet: int = 30
        self.logs: List[str] = []
        self.winner_info: Optional[dict] = None
        self.next_ai_at: float = 0.0

    def to_dict(self) -> dict:
        return {
            "room_id": self.room_id,
            "host_id": self.host_id,
            "starting_chips": self.starting_chips,
            "players": [p.to_dict() for p in self.players],
            "phase": self.phase,
            "round_num": self.round_num,
            "target": self.target,
            "pot": self.pot,
            "carry_pot": self.carry_pot,
            "ante": self.ante,
            "deck": self.deck,
            "lead_idx": self.lead_idx,
            "turn_idx": self.turn_idx,
            "current_bet": self.current_bet,
            "max_round_bet": self.max_round_bet,
            "logs": self.logs,
            "winner_info": self.winner_info,
            "next_ai_at": self.next_ai_at,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "GameRoom":
        r = cls(d["room_id"], d["host_id"], d.get("starting_chips", 30))
        r.players = [Player.from_dict(p) for p in d.get("players", [])]
        r.phase = d.get("phase", "LOBBY")
        r.round_num = d.get("round_num", 0)
        r.target = d.get("target", 8)
        r.pot = d.get("pot", 0)
        r.carry_pot = d.get("carry_pot", 0)
        r.ante = d.get("ante", 1)
        r.deck = d.get("deck", [])
        r.lead_idx = d.get("lead_idx", 0)
        r.turn_idx = d.get("turn_idx", 0)
        r.current_bet = d.get("current_bet", 0)
        r.max_round_bet = d.get("max_round_bet", 30)
        r.logs = d.get("logs", [])
        r.winner_info = d.get("winner_info")
        r.next_ai_at = d.get("next_ai_at", 0.0)
        return r

    def add_log(self, msg: str):
        self.logs.append(msg)
        if len(self.logs) > 40:
            self.logs = self.logs[-40:]

    def get_player(self, pid: str) -> Optional[Player]:
        for p in self.players:
            if p.id == pid:
                return p
        return None

    def active_players(self) -> List[Player]:
        return [p for p in self.players if not p.eliminated]

    def in_hand_players(self) -> List[Player]:
        return [p for p in self.players if not p.eliminated and not p.folded]

    def next_valid_idx(self, start_idx: int, require_not_stayed: bool = False) -> Optional[int]:
        n = len(self.players)
        if n == 0:
            return None
        for offset in range(1, n + 1):
            idx = (start_idx + offset) % n
            p = self.players[idx]
            if p.eliminated or p.folded:
                continue
            if require_not_stayed and p.stayed:
                continue
            return idx
        return None

    def serialize_for(self, viewer_id: str) -> dict:
        reveal_all = self.phase in ("SHOWDOWN", "GAME_OVER")
        players_data = []
        for idx, p in enumerate(self.players):
            is_me = p.id == viewer_id
            cards_out = []
            for ci, c in enumerate(p.hand):
                show_val = is_me or c.public or reveal_all
                cards_out.append({
                    "idx": ci,
                    "value": c.value if show_val else None,
                    "public": c.public,
                    "is_hit": c.is_hit,
                })
            show_sum = is_me or reveal_all
            players_data.append({
                "id": p.id,
                "name": p.name,
                "is_ai": p.is_ai,
                "chips": p.chips,
                "cards": cards_out,
                "card_count": len(p.hand),
                "hand_sum": p.hand_sum if show_sum else None,
                "public_sum": p.public_sum,
                "folded": p.folded,
                "eliminated": p.eliminated,
                "stayed": p.stayed,
                "round_bet": p.round_bet,
                "phase_bet": p.phase_bet,
                "revealed_initial": p.revealed_initial,
                "last_action": p.last_action,
                "is_lead": idx == self.lead_idx and self.phase != "LOBBY",
                "is_turn": idx == self.turn_idx and self.phase in ("BET1", "HIT_STAY", "BET2"),
                "busted": (p.hand_sum > self.target) if show_sum and len(p.hand) > 0 else False,
            })

        visible_counts = {str(v): 0 for v in [7, 6, 5, 4, 3, 2, 1, -1]}
        for p in self.players:
            for c in p.hand:
                if c.public or reveal_all or p.id == viewer_id:
                    visible_counts[str(c.value)] = visible_counts.get(str(c.value), 0) + 1

        return {
            "room_id": self.room_id,
            "host_id": self.host_id,
            "phase": self.phase,
            "round_num": self.round_num,
            "target": self.target,
            "pot": self.pot,
            "carry_pot": self.carry_pot,
            "ante": self.ante,
            "deck_remaining": len(self.deck),
            "ai_pending": self.is_ai_pending(),
            "solo_mode": all(p.is_ai for p in self.players if p.id != viewer_id),
            "current_bet": self.current_bet,
            "max_round_bet": self.max_round_bet,
            "players": players_data,
            "visible_counts": visible_counts,
            "logs": self.logs[-15:],
            "winner_info": self.winner_info,
            "viewer_id": viewer_id,
        }

    def add_one_ai(self) -> bool:
        if len(self.players) >= 5:
            return False
        bot_names = ["VIPER", "NOVA", "KRONOS", "ORION", "ZEPHYR"]
        existing_names = {p.name for p in self.players}
        for idx, bname in enumerate(bot_names, start=1):
            if bname not in existing_names:
                self.players.append(
                    Player(
                        id=f"ai_{idx}_{random.randint(100,999)}",
                        name=bname,
                        is_ai=True,
                        chips=self.starting_chips,
                    )
                )
                return True
        return False

    def remove_ai(self, ai_id: Optional[str] = None) -> bool:
        for i in range(len(self.players) - 1, -1, -1):
            p = self.players[i]
            if p.is_ai and (ai_id is None or p.id == ai_id):
                self.players.pop(i)
                return True
        return False

    def fill_ai_bots(self, count: Optional[int] = None):
        target_total = 5 if count is None else min(5, len(self.players) + max(0, count))
        while len(self.players) < target_total:
            if not self.add_one_ai():
                break

    def start_game(self):
        if len(self.players) < 2:
            self.fill_ai_bots()
        for p in self.players:
            p.chips = self.starting_chips
            p.eliminated = False
        self.round_num = 0
        self.carry_pot = 0
        self.lead_idx = -1
        self.logs = []
        self.add_log("게임이 시작되었습니다! 행운을 빕니다.")
        self.start_next_round()

    def start_next_round(self):
        alive = self.active_players()
        if len(alive) <= 1:
            self.phase = "GAME_OVER"
            champ = alive[0] if alive else None
            self.winner_info = {
                "type": "champion",
                "winners": [champ.name] if champ else [],
                "message": f"최종 우승: {champ.name}!" if champ else "게임 종료",
            }
            self.next_ai_at = 0.0
            return

        self.round_num += 1
        self.target = random.randint(5, 12)
        self.add_log(f"🎲 8면체 주사위 결과: 이번 라운드 한계 숫자 [ {self.target} ]")

        self.ante = min(1 + (self.round_num - 1) // 2, 5)
        self.deck = create_deck()
        self.pot = self.carry_pot
        self.carry_pot = 0
        self.winner_info = None

        next_lead = self.next_valid_idx(self.lead_idx)
        self.lead_idx = next_lead if next_lead is not None else 0

        for p in self.players:
            p.hand = []
            p.folded = p.eliminated
            p.stayed = False
            p.round_bet = 0
            p.phase_bet = 0
            p.acted_in_bet = False
            p.revealed_initial = False
            p.last_action = ""
            if not p.eliminated:
                paid = min(p.chips, self.ante)
                p.chips -= paid
                p.round_bet += paid
                self.pot += paid

        min_stack = min(p.chips + p.round_bet for p in self.active_players())
        self.max_round_bet = max(min_stack, self.ante)

        for p in self.active_players():
            for _ in range(3):
                if self.deck:
                    p.hand.append(CardItem(value=self.deck.pop(), public=False, is_hit=False))

        self.phase = "REVEAL_SELECT"
        self.add_log(f"--- 라운드 {self.round_num} 시작 (기본 베팅 {self.ante}칩, 한계 {self.target}) ---")
        self._schedule_next_ai()

    def handle_reveal(self, pid: str, card_idx: int):
        if self.phase != "REVEAL_SELECT":
            return
        p = self.get_player(pid)
        if not p or p.eliminated or p.folded or p.revealed_initial:
            return
        if not (0 <= card_idx < len(p.hand)):
            return
        p.hand[card_idx].public = True
        p.revealed_initial = True
        p.last_action = f"공개: {p.hand[card_idx].value}"

        if all(pl.revealed_initial for pl in self.in_hand_players()):
            self.start_bet_phase("BET1")
        else:
            self._schedule_next_ai()

    def start_bet_phase(self, phase_name: str):
        self.phase = phase_name
        self.current_bet = 0
        for p in self.in_hand_players():
            p.phase_bet = 0
            p.acted_in_bet = False
            if p.chips == 0:
                p.acted_in_bet = True

        in_hand = self.in_hand_players()
        can_act = [p for p in in_hand if p.chips > 0 and p.round_bet < self.max_round_bet]
        if len(can_act) <= 1:
            self.advance_after_bet()
            return

        if not self.players[self.lead_idx].eliminated and not self.players[self.lead_idx].folded:
            self.turn_idx = self.lead_idx
        else:
            nxt = self.next_valid_idx(self.lead_idx)
            self.turn_idx = nxt if nxt is not None else 0

        if self.players[self.turn_idx].chips == 0:
            self.advance_bet_turn()

        label = "1차 베팅" if phase_name == "BET1" else "2차 최종 베팅"
        self.add_log(f"💰 {label} 시작")
        self._schedule_next_ai()

    def advance_bet_turn(self) -> bool:
        n = len(self.players)
        for offset in range(1, n + 1):
            idx = (self.turn_idx + offset) % n
            p = self.players[idx]
            if p.eliminated or p.folded:
                continue
            if p.chips == 0 or p.round_bet >= self.max_round_bet:
                p.acted_in_bet = True
                continue
            if not p.acted_in_bet or p.phase_bet < self.current_bet:
                self.turn_idx = idx
                return True
        return False

    def handle_bet(self, pid: str, action: str, raise_amount: int = 1):
        if self.phase not in ("BET1", "BET2"):
            return
        if self.players[self.turn_idx].id != pid:
            return
        p = self.players[self.turn_idx]

        if action == "fold":
            p.folded = True
            p.acted_in_bet = True
            p.last_action = "포기 (Fold)"
            self.add_log(f"🏳️ {p.name} 포기 (Fold)")
            if len(self.in_hand_players()) == 1:
                self.resolve_fold_win()
                return
        elif action == "call":
            needed = max(0, self.current_bet - p.phase_bet)
            max_allowed = max(0, self.max_round_bet - p.round_bet)
            pay = min(needed, p.chips, max_allowed)
            p.chips -= pay
            p.phase_bet += pay
            p.round_bet += pay
            self.pot += pay
            p.acted_in_bet = True
            if needed == 0:
                p.last_action = "체크 (Check)"
                self.add_log(f"✔️ {p.name} 체크")
            else:
                p.last_action = f"콜 (+{pay})"
                self.add_log(f"🪙 {p.name} 콜 (+{pay}칩)")
        elif action == "raise":
            raise_amount = max(1, int(raise_amount))
            target_bet = self.current_bet + raise_amount
            needed = max(0, target_bet - p.phase_bet)
            max_allowed = max(0, self.max_round_bet - p.round_bet)
            pay = min(needed, p.chips, max_allowed)
            if pay <= (self.current_bet - p.phase_bet):
                pay = min(max(0, self.current_bet - p.phase_bet), p.chips, max_allowed)
                p.chips -= pay
                p.phase_bet += pay
                p.round_bet += pay
                self.pot += pay
                p.acted_in_bet = True
                p.last_action = f"콜 (+{pay})"
                self.add_log(f"🪙 {p.name} 콜 (+{pay}칩)")
            else:
                p.chips -= pay
                p.phase_bet += pay
                p.round_bet += pay
                self.pot += pay
                self.current_bet = p.phase_bet
                p.acted_in_bet = True
                for other in self.in_hand_players():
                    if other.id != p.id and other.chips > 0 and other.round_bet < self.max_round_bet:
                        other.acted_in_bet = False
                p.last_action = f"레이즈 (+{pay})"
                self.add_log(f"🔥 {p.name} 레이즈! (베팅 {self.current_bet})")

        if not self.advance_bet_turn():
            self.advance_after_bet()
        else:
            self._schedule_next_ai()

    def advance_after_bet(self):
        if self.phase == "BET1":
            self.start_hit_stay_phase()
        else:
            self.resolve_showdown()

    def start_hit_stay_phase(self):
        self.phase = "HIT_STAY"
        for p in self.in_hand_players():
            p.stayed = False
        if not self.players[self.lead_idx].eliminated and not self.players[self.lead_idx].folded:
            self.turn_idx = self.lead_idx
        else:
            nxt = self.next_valid_idx(self.lead_idx, require_not_stayed=True)
            self.turn_idx = nxt if nxt is not None else 0
        self.add_log("🃏 HIT / STAY 단계 시작")
        self._schedule_next_ai()

    def handle_hit_stay(self, pid: str, decision: str):
        if self.phase != "HIT_STAY":
            return
        if self.players[self.turn_idx].id != pid:
            return
        p = self.players[self.turn_idx]

        if decision == "hit" and len(self.deck) > 0 and len(p.hand) < 10:
            val = self.deck.pop()
            p.hand.append(CardItem(value=val, public=True, is_hit=True))
            p.last_action = f"HIT ({val})"
            self.add_log(f"➕ {p.name} HIT! 공개 카드: [ {val} ]")
            if len(self.deck) == 0:
                p.stayed = True
        else:
            p.stayed = True
            p.last_action = "STAY"
            self.add_log(f"✋ {p.name} STAY")

        nxt = self.next_valid_idx(self.turn_idx, require_not_stayed=True)
        if nxt is None or len(self.deck) == 0:
            self.start_bet_phase("BET2")
        else:
            self.turn_idx = nxt
            self._schedule_next_ai()

    def resolve_fold_win(self):
        survivors = self.in_hand_players()
        winner = survivors[0]
        winner.chips += self.pot
        self.phase = "SHOWDOWN"
        self.winner_info = {
            "type": "fold_win",
            "winners": [winner.name],
            "pot": self.pot,
            "message": f"다른 플레이어 전원 포기! {winner.name}님이 {self.pot}칩 획득!",
        }
        self.add_log(f"🏆 {winner.name} 단독 생존으로 {self.pot}칩 획득!")
        self.check_eliminations()
        self.next_ai_at = 0.0

    def resolve_showdown(self):
        self.phase = "SHOWDOWN"
        contenders = self.in_hand_players()
        valid = [p for p in contenders if p.hand_sum <= self.target]

        if not valid:
            self.carry_pot = self.pot
            self.winner_info = {
                "type": "all_bust",
                "winners": [],
                "pot": self.pot,
                "message": f"전원 버스트! 팟 {self.pot}칩이 다음 라운드로 이월됩니다.",
            }
            self.add_log(f"💥 전원 버스트! {self.pot}칩 다음 라운드 이월")
        else:
            best_score = max((p.hand_sum, len(p.hand)) for p in valid)
            winners = [p for p in valid if (p.hand_sum, len(p.hand)) == best_score]
            share = self.pot // len(winners)
            rem = self.pot % len(winners)
            for i, w in enumerate(winners):
                w.chips += share + (1 if i < rem else 0)
            w_names = [w.name for w in winners]
            self.winner_info = {
                "type": "showdown",
                "winners": w_names,
                "pot": self.pot,
                "best_sum": best_score[0],
                "best_cards": best_score[1],
                "message": f"{', '.join(w_names)} 승리! (합계 {best_score[0]}, {best_score[1]}장) → {self.pot}칩 획득!",
            }
            self.add_log(f"🏆 {', '.join(w_names)} 승리! ({best_score[0]}점, {best_score[1]}장) +{self.pot}칩")

        self.check_eliminations()
        self.next_ai_at = 0.0

    def check_eliminations(self):
        for p in self.players:
            if not p.eliminated and p.chips <= 0:
                p.eliminated = True
                self.add_log(f"💀 {p.name} 칩 소진으로 탈락!")
        alive = self.active_players()
        if len(alive) <= 1 and self.carry_pot == 0:
            self.phase = "GAME_OVER"
            champ = alive[0] if alive else None
            if champ:
                self.winner_info = {
                    "type": "champion",
                    "winners": [champ.name],
                    "message": f"👑 최종 우승: {champ.name} ({champ.chips}칩)!",
                }

    def force_end_game(self):
        alive = self.active_players()
        if alive:
            top_chips = max(p.chips for p in alive)
            champs = [p.name for p in alive if p.chips == top_chips]
            self.winner_info = {
                "type": "champion",
                "winners": champs,
                "message": f"🏁 방장이 게임을 종료했습니다! 최종 1위: {', '.join(champs)} ({top_chips}칩)",
            }
        else:
            self.winner_info = {
                "type": "champion",
                "winners": [],
                "message": "🏁 방장이 게임을 종료했습니다.",
            }
        self.phase = "GAME_OVER"
        self.next_ai_at = 0.0
        self.add_log("🏁 방장 권한으로 게임이 종료되었습니다.")

    def is_ai_pending(self) -> bool:
        if self.phase == "REVEAL_SELECT":
            return any(p.is_ai and not p.revealed_initial for p in self.in_hand_players())
        if self.phase in ("BET1", "BET2"):
            curr = self.players[self.turn_idx]
            return curr.is_ai and not curr.folded and not curr.eliminated
        if self.phase == "HIT_STAY":
            curr = self.players[self.turn_idx]
            return curr.is_ai and not curr.folded and not curr.eliminated and not curr.stayed
        return False

    def _schedule_next_ai(self):
        if self.is_ai_pending():
            self.next_ai_at = time.time() + random.uniform(0.6, 0.95)
        else:
            self.next_ai_at = 0.0

    def step_ai_if_due(self) -> bool:
        if not self.is_ai_pending():
            return False
        if time.time() < self.next_ai_at:
            return False

        if self.phase == "REVEAL_SELECT":
            for p in self.in_hand_players():
                if p.is_ai and not p.revealed_initial:
                    best_i = max(range(len(p.hand)), key=lambda i: abs(p.hand[i].value))
                    self.handle_reveal(p.id, best_i)
                    return True
        elif self.phase in ("BET1", "BET2"):
            curr = self.players[self.turn_idx]
            if curr.is_ai and not curr.folded and not curr.eliminated:
                action, amt = self._decide_ai_bet(curr)
                self.handle_bet(curr.id, action, amt)
                return True
        elif self.phase == "HIT_STAY":
            curr = self.players[self.turn_idx]
            if curr.is_ai and not curr.folded and not curr.eliminated and not curr.stayed:
                decision = self._decide_ai_hit_stay(curr)
                self.handle_hit_stay(curr.id, decision)
                return True
        return False

    def _decide_ai_bet(self, p: Player):
        needed = max(0, self.current_bet - p.phase_bet)
        s = p.hand_sum
        diff = self.target - s
        busted = s > self.target
        if busted and self.phase == "BET2":
            return ("fold", 0) if needed > 0 else ("call", 0)
        if busted and self.phase == "BET1":
            if s - self.target <= 2 and needed <= 3:
                return ("call", 0)
            return ("fold", 0) if needed > 2 else ("call", 0)
        if diff == 0 or (diff == 1 and len(p.hand) >= 3):
            if p.chips > needed + 2 and p.round_bet + needed + 2 <= self.max_round_bet and random.random() < 0.55:
                return ("raise", random.choice([1, 2, 3]))
            return ("call", 0)
        if diff <= 3:
            if needed > p.chips * 0.45 and self.phase == "BET2":
                return ("fold", 0)
            return ("call", 0)
        if needed > 3 and self.phase == "BET2":
            return ("fold", 0)
        return ("call", 0)

    def _decide_ai_hit_stay(self, p: Player) -> str:
        s = p.hand_sum
        if len(self.deck) == 0:
            return "stay"
        if s > self.target:
            return "hit" if (s - self.target <= 2 and len(p.hand) < 6) else "stay"
        if s == self.target:
            return "stay"
        diff = self.target - s
        if diff >= 3:
            return "hit"
        if diff == 2:
            good = sum(1 for c in self.deck if c <= 2)
            return "hit" if good / len(self.deck) > 0.45 else "stay"
        if diff == 1:
            good = sum(1 for c in self.deck if c <= 1)
            return "hit" if good / len(self.deck) > 0.48 else "stay"
        return "stay"


@app.get("/")
async def index():
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))


@app.get("/favicon.ico")
async def favicon():
    return FileResponse(os.path.join(STATIC_DIR, "favicon.svg"), media_type="image/svg+xml")


@app.get("/api/health")
async def health():
    redis_ok, redis_write_ok, redis_detail = STORE.ping()
    fb_ok = bool(FIREBASE_DB_URL and FIREBASE_DB_SECRET)
    return {
        "ok": True,
        "redis": STORE.use_redis,
        "redis_ok": redis_ok,
        "redis_write_ok": redis_write_ok,
        "redis_detail": redis_detail,
        "gemini_ai": bool(os.environ.get("GEMINI_API_KEY", "").strip()),
        "firebase_rtdb": fb_ok,
        "firebase_url": FIREBASE_DB_URL if fb_ok else "",
    }


@app.post("/api/create_room")
async def create_room(payload: dict):
    try:
        name = (payload.get("name") or "플레이어").strip()[:12]
        mode = payload.get("mode", "solo")
        starting_chips = int(payload.get("chips", 30))
        room_id = gen_room_code()
        while STORE.get_room(room_id) is not None:
            room_id = gen_room_code()

        player_id = f"p_{random.randint(10000, 99999)}"
        room = GameRoom(room_id=room_id, host_id=player_id, starting_chips=starting_chips)
        room.players.append(Player(id=player_id, name=name, is_ai=False, chips=starting_chips))

        if mode == "solo":
            ai_count = max(1, min(4, int(payload.get("ai_count", 4))))
            room.fill_ai_bots(count=ai_count)
            room.start_game()

        STORE.save_room(room)
        return JSONResponse({"room_id": room_id, "player_id": player_id, "mode": mode})
    except Exception as e:
        return JSONResponse({"error": f"{type(e).__name__}: {e}"}, status_code=500)


@app.post("/api/join_room")
async def join_room(payload: dict):
    room_id = (payload.get("room_id") or "").strip().upper()
    name = (payload.get("name") or "게스트").strip()[:12]
    if not STORE.acquire_lock(room_id):
        return JSONResponse({"error": "잠시 후 다시 시도하세요."}, status_code=429)
    try:
        room = STORE.get_room(room_id)
        if not room:
            return JSONResponse({"error": "방을 찾을 수 없습니다."}, status_code=404)
        if room.phase != "LOBBY":
            return JSONResponse({"error": "이미 게임이 진행 중인 방입니다."}, status_code=400)
        if len(room.players) >= 5:
            return JSONResponse({"error": "방이 가득 찼습니다 (최대 5명)."}, status_code=400)

        player_id = f"p_{random.randint(10000, 99999)}"
        room.players.append(Player(id=player_id, name=name, is_ai=False, chips=room.starting_chips))
        STORE.save_room(room)
        notify_firebase_signal(f"hs_{room_id}")
        return JSONResponse({"room_id": room_id, "player_id": player_id})
    finally:
        STORE.release_lock(room_id)


@app.get("/api/room/{room_id}")
async def get_room_state(room_id: str, player_id: str):
    room = STORE.get_room(room_id)
    if not room:
        return JSONResponse({"error": "방을 찾을 수 없습니다."}, status_code=404)
    if not room.get_player(player_id):
        return JSONResponse({"error": "플레이어 권한이 없습니다."}, status_code=403)

    if room.is_ai_pending() and time.time() >= room.next_ai_at:
        if STORE.acquire_lock(room_id, ttl_ms=1200):
            try:
                room = STORE.get_room(room_id) or room
                if room.step_ai_if_due():
                    STORE.save_room(room)
                    notify_firebase_signal(f"hs_{room_id}")
            finally:
                STORE.release_lock(room_id)

    return JSONResponse({"type": "state", "data": room.serialize_for(player_id)})


@app.post("/api/room/{room_id}/action")
async def post_action(room_id: str, payload: dict):
    player_id = payload.get("player_id", "")
    mtype = payload.get("type", "")
    if not STORE.acquire_lock(room_id, ttl_ms=2000):
        return JSONResponse({"error": "처리 중입니다. 잠시 후 다시 시도하세요."}, status_code=429)
    try:
        room = STORE.get_room(room_id)
        if not room:
            return JSONResponse({"error": "방을 찾을 수 없습니다."}, status_code=404)
        if not room.get_player(player_id):
            return JSONResponse({"error": "플레이어 권한이 없습니다."}, status_code=403)

        if mtype == "add_ai" and player_id == room.host_id and room.phase == "LOBBY":
            room.add_one_ai()
        elif mtype == "remove_ai" and player_id == room.host_id and room.phase == "LOBBY":
            room.remove_ai(payload.get("target_id"))
        elif mtype == "start_multi" and player_id == room.host_id and room.phase == "LOBBY":
            if payload.get("fill_ai", False):
                room.fill_ai_bots()
            if len(room.players) >= 2:
                room.start_game()
        elif mtype == "reveal":
            room.handle_reveal(player_id, int(payload.get("card_idx", -1)))
        elif mtype == "bet":
            room.handle_bet(
                player_id,
                payload.get("action", "call"),
                int(payload.get("amount", 1)),
            )
        elif mtype == "hit_stay":
            room.handle_hit_stay(player_id, payload.get("decision", "stay"))
        elif mtype == "next_round" and room.phase == "SHOWDOWN":
            room.start_next_round()
        elif mtype == "restart" and player_id == room.host_id and room.phase == "GAME_OVER":
            room.start_game()
        elif mtype == "end_game" and player_id == room.host_id and room.phase not in ("LOBBY", "GAME_OVER"):
            room.force_end_game()
        elif mtype == "save_game":
            room.add_log(f"💾 {room.get_player(player_id).name}님이 현재 게임을 저장했습니다. (7일 보관)")
            STORE.save_room(room, ttl=604800)
            return JSONResponse({"type": "state", "saved": True, "data": room.serialize_for(player_id)})

        STORE.save_room(room)
        notify_firebase_signal(f"hs_{room_id}")
        return JSONResponse({"type": "state", "data": room.serialize_for(player_id)})
    finally:
        STORE.release_lock(room_id)


# ---------------------------------------------------------------------------
# Formula Traffic Light (수식 신호등) 1:1 Multiplayer Endpoints
# ---------------------------------------------------------------------------
FL_SERVER_EQUATIONS = [
    "2^5+18=50", "3^3+15=42", "2^6-19=45", "5^2+17=42", "9^2-37=44",
    "4^3-28=36", "7^2+26=75", "8^2-29=35", "3^4-18=63", "5^3-48=77",
    "6^2+49=85", "7^2-13=36", "8^2+19=83", "9^2-16=65", "2^7-39=89",
    "2^4+68=84", "4^3+29=93", "5^2+68=93", "6^2-18=18", "2^3×11=88",
    "12×7-9=75", "48÷6+7=15", "96÷8+5=17", "125-48=77", "36×2-8=64",
    "72÷9×8=64", "14×6-9=75", "84÷7+9=21", "144÷12=12", "124-57=67",
    "56+78=134", "67+89=156", "49+76=125", "83+59=142", "11×8-9=79",
    "13×7-6=85", "15×6-8=82", "16×5-7=73", "17×4+9=77", "19×5-8=87",
    "63÷7×9=81", "54÷6×8=72", "81÷9×7=63", "45÷5×9=81",
]


def fl_eval_colors(guess: str, answer: str) -> List[str]:
    res = ["r"] * 9
    rem: Dict[str, int] = {}
    for i in range(9):
        if guess[i] == answer[i]:
            res[i] = "g"
        else:
            rem[answer[i]] = rem.get(answer[i], 0) + 1
    for i in range(9):
        if res[i] == "g":
            continue
        ch = guess[i]
        if rem.get(ch, 0) > 0:
            res[i] = "y"
            rem[ch] -= 1
    return res


def fl_validate_equation(eq: str) -> Optional[str]:
    if len(eq) != 9:
        return "정확히 9칸이어야 합니다."
    if eq.count("=") != 1:
        return "등호(=)가 정확히 1개 포함되어야 합니다."
    allowed = set("0123456789+-×÷^=")
    if any(ch not in allowed for ch in eq):
        return "숫자와 연산자(+ - × ÷ ^ =)만 사용할 수 있습니다."
    import re
    if re.search(r"(^|[^0-9])0[0-9]", eq):
        return "0으로 시작하는 두 자리 이상 숫자는 사용할 수 없습니다."
    lhs, rhs = eq.split("=")
    if not lhs or not rhs or not rhs.isdigit():
        return "등호 오른쪽은 자연수(결과값)여야 합니다."
    py_lhs = lhs.replace("^", "**").replace("×", "*").replace("÷", "/")
    try:
        # Safe eval on strictly digits & arithmetic operators
        val = eval(py_lhs, {"__builtins__": {}}, {})
        if isinstance(val, bool) or abs(val - int(rhs)) > 1e-9:
            return f"수식 계산이 맞지 않습니다 ({lhs} ≠ {rhs})."
    except Exception:
        return "올바른 수식 형태가 아닙니다."
    return None


def fl_serialize(room: dict, viewer_id: str) -> dict:
    me = next((p for p in room["players"] if p["id"] == viewer_id), None)
    opp = next((p for p in room["players"] if p["id"] != viewer_id), None)
    done = room["phase"] == "DONE"
    return {
        "room_id": room["room_id"],
        "host_id": room["host_id"],
        "phase": room["phase"],  # WAITING, SETUP, PLAYING, DONE
        "round_num": room.get("round_num", 1),
        "winner_id": room.get("winner_id"),
        "winner_name": room.get("winner_name"),
        "viewer_id": viewer_id,
        "me": {
            "id": me["id"],
            "name": me["name"],
            "secret_set": bool(me.get("secret")),
            "my_secret": me.get("secret") or "",
            "pending_submitted": bool(me.get("pending_guess")),
            "pending_text": me.get("pending_guess") or "",
            "guesses": me["guesses"],
            "target_answer": (opp.get("secret") if opp and done else None),
        } if me else None,
        "opp": {
            "id": opp["id"],
            "name": opp["name"],
            "secret_set": bool(opp.get("secret")),
            "pending_submitted": bool(opp.get("pending_guess")),
            "tries": len(opp["guesses"]),
            "last_colors": opp["guesses"][-1]["colors"] if opp["guesses"] else [""] * 9,
            "best_greens": max((g["colors"].count("g") for g in opp["guesses"]), default=0),
            "target_answer": (me.get("secret") if me and done else None),
        } if opp else None,
    }


@app.post("/api/fl/create")
async def fl_create(payload: dict):
    try:
        name = (payload.get("name") or "방장").strip()[:12]
        room_id = gen_room_code()
        while STORE.get_json(f"hs:fl:{room_id}") is not None:
            room_id = gen_room_code()
        pid = f"fl_{random.randint(10000, 99999)}"
        room = {
            "room_id": room_id,
            "host_id": pid,
            "phase": "WAITING",
            "round_num": 1,
            "winner_id": None,
            "winner_name": None,
            "players": [{"id": pid, "name": name, "secret": "", "pending_guess": "", "guesses": []}],
        }
        STORE.set_json(f"hs:fl:{room_id}", room)
        return JSONResponse({"room_id": room_id, "player_id": pid, "data": fl_serialize(room, pid)})
    except Exception as e:
        return JSONResponse({"error": f"{type(e).__name__}: {e}"}, status_code=500)


@app.post("/api/fl/join")
async def fl_join(payload: dict):
    room_id = (payload.get("room_id") or "").strip().upper()
    name = (payload.get("name") or "도전자").strip()[:12]
    key = f"hs:fl:{room_id}"
    room = STORE.get_json(key)
    if not room:
        return JSONResponse({"error": "수식 신호등 방을 찾을 수 없습니다."}, status_code=404)
    # Reconnect if player with same nickname is already in this room
    existing = next((p for p in room["players"] if p["name"] == name), None)
    if existing:
        return JSONResponse({"room_id": room_id, "player_id": existing["id"], "rejoined": True, "data": fl_serialize(room, existing["id"])})
    if len(room["players"]) >= 2:
        return JSONResponse({"error": "이미 2명이 가득 찬 방입니다. (기존 닉네임으로 입력하면 재입장됩니다)"}, status_code=400)
    pid = f"fl_{random.randint(10000, 99999)}"
    room["players"].append({"id": pid, "name": name, "secret": "", "pending_guess": "", "guesses": []})
    room["phase"] = "SETUP"
    STORE.set_json(key, room)
    notify_firebase_signal(f"fl_{room_id}")
    return JSONResponse({"room_id": room_id, "player_id": pid, "data": fl_serialize(room, pid)})


@app.post("/api/fl/{room_id}/save")
async def fl_save(room_id: str, payload: dict):
    key = f"hs:fl:{room_id.upper()}"
    room = STORE.get_json(key)
    if not room:
        return JSONResponse({"error": "방을 찾을 수 없습니다."}, status_code=404)
    pid = payload.get("player_id", "")
    if not any(p["id"] == pid for p in room["players"]):
        return JSONResponse({"error": "권한이 없습니다."}, status_code=403)
    STORE.set_json(key, room, ttl=604800)  # 7 days
    return JSONResponse({"saved": True, "data": fl_serialize(room, pid)})


@app.post("/api/fl/{room_id}/set_secret")
async def fl_set_secret(room_id: str, payload: dict):
    key = f"hs:fl:{room_id.upper()}"
    room = STORE.get_json(key)
    if not room:
        return JSONResponse({"error": "방을 찾을 수 없습니다."}, status_code=404)
    pid = payload.get("player_id", "")
    secret = (payload.get("secret") or "").strip()
    err = fl_validate_equation(secret)
    if err:
        return JSONResponse({"error": err}, status_code=400)
    me = next((p for p in room["players"] if p["id"] == pid), None)
    if not me:
        return JSONResponse({"error": "권한이 없습니다."}, status_code=403)
    me["secret"] = secret
    if len(room["players"]) == 2 and all(bool(p.get("secret")) for p in room["players"]):
        room["phase"] = "PLAYING"
    STORE.set_json(key, room)
    notify_firebase_signal(f"fl_{room_id.upper()}")
    return JSONResponse({"data": fl_serialize(room, pid)})


@app.get("/api/fl/{room_id}")
async def fl_get(room_id: str, player_id: str):
    room = STORE.get_json(f"hs:fl:{room_id.upper()}")
    if not room:
        return JSONResponse({"error": "방을 찾을 수 없습니다."}, status_code=404)
    if not any(p["id"] == player_id for p in room["players"]):
        return JSONResponse({"error": "권한이 없습니다."}, status_code=403)
    return JSONResponse({"data": fl_serialize(room, player_id)})


@app.post("/api/fl/{room_id}/guess")
async def fl_guess(room_id: str, payload: dict):
    key = f"hs:fl:{room_id.upper()}"
    room = STORE.get_json(key)
    if not room:
        return JSONResponse({"error": "방을 찾을 수 없습니다."}, status_code=404)
    pid = payload.get("player_id", "")
    guess = (payload.get("guess") or "").strip()
    if room["phase"] != "PLAYING" or len(guess) != 9:
        return JSONResponse({"error": "제출할 수 없는 상태입니다."}, status_code=400)
    me = next((p for p in room["players"] if p["id"] == pid), None)
    opp = next((p for p in room["players"] if p["id"] != pid), None)
    if not me or not opp:
        return JSONResponse({"error": "권한이 없습니다."}, status_code=403)
    if me.get("pending_guess"):
        return JSONResponse({"error": "이미 이번 라운드 답안을 제출했습니다. 상대방 대기 중!"}, status_code=400)

    me["pending_guess"] = guess

    # Simultaneous evaluation once BOTH players have submitted for this round
    if me.get("pending_guess") and opp.get("pending_guess"):
        p0, p1 = room["players"][0], room["players"][1]
        g0, g1 = p0["pending_guess"], p1["pending_guess"]
        c0 = fl_eval_colors(g0, p1["secret"])
        c1 = fl_eval_colors(g1, p0["secret"])
        p0["guesses"].append({"text": g0, "colors": c0})
        p1["guesses"].append({"text": g1, "colors": c1})
        p0["pending_guess"] = ""
        p1["pending_guess"] = ""
        room["round_num"] = room.get("round_num", 1) + 1

        w0 = c0.count("g") == 9
        w1 = c1.count("g") == 9
        if w0 and w1:
            room["phase"] = "DONE"
            room["winner_id"] = "DRAW"
            room["winner_name"] = "무승부"
        elif w0:
            room["phase"] = "DONE"
            room["winner_id"] = p0["id"]
            room["winner_name"] = p0["name"]
        elif w1:
            room["phase"] = "DONE"
            room["winner_id"] = p1["id"]
            room["winner_name"] = p1["name"]

    STORE.set_json(key, room)
    notify_firebase_signal(f"fl_{room_id.upper()}")
    return JSONResponse({"data": fl_serialize(room, pid)})


@app.post("/api/fl/{room_id}/restart")
async def fl_restart(room_id: str, payload: dict):
    key = f"hs:fl:{room_id.upper()}"
    room = STORE.get_json(key)
    if not room:
        return JSONResponse({"error": "방을 찾을 수 없습니다."}, status_code=404)
    pid = payload.get("player_id", "")
    if pid != room["host_id"]:
        return JSONResponse({"error": "방장만 재경기를 시작할 수 있습니다."}, status_code=403)
    room["phase"] = "SETUP" if len(room["players"]) == 2 else "WAITING"
    room["round_num"] = 1
    room["winner_id"] = None
    room["winner_name"] = None
    for p in room["players"]:
        p["guesses"] = []
        p["secret"] = ""
        p["pending_guess"] = ""
    STORE.set_json(key, room)
    notify_firebase_signal(f"fl_{room_id.upper()}")
    return JSONResponse({"data": fl_serialize(room, pid)})


# ---------------------------------------------------------------------------
# Unified Multiplayer Endpoints for All Party Deck Games (Day 1 ~ Day 3+)
# ---------------------------------------------------------------------------
@app.post("/api/mp/create")
async def mp_create(payload: dict):
    try:
        gt = payload.get("game_type", "")
        if gt not in mp_engine.GAME_META:
            return JSONResponse({"error": "지원하지 않는 게임입니다."}, status_code=400)
        name = (payload.get("name") or "방장").strip()[:12]
        mode = payload.get("mode", "multi")
        rid = mp_engine.gen_code()
        while STORE.get_json(f"hs:mp:{rid}") is not None:
            rid = mp_engine.gen_code()
        room = mp_engine.create_mp_room(gt, name, rid)
        if payload.get("rule_mode") in ("classic", "shuffle"):
            room["rule_mode"] = payload["rule_mode"]
        if mode == "solo":
            ai_cnt = int(payload.get("ai_count", mp_engine.GAME_META[gt]["max_players"] - 1))
            ai_level = payload.get("ai_level", "normal")
            for _ in range(ai_cnt):
                mp_engine.add_ai_to_room(room, difficulty=ai_level)
            mp_engine.start_mp_game(room)
        STORE.set_json(f"hs:mp:{rid}", room)
        pid = room["host_id"]
        return JSONResponse({"room_id": rid, "player_id": pid, "data": mp_engine.serialize_mp_room(room, pid)})
    except Exception as e:
        return JSONResponse({"error": f"{type(e).__name__}: {e}"}, status_code=500)


@app.post("/api/mp/join")
async def mp_join(payload: dict):
    rid = (payload.get("room_id") or "").strip().upper()
    name = (payload.get("name") or "참가자").strip()[:12]
    key = f"hs:mp:{rid}"
    room = STORE.get_json(key)
    if not room:
        return JSONResponse({"error": "방을 찾을 수 없습니다."}, status_code=404)
    existing = next((p for p in room["players"] if not p["is_ai"] and p["name"] == name), None)
    if existing:
        return JSONResponse({"room_id": rid, "player_id": existing["id"], "rejoined": True, "data": mp_engine.serialize_mp_room(room, existing["id"])})
    if room["phase"] != "LOBBY":
        return JSONResponse({"error": "이미 진행 중인 방입니다. (기존 닉네임으로 재입장 가능)"}, status_code=400)
    if len(room["players"]) >= mp_engine.GAME_META[room["game_type"]]["max_players"]:
        return JSONResponse({"error": "방이 가득 찼습니다."}, status_code=400)
    pid = f"mp_{random.randint(10000, 99999)}"
    room["players"].append({"id": pid, "name": name, "is_ai": False})
    STORE.set_json(key, room)
    notify_firebase_signal(f"mp_{rid}")
    return JSONResponse({"room_id": rid, "player_id": pid, "data": mp_engine.serialize_mp_room(room, pid)})


@app.get("/api/mp/{room_id}")
async def mp_get(room_id: str, player_id: str):
    key = f"hs:mp:{room_id.upper()}"
    room = STORE.get_json(key)
    if not room:
        return JSONResponse({"error": "방을 찾을 수 없습니다."}, status_code=404)
    if not any(p["id"] == player_id for p in room["players"]):
        return JSONResponse({"error": "권한이 없습니다."}, status_code=403)
    if mp_engine.maybe_step_mp_ai(room):
        STORE.set_json(key, room)
        notify_firebase_signal(f"mp_{room_id.upper()}")
    return JSONResponse({"data": mp_engine.serialize_mp_room(room, player_id)})


@app.post("/api/mp/{room_id}/action")
async def mp_action(room_id: str, payload: dict):
    key = f"hs:mp:{room_id.upper()}"
    room = STORE.get_json(key)
    if not room:
        return JSONResponse({"error": "방을 찾을 수 없습니다."}, status_code=404)
    pid = payload.get("player_id", "")
    if payload.get("action") == "save":
        STORE.set_json(key, room, ttl=604800)
        return JSONResponse({"saved": True, "data": mp_engine.serialize_mp_room(room, pid)})
    err = mp_engine.handle_mp_action(room, pid, payload)
    if err:
        return JSONResponse({"error": err}, status_code=400)
    STORE.set_json(key, room)
    notify_firebase_signal(f"mp_{room_id.upper()}")
    return JSONResponse({"data": mp_engine.serialize_mp_room(room, pid)})


app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
