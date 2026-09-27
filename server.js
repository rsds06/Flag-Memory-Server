const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");
const crypto = require("crypto");

const app = express();
app.use(express.static(path.join(__dirname, "public")));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const COUNTRIES = require("./countries.json");
const MAX_PLAYERS = 6;

/** rooms: code -> { status, size, poolSize, players: [{id,name,score,countries,ws,connected}], turnIndex, tiles, flipped, matchedCount, winnerId } */
const rooms = new Map();

function genRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;
  do {
    code = "";
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  } while (rooms.has(code));
  return code;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildDeck(gridSize, poolLimit) {
  const pairCount = (gridSize * gridSize) / 2;
  const pool = shuffle(COUNTRIES.slice(0, poolLimit).slice());
  let picks;
  if (pairCount <= pool.length) {
    picks = shuffle(pool).slice(0, pairCount);
  } else {
    picks = [];
    for (let i = 0; i < pairCount; i++) picks.push(pool[i % pool.length]);
  }
  return shuffle(picks.concat(picks)).map((c) => ({ name: c.name, flag: c.flag, flipped: false, matched: false }));
}

function publicState(room) {
  return {
    status: room.status,
    size: room.size,
    poolSize: room.poolSize,
    players: room.players.map((p) => ({ id: p.id, name: p.name, score: p.score, countries: p.countries, connected: p.connected })),
    turnIndex: room.turnIndex,
    tiles: room.tiles,
    flipped: room.flipped,
    matchedCount: room.matchedCount,
    winnerId: room.winnerId
  };
}

function broadcast(room, code) {
  const payload = JSON.stringify({ type: "state", code, state: publicState(room) });
  room.players.forEach((p) => {
    if (p.ws && p.ws.readyState === WebSocket.OPEN) p.ws.send(payload);
  });
}

function send(ws, obj) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

wss.on("connection", (ws) => {
  let myRoomCode = null;
  let myId = crypto.randomBytes(6).toString("hex");

  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }

    if (msg.type === "host") {
      const code = genRoomCode();
      const room = {
        status: "lobby",
        size: 4,
        poolSize: 194,
        players: [{ id: myId, name: (msg.name || "Host").slice(0, 16), score: 0, countries: [], ws, connected: true }],
        turnIndex: 0,
        tiles: [],
        flipped: [],
        matchedCount: 0,
        winnerId: null
      };
      rooms.set(code, room);
      myRoomCode = code;
      send(ws, { type: "joined", code, youId: myId });
      broadcast(room, code);
    }

    else if (msg.type === "join") {
      const code = (msg.code || "").toUpperCase();
      const room = rooms.get(code);
      if (!room) return send(ws, { type: "error", message: "Room not found." });
      if (room.players.length >= MAX_PLAYERS && !room.players.some((p) => p.id === myId)) {
        return send(ws, { type: "error", message: "Room is full (max " + MAX_PLAYERS + ")." });
      }
      let player = room.players.find((p) => p.id === myId);
      if (!player) {
        player = { id: myId, name: (msg.name || "Player").slice(0, 16), score: 0, countries: [], ws, connected: true };
        room.players.push(player);
      } else {
        player.ws = ws;
        player.connected = true;
      }
      myRoomCode = code;
      send(ws, { type: "joined", code, youId: myId });
      broadcast(room, code);
    }

    else if (msg.type === "start") {
      const room = rooms.get(myRoomCode);
      if (!room) return;
      const isHost = room.players[0] && room.players[0].id === myId;
      if (!isHost) return;
      room.size = msg.size || room.size;
      room.poolSize = msg.poolSize || room.poolSize;
      room.tiles = buildDeck(room.size, room.poolSize);
      room.flipped = [];
      room.matchedCount = 0;
      room.turnIndex = Math.floor(Math.random() * room.players.length);
      room.winnerId = null;
      room.status = "playing";
      room.players.forEach((p) => { p.score = 0; p.countries = []; });
      broadcast(room, myRoomCode);
    }

    else if (msg.type === "flip") {
      const room = rooms.get(myRoomCode);
      if (!room || room.status !== "playing") return;
      const currentPlayer = room.players[room.turnIndex];
      if (!currentPlayer || currentPlayer.id !== myId) return;
      const idx = msg.index;
      const t = room.tiles[idx];
      if (!t || t.matched || t.flipped || room.flipped.includes(idx) || room.flipped.length >= 2) return;

      t.flipped = true;
      room.flipped.push(idx);

      if (room.flipped.length < 2) {
        broadcast(room, myRoomCode);
        return;
      }

      const [aIdx, bIdx] = room.flipped;
      const a = room.tiles[aIdx], b = room.tiles[bIdx];
      broadcast(room, myRoomCode);
      if (a.flag === b.flag) {
        setTimeout(() => {
          const r = rooms.get(myRoomCode);
          if (!r) return;
          const ra = r.tiles[aIdx], rb = r.tiles[bIdx];
          if (ra) ra.matched = true;
          if (rb) rb.matched = true;
          r.matchedCount += 2;
          const scoringPlayer = r.players[r.turnIndex];
          if (scoringPlayer) {
            scoringPlayer.score++;
            scoringPlayer.countries.push(ra ? ra.flag : a.flag);
          }
          r.flipped = [];
          if (r.matchedCount === r.tiles.length) {
            r.status = "finished";
            let top = r.players[0], tie = false;
            for (const p of r.players) {
              if (p.score > top.score) { top = p; tie = false; }
              else if (p.score === top.score && p !== top) tie = true;
            }
            r.winnerId = tie ? null : top.id;
          }
          broadcast(r, myRoomCode);
        }, 700);
      } else {
        broadcast(room, myRoomCode);
        setTimeout(() => {
          const r = rooms.get(myRoomCode);
          if (!r) return;
          const ta = r.tiles[aIdx], tb = r.tiles[bIdx];
          if (ta) ta.flipped = false;
          if (tb) tb.flipped = false;
          r.flipped = [];
          r.turnIndex = (r.turnIndex + 1) % r.players.length;
          broadcast(r, myRoomCode);
        }, 900);
      }
    }

    else if (msg.type === "leave") {
      const room = rooms.get(myRoomCode);
      if (room) {
        const p = room.players.find((pl) => pl.id === myId);
        if (p) p.connected = false;
        broadcast(room, myRoomCode);
      }
      myRoomCode = null;
    }
  });

  ws.on("close", () => {
    const room = rooms.get(myRoomCode);
    if (room) {
      const p = room.players.find((pl) => pl.id === myId);
      if (p) p.connected = false;
      broadcast(room, myRoomCode);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Flag Memory Match server running on port " + PORT);
  console.log("Open http://localhost:" + PORT + " to play.");
});
