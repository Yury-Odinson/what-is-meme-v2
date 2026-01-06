const { createServer } = require("http");
const crypto = require("crypto");
const next = require("next");
const { Server } = require("socket.io");
const memeData = require("./data/memes.json");
const questionData = require("./data/questions.json");
const sampleCards = memeData.map((item) => ({
  id: item.id,
  label: item.name,
  imageUrl: item.path,
}));
const sampleQuestions = questionData.map((item) => item.name);

const dev = process.env.NODE_ENV !== "production";
const port = process.env.PORT || 3000;
const app = next({ dev });
const handle = app.getRequestHandler();

const HAND_SIZE = 6;
const TURN_TIME_MS = 45_000;
const VOTE_TIME_MS = 30_000;

const rooms = new Map();

function cleanText(value = "", max = 180) {
  return String(value).trim().slice(0, max);
}

function randomId(prefix = "id") {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function shuffle(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function buildDeck(multiplier = 10) {
  const deck = [];
  let count = 0;
  while (deck.length < multiplier * sampleCards.length) {
    sampleCards.forEach((card) => {
      deck.push({
        ...card,
        id: `${card.id}-${count}`,
      });
      count += 1;
    });
  }
  return shuffle(deck);
}

function playerLeavesRoom(socket, io) {
  const roomId = socket.data.roomId;
  if (!roomId) return;
  const room = rooms.get(roomId);
  if (!room) {
    socket.data.roomId = null;
    return;
  }

  room.players.delete(socket.id);
  socket.leave(roomId);

  if (room.hostId === socket.id) {
    const nextHost = room.players.values().next().value;
    room.hostId = nextHost ? nextHost.id : null;
    if (room.hostId) {
      const hostPlayer = room.players.get(room.hostId);
      if (hostPlayer) hostPlayer.isHost = true;
    }
  }

  if (room.players.size === 0) {
    rooms.delete(roomId);
  } else {
    emitRoomState(room, io);
    emitLobbyState(io);
  }
  socket.data.roomId = null;
}

function serializeLobbyRoom(room) {
  return {
    id: room.id,
    name: room.name,
    playerCount: room.players.size,
    status: room.status,
    requiresPassword: Boolean(room.password),
    questionTotal: room.questionTotal,
  };
}

function emitLobbyState(io) {
  io.emit(
    "lobby:state",
    Array.from(rooms.values()).map((room) => serializeLobbyRoom(room))
  );
}

function serializeRoomFor(room, playerId) {
  const you = room.players.get(playerId);
  const submissions = room.submissions.map((submission) => {
    const owner = room.players.get(submission.playerId);
    return {
      playerId: submission.playerId,
      playerName: owner ? owner.name : "???",
      card: submission.card,
      votes: submission.votes.size,
      isYours: submission.playerId === playerId,
    };
  });

  return {
    id: room.id,
    name: room.name,
    status: room.status,
    hostId: room.hostId,
    currentQuestionIndex: room.currentQuestionIndex,
    questionTotal: room.questionTotal,
    currentQuestion: room.questions[room.currentQuestionIndex] ?? null,
    turnEndsAt: room.turnEndsAt,
    voteEndsAt: room.voteEndsAt,
    deckRemaining: room.deck.length,
    isGame: room.status === "playing" || room.status === "voting",
    players: Array.from(room.players.values()).map((p) => ({
      id: p.id,
      name: p.name,
      score: p.score,
      isHost: p.isHost,
      hasPlayed: Boolean(p.playedCardId),
    })),
    submissions,
    hand: you ? you.hand : [],
    chat: room.chat,
  };
}

function emitRoomState(room, io) {
  room.players.forEach((player) => {
    io.to(player.id).emit("room:state", serializeRoomFor(room, player.id));
  });
}

function dealCards(room) {
  room.players.forEach((player) => {
    while (player.hand.length < HAND_SIZE && room.deck.length > 0) {
      player.hand.push(room.deck.shift());
    }
  });
}

function startNextQuestion(room) {
  room.currentQuestionIndex += 1;
  if (room.currentQuestionIndex >= room.questions.length) {
    room.currentQuestionIndex = Math.max(0, room.questions.length - 1);
    room.status = "finished";
    room.turnEndsAt = null;
    room.voteEndsAt = null;
    room.submissions = [];
    room.voteRegistry = new Map();
    room.players.forEach((player) => {
      player.hand = [];
      player.playedCardId = null;
    });
    return;
  }

  room.status = "playing";
  room.submissions = [];
  room.voteRegistry = new Map();
  room.players.forEach((player) => {
    player.playedCardId = null;
  });
  dealCards(room);
  room.turnEndsAt = Date.now() + TURN_TIME_MS;
  room.voteEndsAt = null;
}

function tryMoveToVoting(room) {
  if (room.submissions.length === room.players.size) {
    room.status = "voting";
    room.turnEndsAt = null;
    room.voteEndsAt = Date.now() + VOTE_TIME_MS;
  }
}

function finishVoting(room) {
  const tally = new Map();
  room.voteRegistry.forEach((targetId) => {
    const current = tally.get(targetId) ?? 0;
    tally.set(targetId, current + 1);
  });

  // Найти максимум голосов
  let topScore = 0;
  tally.forEach((count) => {
    if (count > topScore) topScore = count;
  });

  // Начислить очки всем лидерам (включая ничьи)
  if (topScore > 0) {
    tally.forEach((count, submissionOwnerId) => {
      if (count === topScore) {
        const player = room.players.get(submissionOwnerId);
        if (player) player.score += 1;
      }
    });
  }

  startNextQuestion(room);
}

function createRoom({ name, password, questionTotal, questions, hostSocket }) {
  const roomId = randomId("room");
  const trimmedQuestions =
    questions && questions.length > 0
      ? questions.slice(0, questionTotal)
      : sampleQuestions.slice(0, questionTotal);

  const room = {
    id: roomId,
    name: cleanText(name || "Новая комната"),
    password: cleanText(password || "", 64),
    hostId: hostSocket.id,
    status: "waiting",
    players: new Map(),
    deck: [],
    submissions: [],
    voteRegistry: new Map(),
    questions: trimmedQuestions,
    questionTotal: trimmedQuestions.length,
    currentQuestionIndex: -1,
    turnEndsAt: null,
    voteEndsAt: null,
    chat: [],
  };

  rooms.set(roomId, room);
  return room;
}

function normalizeQuestions(input = "") {
  return cleanText(input, 2_000)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function appendChat(room, message) {
  room.chat.push(message);
  if (room.chat.length > 50) {
    room.chat.splice(0, room.chat.length - 50);
  }
}

app
  .prepare()
  .then(() => {
    const server = createServer((req, res) => handle(req, res));
    const io = new Server(server, { path: "/socket.io" });

    io.on("connection", (socket) => {
      socket.data.name = "";
      socket.data.roomId = null;

      socket.on("player:register", ({ name }) => {
        socket.data.name = cleanText(name || "Гость", 32) || "Гость";
        socket.emit("player:ack", { id: socket.id, name: socket.data.name });
        emitLobbyState(io);
      });

      socket.on(
        "lobby:createRoom",
        ({ name, password, questionTotal = 2, questions }) => {
          if (!socket.data.name) return;
          const room = createRoom({
            name,
            password,
            questionTotal: Number(questionTotal) || 2,
            questions: normalizeQuestions(questions),
            hostSocket: socket,
          });
          const player = {
            id: socket.id,
            name: socket.data.name,
            hand: [],
            score: 0,
            isHost: true,
            playedCardId: null,
          };
          room.players.set(socket.id, player);
          socket.join(room.id);
          socket.data.roomId = room.id;
          emitLobbyState(io);
          emitRoomState(room, io);
          socket.emit("room:joined", { roomId: room.id });
        }
      );

      socket.on("lobby:requestRooms", () => emitLobbyState(io));

      socket.on("lobby:chat", ({ message }) => {
        const text = cleanText(message, 280);
        if (!text) return;
        io.emit("lobby:chat", {
          id: randomId("msg"),
          from: socket.data.name || "Гость",
          body: text,
          ts: Date.now(),
        });
      });

      socket.on("room:join", ({ roomId, password }) => {
        const room = rooms.get(roomId);
        if (!room) {
          socket.emit("room:error", { message: "Комната не найдена" });
          return;
        }
        if (room.password && room.password !== cleanText(password || "", 64)) {
          socket.emit("room:error", { message: "Неверный пароль" });
          return;
        }

        if (socket.data.roomId && socket.data.roomId !== roomId) {
          playerLeavesRoom(socket, io);
        }

        let player = room.players.get(socket.id);
        if (!player) {
          player = {
            id: socket.id,
            name: socket.data.name || "Гость",
            hand: [],
            score: 0,
            isHost: false,
            playedCardId: null,
          };
          room.players.set(socket.id, player);
        } else {
          player.name = socket.data.name || player.name;
        }

        socket.join(roomId);
        socket.data.roomId = roomId;
        emitLobbyState(io);
        emitRoomState(room, io);
        socket.emit("room:joined", { roomId });
      });

      socket.on("room:leave", () => {
        playerLeavesRoom(socket, io);
        emitLobbyState(io);
      });

      socket.on("room:chat", ({ message }) => {
        const roomId = socket.data.roomId;
        const room = rooms.get(roomId);
        const text = cleanText(message, 280);
        if (!room || !text) return;

        const payload = {
          id: randomId("msg"),
          from: socket.data.name || "Гость",
          body: text,
          ts: Date.now(),
        };
        appendChat(room, payload);
        io.to(room.id).emit("room:chat", payload);
      });

      socket.on("room:start", () => {
        const roomId = socket.data.roomId;
        const room = rooms.get(roomId);
        if (!room || room.hostId !== socket.id) return;
        if (room.players.size < 2) {
          socket.emit("room:error", {
            message: "Нужно минимум 2 игрока",
          });
          return;
        }
        room.deck = buildDeck(room.players.size * HAND_SIZE);
        room.submissions = [];
        room.voteRegistry = new Map();
        room.currentQuestionIndex = -1;
        room.players.forEach((player) => {
          player.hand = [];
          player.playedCardId = null;
          player.score = 0;
        });
        startNextQuestion(room);
        emitRoomState(room, io);
        emitLobbyState(io);
      });

      socket.on("game:playCard", ({ cardId }) => {
        const roomId = socket.data.roomId;
        const room = rooms.get(roomId);
        if (!room || room.status !== "playing") return;
        const player = room.players.get(socket.id);
        if (!player || player.playedCardId) return;
        const cardIndex = player.hand.findIndex((card) => card.id === cardId);
        if (cardIndex === -1) return;
        const [card] = player.hand.splice(cardIndex, 1);
        player.playedCardId = card.id;
        room.submissions.push({
          playerId: player.id,
          card,
          votes: new Set(),
        });
        if (room.deck.length > 0) {
          player.hand.push(room.deck.shift());
        }
        tryMoveToVoting(room);
        emitRoomState(room, io);
      });

      socket.on("game:vote", ({ targetPlayerId }) => {
        const roomId = socket.data.roomId;
        const room = rooms.get(roomId);
        if (!room || room.status !== "voting") return;
        const player = room.players.get(socket.id);
        if (!player || targetPlayerId === player.id) return;
        const submissionExists = room.submissions.some(
          (sub) => sub.playerId === targetPlayerId
        );
        if (!submissionExists) return;
        room.voteRegistry.set(player.id, targetPlayerId);
        room.submissions.forEach((sub) => sub.votes.clear());
        room.voteRegistry.forEach((voteTarget, voterId) => {
          const submission = room.submissions.find(
            (sub) => sub.playerId === voteTarget
          );
          if (submission) submission.votes.add(voterId);
        });
        if (room.voteRegistry.size === room.players.size) {
          finishVoting(room);
        }
        emitRoomState(room, io);
      });

      socket.on("disconnect", () => {
        playerLeavesRoom(socket, io);
        emitLobbyState(io);
      });
    });

    server.listen(port, (err) => {
      if (err) throw err;
      console.log(`> Ready on http://localhost:${port}`);
    });
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
