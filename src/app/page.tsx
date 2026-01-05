"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loadPlayerProfile, savePlayerProfile } from "@/lib/playerStorage";

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const profile = loadPlayerProfile();
    if (profile.name) setName(profile.name);
    setReady(true);
  }, []);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    savePlayerProfile({ name: name.trim() });
    router.push("/lobby");
  };

  if (!ready) return null;

  return (
    <main>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          maxWidth: "460px",
        }}
      >
        <h1 style={{ margin: 0 }}>What is Meme</h1>
        <p style={{ margin: 0, lineHeight: 1.6 }}>
          Введите имя, чтобы попасть в лобби. Имя хранится в куках, регистрация
          не нужна.
        </p>

        <form
          onSubmit={handleSubmit}
          style={{ display: "flex", flexDirection: "column", gap: "8px" }}
        >
          <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <span>Ваше имя</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Например, MemeLord"
              required
              maxLength={32}
              style={{
                padding: "10px 12px",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
              }}
            />
          </label>
          <button
            type="submit"
            style={{
              padding: "10px 12px",
              borderRadius: "8px",
              background: "#111827",
              color: "white",
              border: "none",
            }}
          >
            Войти в лобби
          </button>
        </form>
      </div>
    </main>
  );
}
