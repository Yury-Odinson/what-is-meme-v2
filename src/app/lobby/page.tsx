"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ensureSocketConnection, getSocket } from "@/lib/socket";
import { loadPlayerProfile } from "@/lib/playerStorage";
import type { ChatMessage, LobbyRoom } from "@/types/game";

export default function LobbyPage() {
  const router = useRouter();
  const [rooms, setRooms] = useState<LobbyRoom[]>([]);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [message, setMessage] = useState("");
  const [roomName, setRoomName] = useState("Новая комната");
  const [roomPassword, setRoomPassword] = useState("");
  const [passwords, setPasswords] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [mounted, setMounted] = useState(false);
  const chatRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const profile = loadPlayerProfile();
    if (profile.name) setPlayerName(profile.name);
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (!playerName) {
      router.push("/");
      return;
    }

    const socket = ensureSocketConnection();

    const handleConnect = () => {
      socket.emit("player:register", { name: playerName });
      socket.emit("lobby:requestRooms");
    };

    handleConnect();
    socket.on("connect", handleConnect);
    socket.on("lobby:state", (payload: LobbyRoom[]) => setRooms(payload));
    socket.on("lobby:chat", (payload: ChatMessage) =>
      setChat((prev) => [...prev.slice(-40), payload])
    );
    socket.on("room:joined", ({ roomId }) => {
      router.push(`/room/${roomId}`);
    });
    socket.on("room:error", ({ message: errMsg }: { message: string }) => {
      setError(errMsg || "Ошибка");
    });

    return () => {
      socket.off("connect", handleConnect);
      socket.off("lobby:state");
      socket.off("lobby:chat");
      socket.off("room:joined");
      socket.off("room:error");
    };
  }, [playerName, router, mounted]);

  useEffect(() => {
    const el = chatRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [chat]);

  const createRoom = (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    const socket = getSocket();
    socket.emit("lobby:createRoom", {
      name: roomName,
      password: roomPassword || "",
    });
  };

  const joinRoom = (room: LobbyRoom) => {
    setError("");
    const socket = getSocket();
    socket.emit("room:join", {
      roomId: room.id,
      password: passwords[room.id] || "",
    });
  };

  const sendMessage = (event: React.FormEvent) => {
    event.preventDefault();
    if (!message.trim()) return;
    const socket = getSocket();
    socket.emit("lobby:chat", { message });
    setMessage("");
  };

  if (!mounted) return null;

  return (
    <main className="page">
      <header className="header">
        <div>
          <h1 className="header-title">Лобби</h1>
          <p className="header-sub">Игрок: {playerName}</p>
        </div>
        <button className="btn" onClick={() => router.push("/")}>
          Сменить имя
        </button>
      </header>

      <section className="grid-two">
        <div className="section">
          <div className="section-header">
            <h2 className="section-title">Комнаты</h2>
            <small className="section-meta">Всего: {rooms.length}</small>
          </div>
          <div className="rooms-list">
            {rooms.map((room) => (
              <div key={room.id} className="room-card">
                <div className="room-card__meta">
                  <strong>{room.name}</strong>
                  <small>
                    Игроков: {room.playerCount} · Вопросов: {room.questionTotal} · Статус:{" "}
                    {room.status}
                  </small>
                  {room.requiresPassword ? (
                    <input
                      type="password"
                      className="input"
                      placeholder="Пароль"
                      value={passwords[room.id] || ""}
                      onChange={(event) =>
                        setPasswords((prev) => ({
                          ...prev,
                          [room.id]: event.target.value,
                        }))
                      }
                    />
                  ) : null}
                </div>
                <button className="btn btn-primary" onClick={() => joinRoom(room)}>
                  Присоединиться
                </button>
              </div>
            ))}
            {rooms.length === 0 ? (
              <p className="room-list-note">Комнат пока нет — создайте первую.</p>
            ) : null}
          </div>
        </div>

        <div className="section stack">
          <h2 className="section-title">Создать комнату</h2>
          <form className="form" onSubmit={createRoom}>
            <label className="field">
              Название
              <input
                className="input"
                value={roomName}
                onChange={(event) => setRoomName(event.target.value)}
                required
                maxLength={48}
              />
            </label>
            <label className="field">
              Пароль (опционально)
              <input
                className="input"
                value={roomPassword}
                onChange={(event) => setRoomPassword(event.target.value)}
                maxLength={64}
              />
            </label>
            {error ? <div className="error-box">{error}</div> : null}
            <button className="btn btn-success" type="submit">
              Создать
            </button>
          </form>
        </div>
      </section>

      <section className="grid-two">
        <div className="section">
          <h3 className="section-title">Чат лобби</h3>
          <div className="chat chat--short" ref={chatRef}>
            {chat.map((msg) => (
              <div
                key={msg.id}
                className={`chat-message${msg.from === playerName ? " chat-message--own" : ""}`}
              >
                <strong>{msg.from}: </strong>
                <span>{msg.body}</span>
              </div>
            ))}
            {chat.length === 0 ? <p className="room-list-note">Сообщений нет.</p> : null}
          </div>
          <form className="chat-form" onSubmit={sendMessage}>
            <input
              className="input flex-1"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Сообщение"
              maxLength={200}
            />
            <button className="btn btn-primary" type="submit">
              Отправить
            </button>
          </form>
        </div>

        <div className="section">
          <h3 className="section-title">Памятка</h3>
          <ul className="list-plain">
            <li>Создайте комнату и зайдите внутрь, чтобы настроить вопросы.</li>
            <li>Можно поставить пароль на комнату.</li>
            <li>Игру может стартовать только хост комнаты.</li>
            <li>Карточки мемов замените своими в серверном списке.</li>
          </ul>
        </div>
      </section>
    </main>
  );
}
