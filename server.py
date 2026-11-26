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
            return False, "not_configured"
        try:
            res = self._redis_cmd("PING")
            return res == "PONG", str(res)
        except Exception as e:
            return False, f"{type(e).__name__}: {e}"

    def get_room(self, room_id: str) -> Optional["GameRoom"]:
        key = f"hs:room:{room_id}"
        raw = self._redis_cmd("GET", key) if self.use_redis else self.local.get(key)
        if not raw:
            return None
        return GameRoom.from_dict(json.loads(raw))

    def save_room(self, room: "GameRoom"):
        key = f"hs:room:{room.room_id}"
        raw = json.dumps(room.to_dict(), ensure_ascii=False)
        if self.use_redis:
            self._redis_cmd("SET", key, raw, "EX", 86400)
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
            "current_bet": self.current_bet,
            "max_round_bet": self.max_round_bet,
            "players": players_data,
            "visible_counts": visible_counts,
            "logs": self.logs[-15:],
            "winner_info": self.winner_info,
            "viewer_id": viewer_id,
        }

    def fill_ai_bots(self):
        bot_names = ["VIPER", "NOVA", "KRONOS", "ORION", "ZEPHYR"]
        existing_names = {p.name for p in self.players}
        idx = 1
        for bname in bot_names:
            if len(self.players) >= 5:
                break
            if bname in existing_names:
                continue
            self.players.append(
                Player(
                    id=f"ai_{idx}_{random.randint(100,999)}",
                    name=bname,
                    is_ai=True,
                    chips=self.starting_chips,
                )
            )
            idx += 1

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
        if self.round_num % 2 == 1:
            self.target = random.randint(5, 12)
            self.add_log(f"🎲 8면체 주사위 결과: 한계 숫자 [ {self.target} ]")

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
            raise_amount = max(1, min(raise_amount, 10))
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
            self.next_ai_at = time.time() + 0.65
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


@app.get("/api/health")
async def health():
    redis_ok, redis_detail = STORE.ping()
    return {
        "ok": True,
        "redis": STORE.use_redis,
        "redis_ok": redis_ok,
        "redis_detail": redis_detail,
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
            room.fill_ai_bots()
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

        if mtype == "start_multi" and player_id == room.host_id and room.phase == "LOBBY":
            if payload.get("fill_ai", True):
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

        STORE.save_room(room)
        return JSONResponse({"type": "state", "data": room.serialize_for(player_id)})
    finally:
        STORE.release_lock(room_id)


app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
