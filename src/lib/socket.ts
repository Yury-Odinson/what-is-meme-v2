"use client";

import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io({
      path: "/socket.io",
      autoConnect: false,
    });
  }
  return socket;
}

export function ensureSocketConnection(): Socket {
  const instance = getSocket();
  if (!instance.connected) {
    instance.connect();
  }
  return instance;
}
