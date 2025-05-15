
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

  const checkWinOrLossCondition = useCallback(() => {
    if (!gameState || gameState.gameOver) return true;

    const revealedGreenCount = gameState.revealedStates.filter(s => s === 'green').length;

    if (revealedGreenCount === TOTAL_UNIQUE_GREEN_AGENTS) {
      setGameState(prev => prev ? { ...prev, gameOver: true, gameMessage: 'All 15 agents contacted! You win!', activeClue: null } : null);
      return true;
    }
    if (gameState.timerTokens <= 0 && (gameState.currentTurn !== 'human_clue' && gameState.currentTurn !== 'ai_clue')) {
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
            humanClueGuessingConcluded: false, // Reset for next turn regardless
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
        humanClueGuessingConcluded: false, // Reset for next turn
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

      const cardIdentityOnClueGiverSide = perspectiveOfGuesser === 'human' ? keyCardSetup[cardId].ai : keyCardSetup[cardId].human;
      const clueGiverName = perspectiveOfGuesser === 'human' ? 'the AI' : 'you';
      const guesserName = perspectiveOfGuesser === 'human' ? 'You' : 'The AI';

      const newRevealedStates = [...currentRevealedStates];
      let newGuessesMade = guessesMadeForClue + 1;
      let newHumanClueGuessingConcluded = prev.humanClueGuessingConcluded;

      if (cardIdentityOnClueGiverSide === 'ASSASSIN') {
        newRevealedStates[cardId] = 'assassin';
        result.newMessage = `${guesserName} hit an ASSASSIN! (${gridWords[cardId].toUpperCase()}) Game Over! This was an assassin for ${clueGiverName} (the clue giver).`;
        result.newGameOver = true;
        result.turnShouldEnd = true;
        if (perspectiveOfGuesser === 'human') newHumanClueGuessingConcluded = true;
      } else if (cardIdentityOnClueGiverSide === 'GREEN') {
        newRevealedStates[cardId] = 'green';
        result.correctGuess = true;
        result.newMessage = `Correct! ${gridWords[cardId].toUpperCase()} was an agent for ${clueGiverName} (the clue giver).`;

        if (activeClue) {
            const maxGuessesAllowed = activeClue.count === 0 ? (perspectiveOfGuesser === 'human' ? Infinity : 1) : activeClue.count + 1;
            if (newGuessesMade >= maxGuessesAllowed && activeClue.count !==0) {
              result.turnShouldEnd = true;
              result.newMessage += ` Max guesses for this clue reached by ${perspectiveOfGuesser}.`;
              if (perspectiveOfGuesser === 'human') newHumanClueGuessingConcluded = true;
            } else if (activeClue.count === 0 && perspectiveOfGuesser === 'ai') { // AI special rule for clue 0
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
          result.turnShouldEnd = true; // Game win should also conclude guessing
          if (perspectiveOfGuesser === 'human') newHumanClueGuessingConcluded = true;
      }

      result.newGameOver = result.newGameOver || prev.gameOver; // Persist gameOver if already true

      return {
        ...prev,
        revealedStates: newRevealedStates,
        gameOver: result.newGameOver,
        gameMessage: result.newMessage,
        guessesMadeForClue: newGuessesMade,
        totalGreensFound: updatedTotalGreensFound,
        humanClueGuessingConcluded: newHumanClueGuessingConcluded,
        activeClue: result.newGameOver ? null : prev.activeClue, // Clear activeClue if game ends
      };
    });
    return result;
  }, [setGameState]);


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
      // For AI clue generation, it needs to know which words are assassins FOR THE HUMAN (guesser).
      const humanPerspectiveKey = getPerspective(gameState.keyCardSetup, 'human');
      const humanAssassins = gameState.gridWords.filter((word, i) =>
        humanPerspectiveKey[i] === 'ASSASSIN' && gameState.revealedStates[i] === 'hidden'
      );

      if (unrevealedAIGreens.length === 0) {
        toast({ title: "AI Info", description: "AI has no more green words to give clues for. AI passes." });
         setGameState(prev => prev ? {
            ...prev,
            isAIClueLoading: false,
            activeClue: null, // No active clue if AI passes
            guessesMadeForClue: 0,
            humanClueGuessingConcluded: false,
        } : null);
        endPlayerTurn(false); // AI passing clue does not use a token
        return;
      }

      const aiClueResponse = await generateAIClue({
        grid: gameState.gridWords,
        greenWords: unrevealedAIGreens, // AI's own greens it wants human to guess
        assassinWords: humanAssassins, // Human's assassins AI wants human to avoid
        timerTokens: gameState.timerTokens,
      });

      setGameState(prev => prev ? {
        ...prev,
        activeClue: { word: aiClueResponse.clueWord, count: aiClueResponse.clueNumber },
        isAIClueLoading: false,
        gameMessage: `AI's Clue: ${aiClueResponse.clueWord.toUpperCase()} for ${aiClueResponse.clueNumber}. Your turn to guess.`,
        guessesMadeForClue: 0,
        humanClueGuessingConcluded: false, // Reset for human's guessing phase
      } : null);
      toast({ title: "AI Clue", description: `${aiClueResponse.clueWord.toUpperCase()} - ${aiClueResponse.clueNumber}. Reasoning: ${aiClueResponse.reasoning || 'N/A'}` });

    } catch (error) {
      console.error("Error generating AI clue:", error);
      toast({ title: "AI Error", description: "Could not generate AI clue.", variant: "destructive" });
      setGameState(prev => prev ? { ...prev, isAIClueLoading: false, humanClueGuessingConcluded: false, gameMessage: "Error getting AI clue. Try AI again or if issue persists, restart." } : null);
      // No automatic turn end here, player might want to retry or reset.
    }
  }, [gameState, toast, setGameState, endPlayerTurn]);


  const handleAIGuesses = useCallback(async (clue: Clue) => {
    const currentGameState = gameState; // Capture state at the moment of call for this async operation
    if (!currentGameState || currentGameState.gameOver || currentGameState.isAIGuessing) {
      toast({ title: "AI Action Blocked", description: "AI cannot guess at this time.", variant: "default" });
      setGameState(prev => prev ? { ...prev, isAIGuessing: false } : null); // Ensure isAIGuessing is reset if it somehow got stuck
      // If game is over and it was supposed to be AI's turn to guess based on a human clue, end the turn to clear active clue
      if (currentGameState && currentGameState.gameOver && currentGameState.currentTurn === 'human_clue' && currentGameState.activeClue) {
         endPlayerTurn(false); // No token for game over during AI guess
      }
      return;
    }

    setGameState(prevGS => ({
      ...prevGS!,
      isAIGuessing: true,
      gameMessage: `AI is considering guesses for your clue: ${clue.word.toUpperCase()} ${clue.count}...`
    }));

    // AI guesses based on ITS perspective of green/assassin, for the HUMAN'S clue.
    const aiPerspectiveKey = getPerspective(currentGameState.keyCardSetup, 'ai');
    const aiUnrevealedGreenWords = currentGameState.gridWords.filter((word: string, i: number) => aiPerspectiveKey[i] === 'GREEN' && currentGameState.revealedStates[i] === 'hidden');
    const aiUnrevealedAssassinWords = currentGameState.gridWords.filter((word: string, i: number) => aiPerspectiveKey[i] === 'ASSASSIN' && currentGameState.revealedStates[i] === 'hidden');
    const revealedWordsList = currentGameState.gridWords.filter((_: string, i: number) => currentGameState.revealedStates[i] !== 'hidden');

    try {
      const aiGuessResponse = await generateAiGuess({
        clueWord: clue.word,
        clueNumber: clue.count,
        gridWords: currentGameState.gridWords,
        aiGreenWords: aiUnrevealedGreenWords,
        aiAssassinWords: aiUnrevealedAssassinWords,
        revealedWords: revealedWordsList,
      });

      toast({title: "AI Analyzing", description: `AI will attempt to guess: ${aiGuessResponse.guessedWords.join(', ') || "Pass"}. Reasoning: ${aiGuessResponse.reasoning || 'N/A'}`});

      if (!aiGuessResponse.guessedWords || aiGuessResponse.guessedWords.length === 0) {
        toast({ title: "AI Action: Pass", description: `AI decided to pass. Reasoning: ${aiGuessResponse.reasoning || 'No specific reason given.'}` });
        setGameState(prev => prev ? {...prev, gameMessage: `AI passes. ${aiGuessResponse.reasoning || ''}`, isAIGuessing: false} : null);
        endPlayerTurn(true); // AI passes guess, token used
        return;
      }

      let gameEndedByAI = false;
      let turnEndedForAI = false;
      let tokenUsedForAIsTurn = false;

      for (const guessedWord of aiGuessResponse.guessedWords) {
        const cardId = currentGameState.gridWords.indexOf(guessedWord);

        if (cardId === -1) {
          toast({ title: "AI Error", description: `AI tried to guess '${guessedWord}', which is not on the board. Skipping.`});
          continue;
        }
        
        // Delay before each AI guess reveal
        await delay(1500); 
        // processReveal uses setGameState, so it gets the LATEST state for revealedStates check
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

      // Reset isAIGuessing after loop, before ending turn
      setGameState(prev => prev ? { ...prev, isAIGuessing: false } : null);
      
      if (!gameEndedByAI) {
           endPlayerTurn(turnEndedForAI ? tokenUsedForAIsTurn : false);
      }
      // If gameEndedByAI, gameState.gameOver is already true via processReveal.
      // endPlayerTurn (which is called if !gameEndedByAI) also checks for win/loss and clears activeClue if gameOver.
      // The useEffect for checkWinOrLossCondition will handle the modal if game over.

    } catch (error) {
      console.error("Error during AI guessing:", error);
      toast({ title: "AI Error", description: "AI had trouble making a guess. Turn passes.", variant: "destructive" });
      setGameState(prev => prev ? { ...prev, isAIGuessing: false } : null);
      
      // Check latest gameState directly before calling endPlayerTurn to avoid issues if already over
      // Need to use the functional update form of setGameState to get the *absolute latest* state for this check
      let wasGameOver = false;
      setGameState(prev => {
          if (prev) wasGameOver = prev.gameOver;
          return prev;
      });

      if (!wasGameOver) {
          endPlayerTurn(true); // Error during AI guess, token used
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
      // Check if word is on the board
      if (prev.gridWords.includes(clue.word.toUpperCase())) {
        toast({ title: "Invalid Clue", description: "Clue word cannot be one of the words on the board.", variant: "destructive" });
        return prev;
      }
      shouldCallAIGuesses = true;
      return {
        ...prev,
        activeClue: clue,
        currentTurn: 'human_clue', // Explicitly set, though it should be already
        gameMessage: `Your Clue: ${clue.word.toUpperCase()} for ${clue.count}. AI is now 'guessing'.`,
        guessesMadeForClue: 0, // Reset for AI's guessing phase
        humanClueGuessingConcluded: false, // Should not apply to AI guessing
      };
    });

    if (shouldCallAIGuesses) {
        handleAIGuesses(clue);
    }
  }, [setGameState, handleAIGuesses, toast]);


  const handleCardClick = useCallback(async (id: number) => {
    // Capture current gameState at the time of click
    const currentGameState = gameState;

    if (!currentGameState || currentGameState.gameOver || !currentGameState.activeClue || currentGameState.revealedStates[id] !== 'hidden' || currentGameState.isAIClueLoading || currentGameState.isAIGuessing || currentGameState.humanClueGuessingConcluded) {
      return;
    }
    // Ensure it's human's turn to guess (AI gave the clue)
    if (currentGameState.currentTurn !== 'ai_clue') {
      return;
    }

    const currentGuessesMade = currentGameState.guessesMadeForClue;
    const clueCount = currentGameState.activeClue.count;

    const maxGuessesThisClue = clueCount === 0 ? Infinity : clueCount + 1;

    if (currentGuessesMade >= maxGuessesThisClue && clueCount !== 0) {
      toast({ title: "Max Guesses", description: "You've reached the maximum guesses for this clue." });
      // humanClueGuessingConcluded should already be true if max guesses were hit by a correct guess.
      // This just prevents further clicks if somehow it wasn't.
      setGameState(prev => prev ? {...prev, humanClueGuessingConcluded: true} : null);
      return;
    }

    const { newMessage, newGameOver, turnShouldEnd, useTokenOnTurnEnd } = processReveal(id, 'human');
    toast({ title: "Guess Result", description: newMessage });

    // processReveal sets humanClueGuessingConcluded if the turn ends due to the guess.
    // It also sets gameOver and activeClue = null if the game ends.
    // No automatic endPlayerTurn here unless it's game over. Player must click "End Turn" button
    // if humanClueGuessingConcluded is true and game is not over.
    // If newGameOver is true, the GameEndModal will appear.
  }, [gameState, processReveal, toast, setGameState]);

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

  const guessesLeftForThisClue = gameState.activeClue && gameState.currentTurn === 'ai_clue' && !gameState.humanClueGuessingConcluded ?
    Math.max(0, (gameState.activeClue.count === 0 ? Infinity : gameState.activeClue.count + 1) - gameState.guessesMadeForClue)
    : 0;

  const isHumanCurrentlyGuessingPhase =
    gameState.currentTurn === 'ai_clue' &&
    !!gameState.activeClue &&
    !gameState.gameOver &&
    !gameState.isAIClueLoading &&
    !gameState.isAIGuessing;

  const isClickableForHuman = isHumanCurrentlyGuessingPhase && !gameState.humanClueGuessingConcluded && guessesLeftForThisClue > 0;
  const canHumanVoluntarilyEndGuessing = isHumanCurrentlyGuessingPhase && !gameState.humanClueGuessingConcluded && guessesLeftForThisClue > 0;
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
        onEndTurn={() => endPlayerTurn(true)} // Token used when human ends turn manually or confirms mandatory end.
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
    
