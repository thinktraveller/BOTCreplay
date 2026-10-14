import type { Alignment } from '../domain/contracts.js';

// Read-only export view model; role rules and effect application are supplied by the domain layer in M1.
export interface PresentedPlayer { playerId: string; seat: number; nickname: string; identity: string; alignment: Alignment; alive: boolean }
export interface PresentedEvent {
  eventId: string;
  phaseId: string;
  subject: string;
  subjectParts?: { text: string; alignment?: Alignment; playerId?: string }[];
  alignment: Alignment;
  text: string;
  details: string;
  iconAssetId?: string;
  players: PresentedPlayer[];
  // Shared timeline/HTML/PNG data refer to the same recorded result; no second application.
  roleChangeResultIds?: string[];
  playersAfter?: PresentedPlayer[];
}
export interface ReplayPresentation {
  replayId: string;
  revision: number;
  title: string;
  phases: { phaseId: string; label: string }[];
  events: PresentedEvent[];
  // The local view may use a same-origin cached image; export replaces it with embedded data.
  assets: Record<string, { dataUrl?: string; localUrl?: string; label: string }>;
}
