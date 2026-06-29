export type Language = "en" | "hu" | "de" | "es" | "fr" | "it" | "pl" | "pt-BR";

export const LANGUAGES: { code: Language; label: string; flag: string }[] = [
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "hu", label: "Magyar", flag: "🇭🇺" },
  { code: "de", label: "Deutsch", flag: "🇩🇪" },
  { code: "es", label: "Español", flag: "🇪🇸" },
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "it", label: "Italiano", flag: "🇮🇹" },
  { code: "pl", label: "Polski", flag: "🇵🇱" },
  { code: "pt-BR", label: "Português (Brasil)", flag: "🇧🇷" },
];

export type Friend = {
  id: string;
  username: string;
  avatar: string;
  online: boolean;
};

export const FRIENDS: Friend[] = [
  { id: "1", username: "leo.k", avatar: "🦊", online: true },
  { id: "2", username: "mia_v", avatar: "🐰", online: true },
  { id: "3", username: "jules", avatar: "🐼", online: false },
  { id: "4", username: "nora.x", avatar: "🦋", online: true },
  { id: "5", username: "theo", avatar: "🐸", online: false },
  { id: "6", username: "ava.r", avatar: "🌸", online: true },
  { id: "7", username: "kai", avatar: "🐺", online: false },
  { id: "8", username: "zoe.s", avatar: "🌙", online: true },
];

export type Question = {
  id: string;
  from: Friend;
  text: string;
  receivedAt: string;
  status: "waiting" | "answered";
  gifThumb?: string;
};

export const QUESTIONS: Question[] = [
  {
    id: "q1",
    from: FRIENDS[0],
    text: "What are you doing right now?",
    receivedAt: "2m",
    status: "waiting",
  },
  {
    id: "q2",
    from: FRIENDS[1],
    text: "Are you coming tonight?",
    receivedAt: "12m",
    status: "waiting",
  },
  {
    id: "q3",
    from: FRIENDS[3],
    text: "How was your exam?",
    receivedAt: "1h",
    status: "answered",
    gifThumb: "🎉",
  },
  {
    id: "q4",
    from: FRIENDS[5],
    text: "Where are you?",
    receivedAt: "3h",
    status: "answered",
    gifThumb: "🤷",
  },
  {
    id: "q5",
    from: FRIENDS[7],
    text: "Coffee in 10?",
    receivedAt: "5h",
    status: "answered",
    gifThumb: "☕",
  },
];

export const RECENT_ANSWERS = [
  { id: "a1", to: FRIENDS[2], emoji: "😂", category: "Funny", time: "20m" },
  { id: "a2", to: FRIENDS[4], emoji: "✅", category: "Yes", time: "1h" },
  { id: "a3", to: FRIENDS[6], emoji: "🥱", category: "Tired", time: "4h" },
  { id: "a4", to: FRIENDS[0], emoji: "🎊", category: "Celebration", time: "1d" },
];

export const GIF_CATEGORIES = [
  { key: "funny", label: "Funny", emoji: "😂" },
  { key: "yes", label: "Yes", emoji: "👍" },
  { key: "no", label: "No", emoji: "👎" },
  { key: "celebration", label: "Celebration", emoji: "🎉" },
  { key: "wtf", label: "WTF", emoji: "😳" },
  { key: "tired", label: "Tired", emoji: "😴" },
  { key: "other", label: "Other", emoji: "✨" },
] as const;

export type GifItem = { id: string; emoji: string; category: string; date: string };

export const GIFS: GifItem[] = [
  { id: "g1", emoji: "😂", category: "funny", date: "Today" },
  { id: "g2", emoji: "🤣", category: "funny", date: "Today" },
  { id: "g3", emoji: "✅", category: "yes", date: "Yesterday" },
  { id: "g4", emoji: "❌", category: "no", date: "Yesterday" },
  { id: "g5", emoji: "🎉", category: "celebration", date: "2d" },
  { id: "g6", emoji: "🎊", category: "celebration", date: "2d" },
  { id: "g7", emoji: "🤯", category: "wtf", date: "3d" },
  { id: "g8", emoji: "🥱", category: "tired", date: "3d" },
  { id: "g9", emoji: "😴", category: "tired", date: "4d" },
  { id: "g10", emoji: "✨", category: "other", date: "5d" },
  { id: "g11", emoji: "🔥", category: "other", date: "5d" },
  { id: "g12", emoji: "💀", category: "funny", date: "1w" },
];

export const QUESTION_SUGGESTIONS = [
  "What are you doing?",
  "Where are you?",
  "Are you coming tonight?",
  "How was your exam?",
  "Lunch?",
  "What's the vibe?",
];

export const PROFILE = {
  username: "you.sec",
  avatar: "🌶️",
  bio: "Answering life in 5 seconds.",
  email: "you@sec.app",
  totalGifs: GIFS.length,
  questionsAsked: 42,
  questionsAnswered: 87,
};
