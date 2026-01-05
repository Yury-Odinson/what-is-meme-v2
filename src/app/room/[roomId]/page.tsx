"use client";

import Image from "next/image";
import { useMemo, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ensureSocketConnection } from "@/lib/socket";
import { loadPlayerProfile } from "@/lib/playerStorage";
import type { Card, ChatMessage, RoomState } from "@/types/game";

function formatCountdown(target: number | null, now: number) {
  if (!target) return "—";
  const diff = Math.max(0, target - now);
  const seconds = Math.ceil(diff / 1000);
  return `${seconds} c`;
}

export default function RoomPage() {
  const router = useRouter();
  const params = useParams<{ roomId: string }>();
  const roomId = params.roomId;

  const profile = useMemo(() => loadPlayerProfile(), []);
  const socket = useMemo(() => ensureSocketConnection(), []);

  const [room, setRoom] = useState<RoomState | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [message, setMessage] = useState("");
  const [password, setPassword] = useState("");
  const passwordRef = useRef("");
  const [questionTotal, setQuestionTotal] = useState(5);
  const [questionList, setQuestionList] = useState("");
  const [joinError, setJoinError] = useState("");
  const [pendingJoin, setPendingJoin] = useState(false);
  const [now, setNow] = useState(Date.now());
  const chatRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!profile.name) {
      router.push("/");
      return;
    }

    const attemptJoin = (pwd = passwordRef.current) => {
      setPendingJoin(true);
      socket.emit("player:register", { name: profile.name });
      socket.emit("room:join", { roomId, password: pwd });
    };

    attemptJoin();

    const handleConnect = () => attemptJoin();
    const handleRoomState = (state: RoomState) => {
      if (state.id !== roomId) return;
      setRoom(state);
      setChat(state.chat || []);
      setJoinError("");
      setPendingJoin(false);
      if (state.status === "waiting") {
        setQuestionTotal(state.questionTotal || 5);
        setQuestionList((state.questions || []).join("\n"));
      }
    };

    const handleRoomChat = (payload: ChatMessage) => {
      setChat((prev) => [...prev.slice(-40), payload]);
    };

    const handleRoomError = ({ message: err }: { message: string }) => {
      setJoinError(err || "Ошибка");
      setPendingJoin(false);
    };

    const handleJoined = ({ roomId: joinedId }: { roomId: string }) => {
      if (joinedId === roomId) setPendingJoin(false);
    };

    socket.on("connect", handleConnect);
    socket.on("room:state", handleRoomState);
    socket.on("room:chat", handleRoomChat);
    socket.on("room:error", handleRoomError);
    socket.on("room:joined", handleJoined);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("room:state", handleRoomState);
      socket.off("room:chat", handleRoomChat);
      socket.off("room:error", handleRoomError);
      socket.off("room:joined", handleJoined);
    };
  }, [profile.name, roomId, router, socket]);

  useEffect(() => {
    const el = chatRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [chat]);

  const startGame = () => socket.emit("room:start");
  const leaveRoom = () => {
    socket.emit("room:leave");
    router.push("/lobby");
  };
  const playCard = (card: Card) => socket.emit("game:playCard", { cardId: card.id });
  const voteFor = (playerId: string) =>
    socket.emit("game:vote", { targetPlayerId: playerId });
  const sendChat = (event: React.FormEvent) => {
    event.preventDefault();
    if (!message.trim()) return;
    socket.emit("room:chat", { message });
    setMessage("");
  };
  const saveSettings = (event: React.FormEvent) => {
    event.preventDefault();
    socket.emit("room:updateSettings", {
      questionTotal,
      questions: questionList,
    });
  };

  const you = room?.players.find((p) => p.id === socket.id);
  const isPlaying = room?.status === "playing";
  const isVoting = room?.status === "voting";
  const statusText =
    room?.status === "waiting"
      ? "Ожидание старта"
      : isPlaying
        ? "Ход: выкладываем мем"
        : isVoting
          ? "Голосование"
          : "Игра завершена";

  return (
    <main style={{ display: "grid", gap: "16px" }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
        <div>
          <h1 style={{ margin: 0 }}>{room?.name || "Комната"}</h1>
          <p style={{ margin: "4px 0 0" }}>Игрок: {profile.name}</p>
          <p style={{ margin: "4px 0 0" }}>
            Статус: {statusText} · Вопрос {room ? room.currentQuestionIndex + 1 : 0} из{" "}
            {room?.questionTotal ?? "—"}
          </p>
          {isPlaying ? (
            <p style={{ margin: 0 }}>До конца хода: {formatCountdown(room.turnEndsAt, now)}</p>
          ) : null}
          {isVoting ? (
            <p style={{ margin: 0 }}>
              До конца голосования: {formatCountdown(room.voteEndsAt, now)}
            </p>
          ) : null}
          {joinError ? (
            <div style={{ color: "red", marginTop: "6px" }}>
              {joinError}
              <div style={{ display: "flex", gap: "8px", marginTop: "6px" }}>
                <input
                  type="password"
                  value={password}
                  placeholder="Пароль комнаты"
                  onChange={(event) => {
                    setPassword(event.target.value);
                    passwordRef.current = event.target.value;
                  }}
                  style={{
                    padding: "8px",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                  }}
                />
                <button
                  onClick={() => {
                    setJoinError("");
                    socket.emit("room:join", { roomId, password });
                  }}
                  style={{
                    padding: "8px 12px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                  }}
                  disabled={pendingJoin}
                >
                  Повторить
                </button>
              </div>
            </div>
          ) : null}
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={leaveRoom}
            style={{
              padding: "8px 12px",
              borderRadius: "8px",
              border: "1px solid #cbd5e1",
            }}
          >
            Выйти
          </button>
          {room?.hostId === socket.id && room?.status === "waiting" ? (
            <button
              onClick={startGame}
              style={{
                padding: "8px 12px",
                borderRadius: "8px",
                background: "#16a34a",
                color: "white",
                border: "none",
              }}
            >
              Старт
            </button>
          ) : null}
        </div>
      </header>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 1fr",
          gap: "16px",
          alignItems: "start",
        }}
      >
        <div
          style={{
            border: "1px solid #e2e8f0",
            borderRadius: "12px",
            background: "#fff",
            padding: "12px",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          <div>
            <h2 style={{ margin: "0 0 4px 0" }}>Вопрос</h2>
            <p style={{ margin: 0, fontSize: "18px" }}>
              {room?.currentQuestion || "Ожидаем начала игры"}
            </p>
          </div>

          <div>
            <h3 style={{ margin: "0 0 8px 0" }}>{isPlaying ? "Ваши карты" : "Карты раунда"}</h3>
            {isPlaying && room ? (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: "12px",
                }}
              >
                {room.hand.map((card) => (
                  <button
                    key={card.id}
                    onClick={() => playCard(card)}
                    disabled={Boolean(you?.hasPlayed)}
                    style={{
                      textAlign: "left",
                      border: "1px solid #e2e8f0",
                      borderRadius: "8px",
                      padding: 0,
                      overflow: "hidden",
                      background: "#fff",
                    }}
                  >
                    {card.imageUrl ? (
                      <Image
                        src={card.imageUrl}
                        alt={card.label}
                        width={320}
                        height={200}
                        style={{ width: "100%", height: "auto", display: "block" }}
                      />
                    ) : null}
                    <div style={{ padding: "8px" }}>
                      <strong>{card.label}</strong>
                    </div>
                  </button>
                ))}
                {room.hand.length === 0 ? <p>Карты придут при старте.</p> : null}
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                  gap: "12px",
                }}
              >
                {room?.submissions.map((submission) => (
                  <div
                    key={submission.playerId}
                    style={{
                      border: "1px solid #e2e8f0",
                      borderRadius: "8px",
                      overflow: "hidden",
                      background: submission.isYours ? "#eef2ff" : "#fff",
                    }}
                  >
                    {submission.card.imageUrl ? (
                      <Image
                        src={submission.card.imageUrl}
                        alt={submission.card.label}
                        width={320}
                        height={200}
                        style={{ width: "100%", height: "auto", display: "block" }}
                      />
                    ) : null}
                    <div style={{ padding: "8px", display: "grid", gap: "4px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <strong>{submission.playerName}</strong>
                        <span>{submission.votes} голосов</span>
                      </div>
                      {room?.status === "voting" && submission.playerId !== socket.id ? (
                        <button
                          onClick={() => voteFor(submission.playerId)}
                          style={{
                            padding: "8px",
                            borderRadius: "6px",
                            border: "1px solid #cbd5e1",
                            background: "#f8fafc",
                          }}
                        >
                          Голосовать
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
                {room?.submissions.length === 0 ? (
                  <p style={{ margin: 0 }}>Карт пока нет — ждём игроков.</p>
                ) : null}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {room?.hostId === socket.id && room?.status === "waiting" ? (
            <div
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: "12px",
                background: "#fff",
                padding: "12px",
              }}
            >
              <h3 style={{ marginTop: 0 }}>Настройки вопросов (хост)</h3>
              <form
                onSubmit={saveSettings}
                style={{ display: "flex", flexDirection: "column", gap: "8px" }}
              >
                <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  Кол-во вопросов
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={questionTotal}
                    onChange={(event) => setQuestionTotal(Number(event.target.value))}
                    style={{
                      padding: "8px",
                      borderRadius: "6px",
                      border: "1px solid #cbd5e1",
                    }}
                  />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  Свои вопросы (по одному в строке, пусто — дефолт)
                  <textarea
                    value={questionList}
                    onChange={(event) => setQuestionList(event.target.value)}
                    rows={6}
                    style={{
                      padding: "8px",
                      borderRadius: "6px",
                      border: "1px solid #cbd5e1",
                      resize: "vertical",
                    }}
                  />
                </label>
                <button
                  type="submit"
                  style={{
                    padding: "8px 12px",
                    borderRadius: "8px",
                    background: "#111827",
                    color: "white",
                    border: "none",
                    width: "fit-content",
                  }}
                >
                  Сохранить
                </button>
              </form>
            </div>
          ) : null}

          <div
            style={{
              border: "1px solid #e2e8f0",
              borderRadius: "12px",
              background: "#fff",
              padding: "12px",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}
          >
            <h3 style={{ marginTop: 0 }}>Чат комнаты</h3>
            <div
              style={{
                height: "320px",
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
              }}
              ref={chatRef}
            >
              {chat.map((msg) => (
                <div key={msg.id} style={{ background: "#f8fafc", padding: "6px 8px" }}>
                  <strong>{msg.from}: </strong>
                  <span>{msg.body}</span>
                </div>
              ))}
              {chat.length === 0 ? <p style={{ margin: 0 }}>Сообщений нет.</p> : null}
            </div>
            <form
              onSubmit={sendChat}
              style={{ display: "flex", gap: "8px", marginTop: "4px" }}
            >
              <input
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Сообщение"
                style={{
                  flex: 1,
                  padding: "8px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                }}
              />
              <button
                type="submit"
                style={{
                  padding: "8px 12px",
                  borderRadius: "8px",
                  background: "#111827",
                  color: "white",
                  border: "none",
                }}
              >
                Отправить
              </button>
            </form>
          </div>

          <div
            style={{
              border: "1px solid #e2e8f0",
              borderRadius: "12px",
              background: "#fff",
              padding: "12px",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}
          >
            <h3 style={{ margin: 0 }}>Игроки</h3>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: "10px",
              }}
            >
              {room?.players.map((player) => (
                <div
                  key={player.id}
                  style={{
                    border: "1px solid #e2e8f0",
                    borderRadius: "8px",
                    padding: "8px",
                    background: "#f8fafc",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <strong>{player.name}</strong>
                    <span>{player.score} очк.</span>
                  </div>
                  <small>
                    {player.isHost ? "Хост · " : ""}
                    {player.hasPlayed ? "Карту положил" : "Выбирает карту"}
                  </small>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
