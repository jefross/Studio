export type CardType = 'GREEN' | 'ASSASSIN' | 'BYSTANDER';

export interface KeyCardEntry {
  human: CardType;
  ai: CardType;
}

export type KeyCardSetup = KeyCardEntry[];

export interface WordCardData {
  word: string;
  id: number; // index in the grid
  revealedState: RevealedState;
  keyCardEntry: KeyCardEntry;
}

export type RevealedState =
  | 'hidden'
  | 'green' // Correctly guessed green agent
  | 'bystander_human_turn' // Bystander revealed by human during their guessing turn
  | 'bystander_ai_turn' // Bystander revealed by AI during its guessing turn
  | 'assassin'; // Assassin revealed

export interface Clue {
  word: string;
  count: number;
}

export type PlayerTurn = 'human_clue' | 'ai_clue'; // Indicates who is giving the clue
export type GuesserType = 'human' | 'ai';

import type { WordTheme } from '@/lib/words';

export interface GameState {
  gridWords: string[];
  keyCardSetup: KeyCardSetup;
  revealedStates: RevealedState[];
  timerTokens: number;
  currentTurn: PlayerTurn;
  activeClue: Clue | null;
  guessesMadeForClue: number;
  gameOver: boolean;
  gameMessage: string;
  humanGreensLeft: number; // Visual counter for UI, actual remaining calculated on the fly
  aiGreensLeft: number; // Visual counter for UI
  totalGreensFound: number;
  isAIClueLoading: boolean;
  isAIGuessing: boolean;
  humanClueGuessingConcluded: boolean; // True if human's guessing for current AI clue is over
  inSuddenDeath: boolean;
  suddenDeathGuesser: GuesserType | null; // Who is currently guessing in sudden death
  theme: WordTheme; // Current theme of the word list
}

export const TOTAL_WORDS_IN_GRID = 25;
export const INITIAL_TIMER_TOKENS = 9;
export const TOTAL_UNIQUE_GREEN_AGENTS = 15;
