"use client";

import { useEffect, useState } from "react";
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
    <main style={{ display: "grid", gap: "18px" }}>
      <header style={{ display: "flex", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ margin: 0 }}>Лобби</h1>
          <p style={{ margin: "6px 0 0" }}>Игрок: {playerName}</p>
        </div>
        <button
          onClick={() => router.push("/")}
          style={{
            padding: "8px 12px",
            borderRadius: "8px",
            border: "1px solid #cbd5e1",
          }}
        >
          Сменить имя
        </button>
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
            padding: "12px",
            border: "1px solid #e2e8f0",
            borderRadius: "12px",
            background: "#fff",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "12px",
            }}
          >
            <h2 style={{ margin: 0 }}>Комнаты</h2>
            <small>Всего: {rooms.length}</small>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {rooms.map((room) => (
              <div
                key={room.id}
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  padding: "10px",
                  background: "#f8fafc",
                }}
              >
                <div
                  style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <strong>{room.name}</strong>
                    <small>
                      Игроков: {room.playerCount} · Вопросов: {room.questionTotal} · Статус:{" "}
                      {room.status}
                    </small>
                    {room.requiresPassword ? (
                      <input
                        type="password"
                        placeholder="Пароль"
                        value={passwords[room.id] || ""}
                        onChange={(event) =>
                          setPasswords((prev) => ({
                            ...prev,
                            [room.id]: event.target.value,
                          }))
                        }
                        style={{
                          padding: "8px",
                          borderRadius: "6px",
                          border: "1px solid #cbd5e1",
                        }}
                      />
                    ) : null}
                  </div>
                  <button
                    onClick={() => joinRoom(room)}
                    style={{
                      padding: "8px 10px",
                      borderRadius: "8px",
                      background: "#111827",
                      color: "white",
                      border: "none",
                      height: "fit-content",
                    }}
                  >
                    Присоединиться
                  </button>
                </div>
              </div>
            ))}
            {rooms.length === 0 ? (
              <p style={{ margin: 0 }}>Комнат пока нет — создайте первую.</p>
            ) : null}
          </div>
        </div>

        <div
          style={{
            padding: "12px",
            border: "1px solid #e2e8f0",
            borderRadius: "12px",
            background: "#fff",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          <h2 style={{ margin: 0 }}>Создать комнату</h2>
          <form
            onSubmit={createRoom}
            style={{ display: "flex", flexDirection: "column", gap: "10px" }}
          >
            <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              Название
              <input
                value={roomName}
                onChange={(event) => setRoomName(event.target.value)}
                required
                maxLength={48}
                style={{
                  padding: "8px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                }}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              Пароль (опционально)
              <input
                value={roomPassword}
                onChange={(event) => setRoomPassword(event.target.value)}
                maxLength={64}
                style={{
                  padding: "8px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                }}
              />
            </label>
            {error ? <div style={{ color: "red" }}>{error}</div> : null}
            <button
              type="submit"
              style={{
                padding: "10px 12px",
                borderRadius: "8px",
                background: "#16a34a",
                color: "white",
                border: "none",
              }}
            >
              Создать
            </button>
          </form>
        </div>
      </section>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 1fr",
          gap: "16px",
        }}
      >
        <div
          style={{
            border: "1px solid #e2e8f0",
            borderRadius: "12px",
            background: "#fff",
            padding: "12px",
          }}
        >
          <h3 style={{ marginTop: 0 }}>Чат лобби</h3>
          <div
            style={{
              maxHeight: "240px",
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            {chat.map((msg) => (
              <div key={msg.id} style={{ padding: "6px 8px", background: "#f8fafc" }}>
                <strong>{msg.from}: </strong>
                <span>{msg.body}</span>
              </div>
            ))}
            {chat.length === 0 ? <p style={{ margin: 0 }}>Сообщений нет.</p> : null}
          </div>
          <form
            onSubmit={sendMessage}
            style={{
              display: "flex",
              gap: "8px",
              marginTop: "10px",
            }}
          >
            <input
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Сообщение"
              maxLength={200}
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
          }}
        >
          <h3 style={{ marginTop: 0 }}>Памятка</h3>
          <ul style={{ margin: 0, paddingLeft: "20px", lineHeight: 1.6 }}>
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
