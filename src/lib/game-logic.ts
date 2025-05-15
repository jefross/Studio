
import type { KeyCardSetup, CardType, RevealedState, KeyCardEntry } from '@/types';
import { WORD_LIST } from './words';
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

export function selectRandomWords(count: number): string[] {
  const shuffledWords = shuffleArray(WORD_LIST);
  return shuffledWords.slice(0, count);
}

export function generateKeyCardSetup(): KeyCardSetup {
  const setup: KeyCardEntry[] = [];
  const typesDistribution: Array<{ human: CardType, ai: CardType, count: number }> = [
    { human: 'GREEN', ai: 'GREEN', count: 3 },
    { human: 'GREEN', ai: 'BYSTANDER', count: 5 },
    { human: 'BYSTANDER', ai: 'GREEN', count: 5 },
    { human: 'ASSASSIN', ai: 'ASSASSIN', count: 1 },
    { human: 'ASSASSIN', ai: 'GREEN', count: 1 },
    { human: 'GREEN', ai: 'ASSASSIN', count: 1 },
    { human: 'ASSASSIN', ai: 'BYSTANDER', count: 1 },
    { human: 'BYSTANDER', ai: 'ASSASSIN', count: 1 },
    { human: 'BYSTANDER', ai: 'BYSTANDER', count: 7 },
  ];

  const assignments: KeyCardEntry[] = [];
  typesDistribution.forEach(typeDist => {
    for (let i = 0; i < typeDist.count; i++) {
      assignments.push({ human: typeDist.human, ai: typeDist.ai });
    }
  });

  return shuffleArray(assignments);
}

export function initializeGameState() {
  const gridWords = selectRandomWords(TOTAL_WORDS_IN_GRID);
  const keyCardSetup = generateKeyCardSetup();
  const revealedStates: RevealedState[] = Array(TOTAL_WORDS_IN_GRID).fill('hidden');

  let humanGreens = 0;
  let aiGreens = 0;
  keyCardSetup.forEach(entry => {
    if(entry.human === 'GREEN') humanGreens++;
    if(entry.ai === 'GREEN') aiGreens++;
  });
  
  return {
    gridWords,
    keyCardSetup,
    revealedStates,
    timerTokens: INITIAL_TIMER_TOKENS,
    currentTurn: 'ai_clue' as const, // AI gives the first clue
    activeClue: null,
    guessesMadeForClue: 0,
    gameOver: false,
    gameMessage: "AI's turn to give a clue.",
    humanGreensLeft: humanGreens, // this is total P1 sees as green initially
    aiGreensLeft: aiGreens, // this is total P2 sees as green initially
    totalGreensFound: 0,
    isAIClueLoading: false,
  };
}

export function countRemainingGreens(
  keyCardPerspective: CardType[],
  revealedStates: RevealedState[]
): number {
  let count = 0;
  for (let i = 0; i < TOTAL_WORDS_IN_GRID; i++) {
    if (keyCardPerspective[i] === 'GREEN' && revealedStates[i] !== 'green') {
      count++;
    }
  }
  return count;
}

export function getPerspective(keyCardSetup: KeyCardSetup, player: 'human' | 'ai'): CardType[] {
    return keyCardSetup.map(kce => kce[player]);
}
