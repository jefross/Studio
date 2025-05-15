
"use client";

import type React from 'react';
import { useState, useEffect, useCallback } from 'react';
import GameBoard from '@/components/GameBoard';
import ControlsPanel from '@/components/ControlsPanel';
import GameEndModal from '@/components/GameEndModal';
import { initializeGameState, getPerspective, countRemainingGreens } from '@/lib/game-logic';
import type { GameState, WordCardData, Clue, PlayerTurn, CardType } from '@/types';
import { TOTAL_UNIQUE_GREEN_AGENTS } from '@/types';
import { generateClue as generateAIClue } from '@/ai/flows/ai-clue-generator';
import { generateAiGuess } from '@/ai/flows/ai-guess-generator';
import { useToast } from "@/hooks/use-toast";
import { Button } from '@/components/ui/button';
import { RefreshCw, Loader2 } from 'lucide-react';

// Helper to introduce delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export default function CodenamesDuetPage() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const { toast } = useToast();

  const resetGame = useCallback(() => {
    setGameState(initializeGameState());
  }, []);

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
  
  const processReveal = useCallback((cardId: number, perspectiveOfGuesser: 'human' | 'ai'): { turnShouldEnd: boolean, useTokenOnTurnEnd: boolean, correctGuess: boolean, newGameOver: boolean, newMessage: string } => {
    let result = { turnShouldEnd: false, useTokenOnTurnEnd: false, correctGuess: false, newGameOver: false, newMessage: "" };
    setGameState(prev => {
      if (!prev || prev.gameOver || prev.revealedStates[cardId] !== 'hidden') return prev;
      // Human guessing specific checks
      if (perspectiveOfGuesser === 'human' && (!prev.activeClue || prev.humanClueGuessingConcluded)) return prev;


      const { activeClue, keyCardSetup, revealedStates: currentRevealedStates, guessesMadeForClue, gridWords } = prev;
      
      // CORRECTED: Card identity is based on CLUE GIVER'S key
      const clueGiverPerspectiveKey = perspectiveOfGuesser === 'human' ? keyCardSetup[cardId].ai : keyCardSetup[cardId].human;
      const clueGiverName = perspectiveOfGuesser === 'human' ? 'the AI' : 'you';
      
      const newRevealedStates = [...currentRevealedStates];
      let newGuessesMade = guessesMadeForClue + 1;
      let newHumanClueGuessingConcluded = prev.humanClueGuessingConcluded;

      if (clueGiverPerspectiveKey === 'ASSASSIN') {
        newRevealedStates[cardId] = 'assassin';
        result.newMessage = `Assassin hit! ${clueGiverName} (clue giver) had an assassin at ${gridWords[cardId].toUpperCase()}. Game Over!`;
        result.newGameOver = true;
        result.turnShouldEnd = true; 
        if (perspectiveOfGuesser === 'human') newHumanClueGuessingConcluded = true;
      } else if (clueGiverPerspectiveKey === 'GREEN') {
        newRevealedStates[cardId] = 'green';
        result.correctGuess = true;
        result.newMessage = `Correct! ${gridWords[cardId].toUpperCase()} was an agent for ${clueGiverName} (clue giver).`;
        
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
        result.newMessage = `Incorrect. ${gridWords[cardId].toUpperCase()} was a bystander for ${clueGiverName} (clue giver). Turn ends for ${perspectiveOfGuesser}.`;
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
    if (!gameState || gameState.gameOver) return true;

    const revealedGreenCount = gameState.revealedStates.filter(s => s === 'green').length;

    if (revealedGreenCount === TOTAL_UNIQUE_GREEN_AGENTS) {
      setGameState(prev => prev ? { ...prev, gameOver: true, gameMessage: 'All 15 agents contacted! You win!', activeClue: null } : null);
      return true;
    }
    if (gameState.timerTokens <= 0 && gameState.currentTurn !== 'human_clue' && gameState.currentTurn !== 'ai_clue') { 
      setGameState(prev => prev ? { ...prev, gameOver: true, gameMessage: 'Out of time! Not all agents were contacted. You lose.', activeClue: null } : null);
      return true;
    }
    return false;
  }, [gameState, setGameState]);

  const handleAIClueGeneration = useCallback(async () => {
    if (!gameState) {
      toast({ title: "Game Error", description: "Game state not available.", variant: "destructive" });
      return;
    }
    setGameState(prev => prev ? { ...prev, isAIClueLoading: true, gameMessage: "AI is thinking of a clue..." } : null);

    try {
      // AI gives clue based on its own key card (what it wants the human to guess)
      const aiPerspectiveKey = getPerspective(gameState.keyCardSetup, 'ai');
      const unrevealedAIGreens = gameState.gridWords.filter((word, i) => 
        aiPerspectiveKey[i] === 'GREEN' && gameState.revealedStates[i] === 'hidden'
      );
      // Assassins for the human (AI must avoid giving clues that lead human to their own assassins)
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
        greenWords: unrevealedAIGreens, // Words AI wants human to guess
        assassinWords: humanAssassins, // Words AI wants human to avoid
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
    // Guard at the beginning of handleAIGuesses
    if (!gameState || gameState.gameOver || gameState.isAIGuessing) {
      toast({ title: "AI Action Blocked", description: "AI cannot guess at this time.", variant: "default" });
      if (gameState && gameState.isAIGuessing) { // If already guessing, just return
         return;
      }
      // If game over or no game state, reset isAIGuessing if it was somehow true
      setGameState(prev => prev ? { ...prev, isAIGuessing: false } : null);
      // Potentially end turn if this was called erroneously after game over and not already AI's turn to guess
      if (gameState && gameState.gameOver && gameState.currentTurn === 'human_clue' && gameState.activeClue) {
         endPlayerTurn(false); // No token if game ended
      }
      return;
    }

    setGameState(prevGS => ({
      ...prevGS!, 
      isAIGuessing: true,
      gameMessage: `AI is considering guesses for your clue: ${clue.word.toUpperCase()} ${clue.count}...`
    }));

    // Use the gameState from the closure for generating AI prompt.
    // This is the state *before* we set isAIGuessing to true, which is correct for input.
    const currentGameStateForAI = gameState; // Snapshot for AI's decision process

    const aiPerspectiveKey = getPerspective(currentGameStateForAI.keyCardSetup, 'ai');
    const aiUnrevealedGreenWords = currentGameStateForAI.gridWords.filter((word: string, i: number) => aiPerspectiveKey[i] === 'GREEN' && currentGameStateForAI.revealedStates[i] === 'hidden');
    const aiUnrevealedAssassinWords = currentGameStateForAI.gridWords.filter((word: string, i: number) => aiPerspectiveKey[i] === 'ASSASSIN' && currentGameStateForAI.revealedStates[i] === 'hidden');
    const revealedWordsList = currentGameStateForAI.gridWords.filter((_: string, i: number) => currentGameStateForAI.revealedStates[i] !== 'hidden');

    try {
      const aiGuessResponse = await generateAiGuess({
        clueWord: clue.word,
        clueNumber: clue.count,
        gridWords: currentGameStateForAI.gridWords,
        aiGreenWords: aiUnrevealedGreenWords, // Words AI wants to hit from its own key
        aiAssassinWords: aiUnrevealedAssassinWords, // Assassins AI wants to avoid from its own key
        revealedWords: revealedWordsList,
      });

      toast({title: "AI Guessing", description: `AI is guessing: ${aiGuessResponse.guessedWords.join(', ') || "Pass"}. Reasoning: ${aiGuessResponse.reasoning || 'N/A'}`});

      if (!aiGuessResponse.guessedWords || aiGuessResponse.guessedWords.length === 0) {
        toast({ title: "AI Action", description: "AI decided to pass this turn." });
        setGameState(prev => prev ? {...prev, gameMessage: "AI passes."} : null);
        endPlayerTurn(true); // AI passes guess, token used
      } else {
        let turnEndedMidGuess = false;
        let tokenUsedForTurnEnd = false; 
        let gameEndedMidGuess = false;
        
        for (const guessedWord of aiGuessResponse.guessedWords) {
          let cardId = -1;
          let cardIsStillHidden = false;
          
          setGameState(prevForCardLookup => {
            if (!prevForCardLookup) return prevForCardLookup;
            cardId = prevForCardLookup.gridWords.indexOf(guessedWord);
            if (cardId !== -1 && prevForCardLookup.revealedStates[cardId] === 'hidden') {
              cardIsStillHidden = true;
            }
            if(prevForCardLookup.gameOver) gameEndedMidGuess = true;
            return prevForCardLookup;
          });

          if (gameEndedMidGuess) break; 
          if (cardId === -1 || !cardIsStillHidden) continue; 

          await delay(1000);
          // AI is guessing, so perspectiveOfGuesser is 'ai'
          // The card identity will be based on the human's (clue giver's) key.
          const revealResult = processReveal(cardId, 'ai'); 
          toast({title: `AI Guesses: ${guessedWord.toUpperCase()}`, description: revealResult.newMessage});
          
          if (revealResult.newGameOver) {
             gameEndedMidGuess = true;
             break; 
          }
          if (revealResult.turnShouldEnd) { 
            turnEndedMidGuess = true;
            tokenUsedForTurnEnd = revealResult.useTokenOnTurnEnd;
            break;
          }
        }
        
        let finalGameOverCheck = false;
        setGameState(prev => {
            if (prev) finalGameOverCheck = prev.gameOver;
            return prev;
        });

        if (!finalGameOverCheck) {
             endPlayerTurn(turnEndedMidGuess ? tokenUsedForTurnEnd : false); 
        }
      }
      setGameState(prev => prev ? { ...prev, isAIGuessing: false } : null);

    } catch (error) {
      console.error("Error during AI guessing:", error);
      toast({ title: "AI Error", description: "AI had trouble making a guess. Turn passes.", variant: "destructive" });
      
      // Check gameState directly before calling endPlayerTurn
      // Use a functional update to get the latest state if needed for this check, though direct check might be fine
      const gs = gameState; // Current scope gameState
      if (gs && !gs.gameOver) {
          endPlayerTurn(true); // Error, token used
      }
      setGameState(prev => prev ? { ...prev, isAIGuessing: false } : null);
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
        // currentTurn remains 'human_clue' because human is giving the clue.
        // AI will guess. After AI finishes, endPlayerTurn switches to 'ai_clue'.
        gameMessage: `Your Clue: ${clue.word.toUpperCase()} for ${clue.count}. AI is now 'guessing'.`,
        guessesMadeForClue: 0, 
        // humanClueGuessingConcluded is for when human is guessing AI's clue. Reset if necessary, though not directly relevant here.
        humanClueGuessingConcluded: false, 
      };
    });

    if (shouldCallAIGuesses) {
        handleAIGuesses(clue);
    }
  }, [setGameState, handleAIGuesses, toast]);

  useEffect(() => {
    setGameState(initializeGameState());
  }, [resetGame]); // Only on explicit reset

  useEffect(() => {
    if (gameState && !gameState.isAIClueLoading && !gameState.isAIGuessing) {
        checkWinOrLossCondition();
    }
  }, [gameState, checkWinOrLossCondition]);

  const handleCardClick = useCallback(async (id: number) => {
    if (!gameState || gameState.gameOver || !gameState.activeClue || gameState.revealedStates[id] !== 'hidden' || gameState.isAIClueLoading || gameState.isAIGuessing || gameState.humanClueGuessingConcluded) return;
    // Ensure it's human's turn to guess (i.e., AI gave the clue, currentTurn is 'ai_clue')
    if (gameState.currentTurn !== 'ai_clue') return; 

    const currentGuessesMade = gameState.guessesMadeForClue;
    const clueCount = gameState.activeClue.count;
    const maxGuessesThisClue = clueCount === 0 ? Infinity : clueCount + 1; 
    
    if (currentGuessesMade >= maxGuessesThisClue && clueCount !== 0) {
      toast({ title: "Max Guesses", description: "You've reached the maximum guesses for this clue." });
      return;
    }

    // Human is guessing, so perspectiveOfGuesser is 'human'.
    // The card identity will be based on the AI's (clue giver's) key.
    const { newMessage, newGameOver, turnShouldEnd, useTokenOnTurnEnd } = processReveal(id, 'human');
    toast({ title: "Guess Result", description: newMessage });
    
    if (newGameOver) {
        setGameState(prev => prev ? {...prev, activeClue: null} : null);
    } else if (turnShouldEnd) {
        // humanClueGuessingConcluded is set inside processReveal.
        // The player must now click the "End Turn" button.
        // No automatic endPlayerTurn here unless it's game over.
    }
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
  
  const guessesLeftForThisClue = gameState.activeClue && !gameState.humanClueGuessingConcluded && gameState.currentTurn === 'ai_clue' ?
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
        onEndTurn={() => endPlayerTurn(true)} 
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
        isWin={gameState.totalGreensFound === TOTAL_UNIQUE_GREEN_AGENTS && gameState.gameMessage.toLowerCase().includes("win")}
        onPlayAgain={resetGame}
      />
    </div>
  );
}

