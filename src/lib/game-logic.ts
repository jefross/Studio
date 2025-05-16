import type { KeyCardSetup, CardType, RevealedState, KeyCardEntry, GameState, PlayerTurn } from '@/types';
import { getWordList, type WordTheme } from './words';
import { TOTAL_WORDS_IN_GRID, INITIAL_TIMER_TOKENS, TOTAL_UNIQUE_GREEN_AGENTS } from '@/types';

// Fisher-Yates shuffle algorithm
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function selectRandomWords(count: number, theme: WordTheme = 'standard'): string[] {
  const wordList = getWordList(theme);
  const shuffledWords = shuffleArray(wordList);
  return shuffledWords.slice(0, count);
}

export function generateKeyCardSetup(): KeyCardSetup {
  // Distribution ensures specific overlaps for Duet
  const typesDistribution: Array<{ human: CardType, ai: CardType, count: number }> = [
    { human: 'GREEN', ai: 'GREEN', count: 3 },      // 3 Double Agents (Green for both)
    { human: 'GREEN', ai: 'BYSTANDER', count: 5 },  // 5 Human's Agents (Bystander for AI)
    { human: 'BYSTANDER', ai: 'GREEN', count: 5 },  // 5 AI's Agents (Bystander for Human)
    { human: 'ASSASSIN', ai: 'ASSASSIN', count: 1 },// 1 Double Assassin
    { human: 'GREEN', ai: 'ASSASSIN', count: 1 },   // 1 Human's Agent (Assassin for AI)
    { human: 'ASSASSIN', ai: 'GREEN', count: 1 },   // 1 AI's Agent (Assassin for Human)
    { human: 'ASSASSIN', ai: 'BYSTANDER', count: 1 },// 1 Human's Assassin (Bystander for AI)
    { human: 'BYSTANDER', ai: 'ASSASSIN', count: 1 },// 1 AI's Assassin (Bystander for Human)
    { human: 'BYSTANDER', ai: 'BYSTANDER', count: 7 }// 7 Innocent Bystanders
  ]; // Total 25 cards

  const assignments: KeyCardEntry[] = [];
  typesDistribution.forEach(typeDist => {
    for (let i = 0; i < typeDist.count; i++) {
      assignments.push({ human: typeDist.human, ai: typeDist.ai });
    }
  });

  return shuffleArray(assignments);
}

export function initializeGameState(initialTokens: number = INITIAL_TIMER_TOKENS, theme: WordTheme = 'standard'): GameState {
  const gridWords = selectRandomWords(TOTAL_WORDS_IN_GRID, theme);
  const keyCardSetup = generateKeyCardSetup();
  const revealedStates: RevealedState[] = Array(TOTAL_WORDS_IN_GRID).fill('hidden');
  
  return {
    gridWords,
    keyCardSetup,
    revealedStates,
    timerTokens: initialTokens,
    currentTurn: 'ai_clue' as const, // AI gives the first clue
    activeClue: null,
    guessesMadeForClue: 0,
    gameOver: false,
    gameMessage: "AI's turn to give a clue.",
    humanGreensLeft: countRemainingGreens(getPerspective(keyCardSetup, 'human'), revealedStates),
    aiGreensLeft: countRemainingGreens(getPerspective(keyCardSetup, 'ai'), revealedStates),
    totalGreensFound: 0,
    isAIClueLoading: false,
    isAIGuessing: false,
    humanClueGuessingConcluded: false,
    inSuddenDeath: false,
    suddenDeathGuesser: null,
    theme: theme,
  };
}

export function countRemainingGreens(
  keyCardPerspective: CardType[],
  revealedStates: RevealedState[]
): number {
  let count = 0;
  for (let i = 0; i < TOTAL_WORDS_IN_GRID; i++) {
    if (keyCardPerspective[i] === 'GREEN' && revealedStates[i] === 'hidden') { // Only count hidden greens
      count++;
    }
  }
  return count;
}


export function getPerspective(keyCardSetup: KeyCardSetup, player: 'human' | 'ai'): CardType[] {
    return keyCardSetup.map(kce => kce[player]);
}
