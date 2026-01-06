export type RoomStatus = "waiting" | "playing" | "voting" | "finished";

export type LobbyRoom = {
  id: string;
  name: string;
  playerCount: number;
  status: RoomStatus;
  requiresPassword: boolean;
  questionTotal: number;
};

export type ChatMessage = {
  id: string;
  from: string;
  body: string;
  ts: number;
};

export type Card = {
  id: string;
  label: string;
  imageUrl?: string;
};

export type Submission = {
  playerId: string;
  playerName: string;
  card: Card;
  votes: number;
  isYours: boolean;
};

export type RoomPlayer = {
  id: string;
  name: string;
  score: number;
  isHost: boolean;
  hasPlayed: boolean;
};

export type RoomState = {
  id: string;
  name: string;
  status: RoomStatus;
  hostId: string | null;
  currentQuestionIndex: number;
  questionTotal: number;
  questions: string[];
  currentQuestion: string | null;
  turnEndsAt: number | null;
  voteEndsAt: number | null;
  deckRemaining: number;
  isGame: boolean;
  players: RoomPlayer[];
  submissions: Submission[];
  hand: Card[];
  chat: ChatMessage[];
};
