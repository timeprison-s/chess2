const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;
const PUBLIC = path.join(__dirname, "public");
const rooms = new Map();

function send(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}

function broadcast(room, payload, except = null) {
  for (const p of room.players) {
    if (p.ws !== except) send(p.ws, payload);
  }
}

function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  do {
    code = Array.from({length: 5}, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  } while (rooms.has(code));
  return code;
}

function cleanName(name) {
  const value = String(name || "").trim().slice(0, 24);
  return value || "개잼체스 방";
}

function roomSnapshot(room) {
  return {
    code: room.code,
    name: room.name,
    locked: !!room.password,
    phase: room.phase,
    players: room.players.map((p, i) => ({
      color: p.color,
      slot: i + 1,
      host: i === 0,
      ready: !!p.ready,
      loadoutReady: !!p.loadout,
    })),
  };
}

function roomList() {
  return [...rooms.values()]
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(room => ({
      code: room.code,
      name: room.name,
      locked: !!room.password,
      players: room.players.length,
      phase: room.phase,
      status:
        room.phase === "playing" ? "playing" :
        room.phase === "loadout" ? "loadout" :
        room.players.length >= 2 ? "full" :
        "waiting",
    }));
}

function broadcastRoomList() {
  const payload = {type: "room_list", rooms: roomList()};
  for (const client of wss.clients) send(client, payload);
}

function resetToWaiting(room) {
  room.phase = "waiting";
  room.state = null;
  for (const p of room.players) {
    p.ready = false;
    p.loadout = null;
  }
}

function leaveCurrentRoom(ws, notify = true) {
  const code = ws.meta?.room;
  if (!code) return;

  const room = rooms.get(code);
  if (!room) {
    ws.meta = {room: null, color: null};
    return;
  }

  room.players = room.players.filter(p => p.ws !== ws);

  if (!room.players.length) {
    rooms.delete(code);
  } else {
    // 남은 플레이어가 새 호스트/백이 된다.
    const survivor = room.players[0];
    survivor.color = "white";
    survivor.ready = false;
    survivor.loadout = null;
    survivor.ws.meta.color = "white";
    resetToWaiting(room);
    send(survivor.ws, {type: "role_update", color: "white"});
    broadcast(room, {type: "room_snapshot", snapshot: roomSnapshot(room)});
  }

  ws.meta = {room: null, color: null};
  if (notify) send(ws, {type: "left_room"});
  broadcastRoomList();
}

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split("?")[0]);
  if (urlPath === "/") urlPath = "/index.html";

  const safePath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, "");
  const file = path.join(PUBLIC, safePath);

  if (!file.startsWith(PUBLIC)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end("Not found");
    }

    const ext = path.extname(file);
    const types = {
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
    };

    res.writeHead(200, {
      "Content-Type": types[ext] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(data);
  });
});

const wss = new WebSocket.Server({server});

wss.on("connection", ws => {
  ws.meta = {room: null, color: null};
  send(ws, {type: "room_list", rooms: roomList()});

  ws.on("message", raw => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return send(ws, {type: "error", message: "잘못된 요청."});
    }

    if (msg.type === "list_rooms") {
      return send(ws, {type: "room_list", rooms: roomList()});
    }

    if (msg.type === "create_room") {
      leaveCurrentRoom(ws, false);

      const code = makeCode();
      const room = {
        code,
        name: cleanName(msg.name),
        password: String(msg.password || "").slice(0, 32),
        players: [],
        phase: "waiting",
        state: null,
        createdAt: Date.now(),
      };

      rooms.set(code, room);

      room.players.push({
        ws,
        color: "white",
        ready: false,
        loadout: null,
      });

      ws.meta = {room: code, color: "white"};

      send(ws, {
        type: "room_joined",
        color: "white",
        room: code,
        snapshot: roomSnapshot(room),
      });

      broadcastRoomList();
      return;
    }

    if (msg.type === "join_room") {
      const code = String(msg.room || "").trim().toUpperCase();
      const room = rooms.get(code);

      if (!room) return send(ws, {type: "error", message: "방을 찾을 수 없음."});
      if (room.phase !== "waiting") return send(ws, {type: "error", message: "지금은 참가할 수 없는 방임."});
      if (room.players.length >= 2) return send(ws, {type: "error", message: "방이 가득 참."});
      if (room.password && String(msg.password || "") !== room.password) {
        return send(ws, {type: "error", message: "비밀번호가 틀림."});
      }

      leaveCurrentRoom(ws, false);

      room.players.push({
        ws,
        color: "black",
        ready: false,
        loadout: null,
      });

      ws.meta = {room: code, color: "black"};

      send(ws, {
        type: "room_joined",
        color: "black",
        room: code,
        snapshot: roomSnapshot(room),
      });

      broadcast(room, {type: "room_snapshot", snapshot: roomSnapshot(room)});
      broadcastRoomList();
      return;
    }

    if (msg.type === "leave_room") {
      leaveCurrentRoom(ws, true);
      return;
    }

    const room = rooms.get(ws.meta.room);
    if (!room) return send(ws, {type: "error", message: "현재 방에 들어가 있지 않음."});

    const me = room.players.find(p => p.ws === ws);
    if (!me) return;

    if (msg.type === "toggle_ready") {
      if (room.phase !== "waiting") return;
      me.ready = !me.ready;

      broadcast(room, {type: "room_snapshot", snapshot: roomSnapshot(room)});

      if (room.players.length === 2 && room.players.every(p => p.ready)) {
        room.phase = "loadout";
        for (const p of room.players) p.loadout = null;

        broadcast(room, {
          type: "phase_loadout",
          snapshot: roomSnapshot(room),
        });
      }

      broadcastRoomList();
      return;
    }

    if (msg.type === "loadout") {
      if (room.phase !== "loadout") {
        return send(ws, {type: "error", message: "아직 기물 선택 단계가 아님."});
      }

      if (!Array.isArray(msg.items) || msg.items.length !== 6) {
        return send(ws, {type: "error", message: "정확히 6종을 골라야 함."});
      }

      me.loadout = [...new Set(msg.items)];
      if (me.loadout.length !== 6) {
        return send(ws, {type: "error", message: "중복 선택 불가."});
      }

      broadcast(room, {type: "room_snapshot", snapshot: roomSnapshot(room)});

      if (room.players.every(p => p.loadout)) {
        const loadouts = Object.fromEntries(room.players.map(p => [p.color, p.loadout]));
        room.phase = "playing";
        room.state = null;

        broadcast(room, {type: "start_game", loadouts});
      }

      broadcastRoomList();
      return;
    }

    if (msg.type === "state") {
      const incoming = msg.state;
      if (incoming && typeof incoming === "object") {
        if (!incoming.clocks) incoming.clocks = {white:600000, black:600000};
        const sameTurn = room.state && room.state.ply === incoming.ply && room.state.turn === incoming.turn;
        incoming.turnStartedAt = sameTurn && Number.isFinite(room.state.turnStartedAt)
          ? room.state.turnStartedAt
          : Date.now();
      }
      room.state = incoming;
      room.phase = "playing";
      broadcast(room, {type: "state", state: room.state}, ws);
      broadcastRoomList();
      return;
    }

    if (msg.type === "request_state" && room.state) {
      return send(ws, {type: "state", state: room.state});
    }
  });

  ws.on("close", () => leaveCurrentRoom(ws, false));
  ws.on("error", err => console.error("WebSocket error:", err.message));
});


setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    const state = room.state;
    if (room.phase !== "playing" || !state || state.winner) continue;
    if (!state.clocks || !Number.isFinite(state.turnStartedAt)) continue;
    const color = state.turn;
    const remaining = Number(state.clocks[color] ?? 0);
    if (remaining - (now - state.turnStartedAt) <= 0) {
      state.clocks[color] = 0;
      state.winner = color === "white" ? "black" : "white";
      state.turnStartedAt = now;
      if (Array.isArray(state.log)) state.log.push(`${color === "white" ? "백" : "흑"} 시간 초과.`);
      broadcast(room, {type: "state", state});
      broadcastRoomList();
    }
  }
}, 250);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`개잼체스 서버 실행: ${PORT}`);
});
