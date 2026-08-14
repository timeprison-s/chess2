const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;
const PUBLIC = path.join(__dirname, "public");
const rooms = new Map();

function send(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcast(room, payload, except = null) {
  for (const p of room.players) {
    if (p.ws !== except) send(p.ws, payload);
  }
}

function roomSnapshot(room) {
  return {
    code: room.code,
    players: room.players.map(p => ({
      color: p.color,
      ready: !!p.loadout,
    })),
  };
}

function roomList() {
  return [...rooms.values()]
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(room => ({
      code: room.code,
      players: room.players.length,
      ready: room.players.filter(p => p.loadout).length,
      status: room.state
        ? "playing"
        : room.players.length >= 2
          ? "full"
          : "waiting",
    }));
}

function broadcastRoomList() {
  const payload = { type: "room_list", rooms: roomList() };
  for (const client of wss.clients) send(client, payload);
}

function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  do {
    code = Array.from(
      { length: 5 },
      () => chars[Math.floor(Math.random() * chars.length)]
    ).join("");
  } while (rooms.has(code));
  return code;
}

function leaveCurrentRoom(ws) {
  const code = ws.meta?.room;
  if (!code) return;

  const room = rooms.get(code);
  if (!room) {
    ws.meta = { room: null, color: null };
    return;
  }

  room.players = room.players.filter(p => p.ws !== ws);

  if (room.players.length === 0) {
    rooms.delete(code);
  } else {
    broadcast(room, {
      type: "room_snapshot",
      snapshot: roomSnapshot(room),
    });
  }

  ws.meta = { room: null, color: null };
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
      ".json": "application/json; charset=utf-8",
    };

    res.writeHead(200, {
      "Content-Type": types[ext] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(data);
  });
});

const wss = new WebSocket.Server({ server });

wss.on("connection", ws => {
  ws.meta = { room: null, color: null };

  send(ws, { type: "room_list", rooms: roomList() });

  ws.on("message", raw => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return send(ws, { type: "error", message: "잘못된 요청." });
    }

    if (msg.type === "list_rooms") {
      return send(ws, { type: "room_list", rooms: roomList() });
    }

    if (msg.type === "create_room") {
      leaveCurrentRoom(ws);

      const code = makeCode();
      const room = {
        code,
        players: [],
        state: null,
        createdAt: Date.now(),
      };

      rooms.set(code, room);
      room.players.push({
        ws,
        color: "white",
        loadout: null,
      });

      ws.meta = { room: code, color: "white" };

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

      if (!room) {
        return send(ws, {
          type: "error",
          message: "방을 찾을 수 없음.",
        });
      }

      if (room.state) {
        return send(ws, {
          type: "error",
          message: "이미 게임이 시작된 방임.",
        });
      }

      if (room.players.length >= 2) {
        return send(ws, {
          type: "error",
          message: "이미 2명이 들어와 있음.",
        });
      }

      leaveCurrentRoom(ws);

      room.players.push({
        ws,
        color: "black",
        loadout: null,
      });

      ws.meta = { room: code, color: "black" };

      send(ws, {
        type: "room_joined",
        color: "black",
        room: code,
        snapshot: roomSnapshot(room),
      });

      broadcast(room, {
        type: "room_snapshot",
        snapshot: roomSnapshot(room),
      });

      broadcastRoomList();
      return;
    }

    const room = rooms.get(ws.meta.room);
    if (!room) {
      return send(ws, {
        type: "error",
        message: "현재 들어가 있는 방이 없음.",
      });
    }

    const me = room.players.find(p => p.ws === ws);
    if (!me) return;

    if (msg.type === "loadout") {
      if (!Array.isArray(msg.items) || msg.items.length !== 6) {
        return send(ws, {
          type: "error",
          message: "정확히 6종을 골라야 함.",
        });
      }

      me.loadout = [...new Set(msg.items)];

      if (me.loadout.length !== 6) {
        return send(ws, {
          type: "error",
          message: "중복 선택 불가.",
        });
      }

      broadcast(room, {
        type: "room_snapshot",
        snapshot: roomSnapshot(room),
      });

      if (
        room.players.length === 2 &&
        room.players.every(p => p.loadout)
      ) {
        const loadouts = Object.fromEntries(
          room.players.map(p => [p.color, p.loadout])
        );

        room.state = null;

        broadcast(room, {
          type: "start_game",
          loadouts,
        });
      }

      broadcastRoomList();
      return;
    }

    if (msg.type === "state") {
      room.state = msg.state;
      broadcast(room, {
        type: "state",
        state: msg.state,
      }, ws);
      broadcastRoomList();
      return;
    }

    if (msg.type === "request_state" && room.state) {
      return send(ws, {
        type: "state",
        state: room.state,
      });
    }
  });

  ws.on("close", () => {
    leaveCurrentRoom(ws);
  });

  ws.on("error", err => {
    console.error("WebSocket error:", err.message);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`개잼체스 서버 실행: ${PORT}`);
});
