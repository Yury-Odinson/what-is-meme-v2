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
  const [questionTotal, setQuestionTotal] = useState(50);
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
        setQuestionTotal(state.questionTotal || 50);
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
      questionTotal
    });
  };

  const you = room?.players.find((p) => p.id === socket.id);
  const isPlaying = room?.status === "playing";
  const isVoting = room?.status === "voting";
  const isFinished = room?.status === "finished";
  const statusText =
    room?.status === "waiting"
      ? "Ожидание старта"
      : isPlaying
        ? "Ход: выкладываем мем"
        : isVoting
          ? "Голосование"
          : "Игра завершена";

  const questionNumber =
    room && room.currentQuestionIndex >= 0
      ? Math.min(room.currentQuestionIndex + 1, room.questionTotal || 0)
      : 0;
  const sortedPlayers = room
    ? [...room.players].sort((a, b) => b.score - a.score)
    : [];

  return (
    <main className="page">
      <header className="header">
        <div className="stack-tight">
          <h1 className="header-title">{room?.name || "Комната"}</h1>
          <p className="header-sub">Игрок: {profile.name}</p>
          <p className="header-sub">
            Статус: {statusText} · Вопрос {questionNumber} из {room?.questionTotal ?? "—"}
          </p>
          {isPlaying ? (
            <p className="status-text">До конца хода: {formatCountdown(room.turnEndsAt, now)}</p>
          ) : null}
          {isVoting ? (
            <p className="status-text">
              До конца голосования: {formatCountdown(room.voteEndsAt, now)}
            </p>
          ) : null}
          {joinError ? (
            <div className="error-box">
              {joinError}
              <div className="inline-group mt-6">
                <input
                  type="password"
                  className="input"
                  value={password}
                  placeholder="Пароль комнаты"
                  onChange={(event) => {
                    setPassword(event.target.value);
                    passwordRef.current = event.target.value;
                  }}
                />
                <button
                  className="btn"
                  onClick={() => {
                    setJoinError("");
                    socket.emit("room:join", { roomId, password });
                  }}
                  disabled={pendingJoin}
                >
                  Повторить
                </button>
              </div>
            </div>
          ) : null}
        </div>
        <div className="inline-group">
          <button className="btn" onClick={leaveRoom}>
            Выйти
          </button>
          {room?.hostId === socket.id && (room?.status === "waiting" || isFinished) ? (
            <button className="btn btn-success" onClick={startGame}>
              {isFinished ? "Играть снова" : "Старт"}
            </button>
          ) : null}
        </div>
      </header>

      <section className="grid-two">
        <div className="section stack">
          {isFinished ? (
            <div className="stack">
              <h2 className="section-title">Игра завершена</h2>
              <div className="players-grid">
                {sortedPlayers.map((player) => (
                  <div key={player.id} className="player-card">
                    <div className="row">
                      <strong>{player.name}</strong>
                      <span>{player.score} очк.</span>
                    </div>
                    <small>{player.isHost ? "Хост" : "Игрок"}</small>
                  </div>
                ))}
              </div>
              {room?.hostId === socket.id ? (
                <p className="status-text">Хост может начать новую игру.</p>
              ) : null}
            </div>
          ) : (
            <>
              <div>
                <p className="question-text">
                  {room?.currentQuestion || "Ожидаем начала игры"}
                </p>
              </div>

              <div>
                <h3 className="section-title">{isPlaying ? "Ваши карты" : "Карты раунда"}</h3>
                {isPlaying && room ? (
                  <div className="cards-grid">
                    {room.hand.map((card) => (
                      <button
                        key={card.id}
                        onClick={() => playCard(card)}
                        disabled={Boolean(you?.hasPlayed)}
                        className="card-button"
                      >
                        {card.imageUrl ? (
                          <Image
                            src={card.imageUrl}
                            alt={card.label}
                            width={320}
                            height={200}
                            className="img-fluid"
                          />
                        ) : null}
                        <div className="card-content">
                          <strong>{card.label}</strong>
                        </div>
                      </button>
                    ))}
                    {room.hand.length === 0 ? <p>Карты придут при старте.</p> : null}
                  </div>
                ) : (
                  <div className="submissions-grid">
                    {room?.submissions.map((submission) => (
                      <div
                        key={submission.playerId}
                        className={`submission-card${submission.isYours ? " submission-card--mine" : ""}`}
                      >
                        {submission.card.imageUrl ? (
                          <Image
                            src={submission.card.imageUrl}
                            alt={submission.card.label}
                            width={320}
                            height={200}
                            className="img-fluid"
                          />
                        ) : null}
                        <div className="submission-body">
                          <div className="row">
                            <strong>{submission.playerName}</strong>
                            <span>{submission.votes} голосов</span>
                          </div>
                          {room?.status === "voting" && submission.playerId !== socket.id ? (
                            <button className="btn" onClick={() => voteFor(submission.playerId)}>
                              Голосовать
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                    {room?.submissions.length === 0 ? (
                      <p>Карт пока нет — ждём игроков.</p>
                    ) : null}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="stack">
          {room?.hostId === socket.id && room?.status === "waiting" ? (
            <div className="section stack">
              <h3 className="section-title">Настройки вопросов (хост)</h3>
              <form className="form" onSubmit={saveSettings}>
                <label className="field">
                  Кол-во вопросов
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={questionTotal}
                    onChange={(event) => setQuestionTotal(Number(event.target.value))}
                    className="input"
                  />
                </label>
                <button className="btn btn-primary" type="submit">
                  Сохранить
                </button>
              </form>
            </div>
          ) : null}

          <div className="section stack">
            <h3 className="section-title">Чат комнаты</h3>
            <div className="chat chat-tall" ref={chatRef}>
              {chat.map((msg) => (
                <div
                  key={msg.id}
                  className={`chat-message${msg.from === profile.name ? " chat-message--own" : ""}`}
                >
                  <strong>{msg.from}: </strong>
                  <span>{msg.body}</span>
                </div>
              ))}
              {chat.length === 0 ? <p className="room-list-note">Сообщений нет.</p> : null}
            </div>
            <form className="chat-form" onSubmit={sendChat}>
              <input
                className="input flex-1"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Сообщение"
              />
              <button className="btn btn-primary" type="submit">
                Отправить
              </button>
            </form>
          </div>

          <div className="section stack">
            <h3 className="section-title">Игроки</h3>
            <div className="players-grid">
              {room?.players.map((player) => (
                <div key={player.id} className="player-card">
                  <div className="row">
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
