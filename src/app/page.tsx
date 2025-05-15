
"use client";

import type React from 'react';
import { useState, useEffect, useCallback } from 'react';
import GameBoard from '@/components/GameBoard';
import ControlsPanel from '@/components/ControlsPanel';
import GameEndModal from '@/components/GameEndModal';
import { initializeGameState, getPerspective, countRemainingGreens } from '@/lib/game-logic';
import type { GameState, WordCardData, Clue, PlayerTurn, CardType, RevealedState } from '@/types';
import { TOTAL_UNIQUE_GREEN_AGENTS } from '@/types';
import { generateClue as generateAIClue } from '@/ai/flows/ai-clue-generator';
import { generateAiGuess } from '@/ai/flows/ai-guess-generator';
import { useToast } from "@/hooks/use-toast";
import { Button } from '@/components/ui/button';
import { RefreshCw, Loader2 } from 'lucide-react';

// Helper to introduce delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface RevealResult {
  turnShouldEnd: boolean;
  useTokenOnTurnEnd: boolean;
  correctGuess: boolean;
  newGameOver: boolean;
  newMessage: string;
}

export default function CodenamesDuetPage() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const { toast } = useToast();

  const resetGame = useCallback(() => {
    setGameState(initializeGameState());
  }, []);

  // Initialize gameState on client-side only to prevent hydration errors
  useEffect(() => {
    resetGame();
  }, [resetGame]);


  const endPlayerTurn = useCallback((useTimerToken: boolean) => {
    setGameState(prev => {
      if (!prev || prev.gameOver) return prev;

      const revealedGreenCountAfterGuess = prev.revealedStates.filter(s => s === 'green').length;
      let gameShouldBeOver = prev.gameOver;
      let finalMessage = prev.gameMessage;

      if (revealedGreenCountAfterGuess === TOTAL_UNIQUE_GREEN_AGENTS) {
        gameShouldBeOver = true;
        finalMessage = 'All 15 agents contacted! You win!';
      } else if (prev.timerTokens - (useTimerToken ? 1 : 0) <= 0 && !gameShouldBeOver) {
        gameShouldBeOver = true;
        finalMessage = 'Out of time! Not all agents were contacted. You lose.';
      }

      if (gameShouldBeOver) {
        return {
            ...prev,
            gameOver: true,
            gameMessage: finalMessage,
            activeClue: null,
            timerTokens: useTimerToken ? Math.max(0, prev.timerTokens - 1) : prev.timerTokens,
            humanClueGuessingConcluded: false,
        };
      }

      const newTimerTokens = useTimerToken ? Math.max(0, prev.timerTokens - 1) : prev.timerTokens;
      const nextTurn = prev.currentTurn === 'human_clue' ? 'ai_clue' : 'human_clue';

      return {
        ...prev,
        currentTurn: nextTurn,
        activeClue: null,
        guessesMadeForClue: 0,
        timerTokens: newTimerTokens,
        gameMessage: `${nextTurn === 'ai_clue' ? "AI's" : "Your"} turn to give a clue.`,
        humanClueGuessingConcluded: false,
      };
    });
  }, [setGameState]);

  const processReveal = useCallback((cardId: number, perspectiveOfGuesser: 'human' | 'ai'): RevealResult => {
    let result: RevealResult = { turnShouldEnd: false, useTokenOnTurnEnd: false, correctGuess: false, newGameOver: false, newMessage: "" };
    setGameState(prev => {
      if (!prev || prev.gameOver || prev.revealedStates[cardId] !== 'hidden') {
          if (prev && prev.revealedStates[cardId] !== 'hidden') {
              result.newMessage = `${prev.gridWords[cardId].toUpperCase()} was already revealed.`;
          } else if (prev && prev.gameOver) {
              result.newMessage = "Game is over.";
          }
          return prev;
      }

      const { activeClue, keyCardSetup, revealedStates: currentRevealedStates, guessesMadeForClue, gridWords } = prev;

      // Card identity is based on CLUE GIVER'S key
      const clueGiverPerspectiveKey = perspectiveOfGuesser === 'human' ? keyCardSetup[cardId].ai : keyCardSetup[cardId].human;
      const clueGiverName = perspectiveOfGuesser === 'human' ? 'the AI' : 'you';
      const guesserName = perspectiveOfGuesser === 'human' ? 'You' : 'The AI';

      const newRevealedStates = [...currentRevealedStates];
      let newGuessesMade = guessesMadeForClue + 1;
      let newHumanClueGuessingConcluded = prev.humanClueGuessingConcluded;

      if (clueGiverPerspectiveKey === 'ASSASSIN') {
        newRevealedStates[cardId] = 'assassin';
        result.newMessage = `${guesserName} hit an ASSASSIN! (${gridWords[cardId].toUpperCase()}) Game Over! This was an assassin for ${clueGiverName} (the clue giver).`;
        result.newGameOver = true;
        result.turnShouldEnd = true;
        if (perspectiveOfGuesser === 'human') newHumanClueGuessingConcluded = true;
      } else if (clueGiverPerspectiveKey === 'GREEN') {
        newRevealedStates[cardId] = 'green';
        result.correctGuess = true;
        result.newMessage = `Correct! ${gridWords[cardId].toUpperCase()} was an agent for ${clueGiverName} (the clue giver).`;

        if (activeClue) {
            const maxGuessesAllowed = activeClue.count === 0 ? (perspectiveOfGuesser === 'human' ? Infinity : 1) : activeClue.count + 1;
            if (newGuessesMade >= maxGuessesAllowed && activeClue.count !==0) {
              result.turnShouldEnd = true;
              result.newMessage += ` Max guesses for this clue reached by ${perspectiveOfGuesser}.`;
              if (perspectiveOfGuesser === 'human') newHumanClueGuessingConcluded = true;
            } else if (activeClue.count === 0 && perspectiveOfGuesser === 'ai') {
                result.turnShouldEnd = true;
                 result.newMessage += ` AI made its one guess for clue '0'.`;
            } else {
              result.newMessage += ` ${perspectiveOfGuesser === 'human' ? 'You' : 'AI'} can make another guess.`;
            }
        }
      } else { // BYSTANDER (on clue giver's key)
        newRevealedStates[cardId] = perspectiveOfGuesser === 'human' ? 'bystander_human_turn' : 'bystander_ai_turn';
        result.newMessage = `Bystander. ${gridWords[cardId].toUpperCase()} was a bystander for ${clueGiverName} (the clue giver). Turn ends for ${perspectiveOfGuesser}.`;
        result.turnShouldEnd = true;
        result.useTokenOnTurnEnd = true;
        if (perspectiveOfGuesser === 'human') newHumanClueGuessingConcluded = true;
      }

      const updatedTotalGreensFound = newRevealedStates.filter(s => s === 'green').length;

      if (!result.newGameOver && updatedTotalGreensFound === TOTAL_UNIQUE_GREEN_AGENTS) {
          result.newGameOver = true;
          result.newMessage = 'All 15 agents contacted! You win!';
          result.turnShouldEnd = true;
          if (perspectiveOfGuesser === 'human') newHumanClueGuessingConcluded = true;
      }

      result.newGameOver = result.newGameOver || prev.gameOver;

      return {
        ...prev,
        revealedStates: newRevealedStates,
        gameOver: result.newGameOver,
        gameMessage: result.newMessage,
        guessesMadeForClue: newGuessesMade,
        totalGreensFound: updatedTotalGreensFound,
        humanClueGuessingConcluded: newHumanClueGuessingConcluded,
        activeClue: result.newGameOver ? null : prev.activeClue,
      };
    });
    return result;
  }, [setGameState]);

  const checkWinOrLossCondition = useCallback(() => {
    if (!gameState || gameState.gameOver) return true; // Exit if no game state or game already over

    const revealedGreenCount = gameState.revealedStates.filter(s => s === 'green').length;

    if (revealedGreenCount === TOTAL_UNIQUE_GREEN_AGENTS) {
      setGameState(prev => prev ? { ...prev, gameOver: true, gameMessage: 'All 15 agents contacted! You win!', activeClue: null } : null);
      return true;
    }
    // Check for timer token loss only if it's not a clue-giving phase (i.e., after guesses are done)
    if (gameState.timerTokens <= 0 && gameState.currentTurn !== 'human_clue' && gameState.currentTurn !== 'ai_clue') {
      setGameState(prev => prev ? { ...prev, gameOver: true, gameMessage: 'Out of time! Not all agents were contacted. You lose.', activeClue: null } : null);
      return true;
    }
    return false;
  }, [gameState, setGameState]);

  useEffect(() => {
    if (gameState && !gameState.isAIClueLoading && !gameState.isAIGuessing) {
        checkWinOrLossCondition();
    }
  }, [gameState, checkWinOrLossCondition]);


  const handleAIClueGeneration = useCallback(async () => {
    if (!gameState) {
      toast({ title: "Game Error", description: "Game state not available.", variant: "destructive" });
      return;
    }
    setGameState(prev => prev ? { ...prev, isAIClueLoading: true, gameMessage: "AI is thinking of a clue..." } : null);

    try {
      const aiPerspectiveKey = getPerspective(gameState.keyCardSetup, 'ai');
      const unrevealedAIGreens = gameState.gridWords.filter((word, i) =>
        aiPerspectiveKey[i] === 'GREEN' && gameState.revealedStates[i] === 'hidden'
      );
      const humanPerspectiveKey = getPerspective(gameState.keyCardSetup, 'human');
      const humanAssassins = gameState.gridWords.filter((word, i) =>
        humanPerspectiveKey[i] === 'ASSASSIN' && gameState.revealedStates[i] === 'hidden'
      );

      if (unrevealedAIGreens.length === 0) {
        toast({ title: "AI Info", description: "AI has no more green words to give clues for. AI passes." });
        setGameState(prev => prev ? {
            ...prev,
            isAIClueLoading: false,
            activeClue: null,
            guessesMadeForClue: 0,
            humanClueGuessingConcluded: false,
        } : null);
        endPlayerTurn(false);
        return;
      }

      const aiClueResponse = await generateAIClue({
        grid: gameState.gridWords,
        greenWords: unrevealedAIGreens,
        assassinWords: humanAssassins,
        timerTokens: gameState.timerTokens,
      });

      setGameState(prev => prev ? {
        ...prev,
        activeClue: { word: aiClueResponse.clueWord, count: aiClueResponse.clueNumber },
        isAIClueLoading: false,
        gameMessage: `AI's Clue: ${aiClueResponse.clueWord.toUpperCase()} for ${aiClueResponse.clueNumber}. Your turn to guess.`,
        guessesMadeForClue: 0,
        humanClueGuessingConcluded: false,
      } : null);
      toast({ title: "AI Clue", description: `${aiClueResponse.clueWord.toUpperCase()} - ${aiClueResponse.clueNumber}. Reasoning: ${aiClueResponse.reasoning || 'N/A'}` });

    } catch (error) {
      console.error("Error generating AI clue:", error);
      toast({ title: "AI Error", description: "Could not generate AI clue.", variant: "destructive" });
      setGameState(prev => prev ? { ...prev, isAIClueLoading: false, humanClueGuessingConcluded: false, gameMessage: "Error getting AI clue. Your turn to give a clue or try AI again." } : null);
    }
  }, [gameState, toast, setGameState, endPlayerTurn]);

  const handleAIGuesses = useCallback(async (clue: Clue) => {
    if (!gameState || gameState.gameOver || gameState.isAIGuessing) {
      toast({ title: "AI Action Blocked", description: "AI cannot guess at this time.", variant: "default" });
      setGameState(prev => prev ? { ...prev, isAIGuessing: false } : null);
      if (gameState && gameState.gameOver && gameState.currentTurn === 'human_clue' && gameState.activeClue) {
         endPlayerTurn(false);
      }
      return;
    }

    setGameState(prevGS => ({
      ...prevGS!,
      isAIGuessing: true,
      gameMessage: `AI is considering guesses for your clue: ${clue.word.toUpperCase()} ${clue.count}...`
    }));

    // Use the gameState from the closure for generating AI prompt.
    const currentGameStateForAIInput = gameState!; // Non-null asserted due to guards above

    const aiPerspectiveKey = getPerspective(currentGameStateForAIInput.keyCardSetup, 'ai');
    const aiUnrevealedGreenWords = currentGameStateForAIInput.gridWords.filter((word: string, i: number) => aiPerspectiveKey[i] === 'GREEN' && currentGameStateForAIInput.revealedStates[i] === 'hidden');
    const aiUnrevealedAssassinWords = currentGameStateForAIInput.gridWords.filter((word: string, i: number) => aiPerspectiveKey[i] === 'ASSASSIN' && currentGameStateForAIInput.revealedStates[i] === 'hidden');
    const revealedWordsList = currentGameStateForAIInput.gridWords.filter((_: string, i: number) => currentGameStateForAIInput.revealedStates[i] !== 'hidden');

    try {
      const aiGuessResponse = await generateAiGuess({
        clueWord: clue.word,
        clueNumber: clue.count,
        gridWords: currentGameStateForAIInput.gridWords,
        aiGreenWords: aiUnrevealedGreenWords,
        aiAssassinWords: aiUnrevealedAssassinWords,
        revealedWords: revealedWordsList,
      });

      toast({title: "AI Analyzing", description: `AI will attempt to guess: ${aiGuessResponse.guessedWords.join(', ') || "Pass"}. Reasoning: ${aiGuessResponse.reasoning || 'N/A'}`});

      if (!aiGuessResponse.guessedWords || aiGuessResponse.guessedWords.length === 0) {
        toast({ title: "AI Action", description: "AI decided to pass this turn." });
        setGameState(prev => prev ? {...prev, gameMessage: "AI passes.", isAIGuessing: false} : null);
        endPlayerTurn(true); // AI passes guess, token used
        return;
      }

      let gameEndedByAI = false;
      let turnEndedForAI = false;
      let tokenUsedForAIsTurn = false;

      for (const guessedWord of aiGuessResponse.guessedWords) {
        // gameState in this closure is from when handleAIGuesses was called.
        // gridWords don't change, so indexOf is fine.
        // processReveal itself will use the latest state for revealedStates check.
        const cardId = currentGameStateForAIInput.gridWords.indexOf(guessedWord);

        if (cardId === -1) {
          toast({ title: "AI Error", description: `AI tried to guess '${guessedWord}', which is not on the board. Skipping.`});
          continue;
        }
        // No need to check if card is hidden here; processReveal will handle it using the latest state.

        await delay(1000);
        const revealResult = processReveal(cardId, 'ai');
        toast({title: `AI Guesses: ${guessedWord.toUpperCase()}`, description: revealResult.newMessage});

        if (revealResult.newGameOver) {
           gameEndedByAI = true;
           break;
        }
        if (revealResult.turnShouldEnd) {
          turnEndedForAI = true;
          tokenUsedForAIsTurn = revealResult.useTokenOnTurnEnd;
          break;
        }
      }

      setGameState(prev => prev ? { ...prev, isAIGuessing: false } : null);

      if (!gameEndedByAI) {
           endPlayerTurn(turnEndedForAI ? tokenUsedForAIsTurn : false);
      }
      // If gameEndedByAI, gameState.gameOver is already true.
      // checkWinOrLossCondition useEffect handles modal, activeClue is cleared by processReveal.

    } catch (error) {
      console.error("Error during AI guessing:", error);
      toast({ title: "AI Error", description: "AI had trouble making a guess. Turn passes.", variant: "destructive" });
      setGameState(prev => prev ? { ...prev, isAIGuessing: false } : null);
      // Check gameState directly before calling endPlayerTurn to avoid issues if already over
      const gs = gameState; // Snapshot current state
      if (gs && !gs.gameOver) {
          endPlayerTurn(true); // Error, token used
      }
    }
  }, [gameState, toast, processReveal, endPlayerTurn, setGameState]);


  const handleHumanClueSubmit = useCallback((clue: Clue) => {
    let shouldCallAIGuesses = false;
    setGameState(prev => {
      if (!prev || prev.gameOver || prev.isAIGuessing || prev.isAIClueLoading) {
        toast({ title: "Action Blocked", description: "Cannot submit clue at this time."});
        return prev;
      }
      shouldCallAIGuesses = true;
      return {
        ...prev,
        activeClue: clue,
        gameMessage: `Your Clue: ${clue.word.toUpperCase()} for ${clue.count}. AI is now 'guessing'.`,
        guessesMadeForClue: 0,
        humanClueGuessingConcluded: false,
      };
    });

    if (shouldCallAIGuesses) {
        // Pass the freshly set clue. The gameState used by handleAIGuesses will be from its closure.
        handleAIGuesses(clue);
    }
  }, [setGameState, handleAIGuesses, toast]); // gameState removed as direct dependency, passed via closure if needed

  const handleCardClick = useCallback(async (id: number) => {
    if (!gameState || gameState.gameOver || !gameState.activeClue || gameState.revealedStates[id] !== 'hidden' || gameState.isAIClueLoading || gameState.isAIGuessing || gameState.humanClueGuessingConcluded) return;
    if (gameState.currentTurn !== 'ai_clue') return;

    const currentGuessesMade = gameState.guessesMadeForClue;
    const clueCount = gameState.activeClue.count;

    // For clue 0, allow 'infinite' guesses until bystander/assassin or voluntary end.
    // For clue > 0, allow clue.count + 1 guesses.
    const maxGuessesThisClue = clueCount === 0 ? Infinity : clueCount + 1;

    if (currentGuessesMade >= maxGuessesThisClue && clueCount !== 0) {
      toast({ title: "Max Guesses", description: "You've reached the maximum guesses for this clue." });
      // Do not set humanClueGuessingConcluded here, let processReveal do it if it's the last valid guess action.
      // Instead, just prevent further clicks.
      return;
    }

    const { newMessage, newGameOver, turnShouldEnd, useTokenOnTurnEnd } = processReveal(id, 'human');
    toast({ title: "Guess Result", description: newMessage });

    // processReveal sets humanClueGuessingConcluded if the turn ends due to the guess.
    // It also sets gameOver and activeClue = null if the game ends.
    // No automatic endPlayerTurn here unless it's game over. Player must click "End Turn" button
    // if humanClueGuessingConcluded is true and game is not over.
  }, [gameState, processReveal, toast, setGameState]); // Removed endPlayerTurn, relying on button

  if (!gameState) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-4 space-y-6">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="text-muted-foreground">Loading game...</p>
      </div>
    );
  }

  const wordCardsData: WordCardData[] = gameState.gridWords.map((word, index) => ({
    word,
    id: index,
    revealedState: gameState.revealedStates[index],
    keyCardEntry: gameState.keyCardSetup[index],
  }));

  // Calculate guesses left for human when AI gave a clue
  const guessesLeftForThisClue = gameState.activeClue && gameState.currentTurn === 'ai_clue' && !gameState.humanClueGuessingConcluded ?
    Math.max(0, (gameState.activeClue.count === 0 ? Infinity : gameState.activeClue.count + 1) - gameState.guessesMadeForClue)
    : 0;

  // Determine if it's currently the human's phase to make guesses
  const isHumanCurrentlyGuessingPhase =
    gameState.currentTurn === 'ai_clue' && // AI gave the clue
    !!gameState.activeClue && // There is an active clue
    !gameState.gameOver && // Game is not over
    !gameState.isAIClueLoading && // AI is not busy loading its own clue
    !gameState.isAIGuessing; // AI is not busy guessing player's clue

  // Cards are clickable if it's human's guessing phase, they haven't concluded guessing for this clue, and they have guesses left
  const isClickableForHuman = isHumanCurrentlyGuessingPhase && !gameState.humanClueGuessingConcluded && guessesLeftForThisClue > 0;

  // Human can voluntarily end guessing if it's their guessing phase and they haven't concluded and have guesses left
  const canHumanVoluntarilyEndGuessing = isHumanCurrentlyGuessingPhase && !gameState.humanClueGuessingConcluded && guessesLeftForThisClue > 0;

  // Human must confirm turn end if their guessing was concluded by game logic (bystander, assassin, max guesses)
  const mustHumanConfirmTurnEnd = isHumanCurrentlyGuessingPhase && gameState.humanClueGuessingConcluded;


  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center p-4 space-y-6">
      <header className="text-center space-y-2 py-4">
        <h1 className="text-4xl font-bold text-primary">Codenames Duet AI</h1>
        <p className="text-muted-foreground">A cooperative word game of secret agents and covert ops.</p>
      </header>

      <ControlsPanel
        currentTurn={gameState.currentTurn}
        timerTokens={gameState.timerTokens}
        activeClue={gameState.activeClue}
        gameMessage={gameState.gameMessage}
        humanGreensLeft={countRemainingGreens(getPerspective(gameState.keyCardSetup, 'human'), gameState.revealedStates)}
        aiGreensLeft={countRemainingGreens(getPerspective(gameState.keyCardSetup, 'ai'), gameState.revealedStates)}
        totalGreensFound={gameState.totalGreensFound}
        isAIClueLoading={gameState.isAIClueLoading}
        isAIGuessing={gameState.isAIGuessing}
        onHumanClueSubmit={handleHumanClueSubmit}
        onGetAIClue={handleAIClueGeneration}
        onEndTurn={() => endPlayerTurn(true)} // Human always uses token if they end turn via this button
        canHumanVoluntarilyEndGuessing={canHumanVoluntarilyEndGuessing}
        mustHumanConfirmTurnEnd={mustHumanConfirmTurnEnd}
        guessesLeftForClue={guessesLeftForThisClue}
        humanClueGuessingConcluded={gameState.humanClueGuessingConcluded}
      />

      <GameBoard
        cards={wordCardsData}
        onCardClick={handleCardClick}
        isClickableForHuman={isClickableForHuman}
      />

      <Button variant="outline" onClick={resetGame} className="mt-4">
        <RefreshCw className="mr-2 h-4 w-4" /> Restart Game
      </Button>

      <GameEndModal
        isOpen={gameState.gameOver}
        message={gameState.gameMessage}
        isWin={gameState.totalGreensFound === TOTAL_UNIQUE_GREEN_AGENTS && gameState.gameOver && gameState.gameMessage.toLowerCase().includes("win")}
        onPlayAgain={resetGame}
      />
    </div>
  );
}
    