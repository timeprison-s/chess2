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
function roomSnapshot(room) {
  return {
    code: room.code,
    players: room.players.map(p => ({ color: p.color, ready: !!p.loadout })),
  };
}
function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  do {
    code = Array.from({length: 5}, () => chars[Math.floor(Math.random()*chars.length)]).join("");
  } while (rooms.has(code));
  return code;
}

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split("?")[0]);
  if (urlPath === "/") urlPath = "/index.html";
  const file = path.join(PUBLIC, urlPath);
  if (!file.startsWith(PUBLIC)) {
    res.writeHead(403); return res.end("Forbidden");
  }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end("Not found"); }
    const ext = path.extname(file);
    const types = {
      ".html":"text/html; charset=utf-8",
      ".js":"text/javascript; charset=utf-8",
      ".css":"text/css; charset=utf-8",
      ".json":"application/json; charset=utf-8"
    };
    res.writeHead(200, {"Content-Type": types[ext] || "application/octet-stream"});
    res.end(data);
  });
});

const wss = new WebSocket.Server({ server });
wss.on("connection", ws => {
  ws.meta = { room: null, color: null };

  ws.on("message", raw => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    if (msg.type === "create_room") {
      const code = makeCode();
      const room = { code, players: [], state: null };
      rooms.set(code, room);
      room.players.push({ws, color:"white", loadout:null});
      ws.meta = {room: code, color:"white"};
      send(ws, {type:"room_joined", color:"white", room:code, snapshot:roomSnapshot(room)});
      return;
    }

    if (msg.type === "join_room") {
      const code = String(msg.room || "").trim().toUpperCase();
      const room = rooms.get(code);
      if (!room) return send(ws, {type:"error", message:"방을 찾을 수 없음."});
      if (room.players.length >= 2) return send(ws, {type:"error", message:"이미 2명이 들어와 있음."});
      room.players.push({ws, color:"black", loadout:null});
      ws.meta = {room: code, color:"black"};
      broadcast(room, {type:"room_snapshot", snapshot:roomSnapshot(room)});
      send(ws, {type:"room_joined", color:"black", room:code, snapshot:roomSnapshot(room)});
      return;
    }

    const room = rooms.get(ws.meta.room);
    if (!room) return;
    const me = room.players.find(p => p.ws === ws);
    if (!me) return;

    if (msg.type === "loadout") {
      if (!Array.isArray(msg.items) || msg.items.length !== 6) {
        return send(ws, {type:"error", message:"정확히 6종을 골라야 함."});
      }
      me.loadout = [...new Set(msg.items)];
      if (me.loadout.length !== 6) return send(ws, {type:"error", message:"중복 선택 불가."});
      broadcast(room, {type:"room_snapshot", snapshot:roomSnapshot(room)});
      if (room.players.length === 2 && room.players.every(p => p.loadout)) {
        const loadouts = Object.fromEntries(room.players.map(p => [p.color, p.loadout]));
        room.state = null;
        broadcast(room, {type:"start_game", loadouts});
      }
      return;
    }

    if (msg.type === "state") {
      room.state = msg.state;
      broadcast(room, {type:"state", state:msg.state}, ws);
      return;
    }

    if (msg.type === "request_state" && room.state) {
      send(ws, {type:"state", state:room.state});
    }
  });

  ws.on("close", () => {
    const code = ws.meta.room;
    const room = rooms.get(code);
    if (!room) return;
    room.players = room.players.filter(p => p.ws !== ws);
    if (!room.players.length) rooms.delete(code);
    else broadcast(room, {type:"room_snapshot", snapshot:roomSnapshot(room)});
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`개잼체스 서버 실행: ${PORT}`);
});
