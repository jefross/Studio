
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
            activeClue: null, // Ends current clue phase
            timerTokens: useTimerToken ? Math.max(0, prev.timerTokens - 1) : prev.timerTokens,
            humanClueGuessingConcluded: false, // Reset for next potential human guess phase
        };
      }

      const newTimerTokens = useTimerToken ? Math.max(0, prev.timerTokens - 1) : prev.timerTokens;
      const nextTurn = prev.currentTurn === 'human_clue' ? 'ai_clue' : 'human_clue';
      
      return {
        ...prev,
        currentTurn: nextTurn,
        activeClue: null, // Ends current clue phase
        guessesMadeForClue: 0,
        timerTokens: newTimerTokens,
        gameMessage: `${nextTurn === 'ai_clue' ? "AI's" : "Your"} turn to give a clue.`,
        humanClueGuessingConcluded: false, // Reset for next potential human guess phase
      };
    });
  }, [setGameState]);
  
  const processReveal = useCallback((cardId: number, perspectiveOfGuesser: 'human' | 'ai'): { turnShouldEnd: boolean, useTokenOnTurnEnd: boolean, correctGuess: boolean, newGameOver: boolean, newMessage: string } => {
    let result = { turnShouldEnd: false, useTokenOnTurnEnd: false, correctGuess: false, newGameOver: false, newMessage: "" };
    setGameState(prev => {
      if (!prev || prev.gameOver || (perspectiveOfGuesser === 'human' && (!prev.activeClue || prev.humanClueGuessingConcluded)) || prev.revealedStates[cardId] !== 'hidden') return prev;

      const { activeClue, keyCardSetup, revealedStates: currentRevealedStates, guessesMadeForClue, gridWords } = prev;
      
      const clueGiverPerspective = perspectiveOfGuesser === 'human' ? 'ai' : 'human';
      const cardIdentityOnClueGiverSide = keyCardSetup[cardId][clueGiverPerspective];
      const clueGiverName = clueGiverPerspective === 'ai' ? 'the AI' : 'you';
      
      const newRevealedStates = [...currentRevealedStates];
      let newGuessesMade = guessesMadeForClue + 1;
      let newHumanClueGuessingConcluded = prev.humanClueGuessingConcluded;

      if (cardIdentityOnClueGiverSide === 'ASSASSIN') {
        newRevealedStates[cardId] = 'assassin';
        result.newMessage = `Assassin hit! ${clueGiverName} (clue giver) had an assassin at ${gridWords[cardId].toUpperCase()}. Game Over!`;
        result.newGameOver = true;
        result.turnShouldEnd = true; // Turn ends immediately
        if (perspectiveOfGuesser === 'human') newHumanClueGuessingConcluded = true;
      } else if (cardIdentityOnClueGiverSide === 'GREEN') {
        newRevealedStates[cardId] = 'green';
        result.correctGuess = true;
        result.newMessage = `Correct! ${gridWords[cardId].toUpperCase()} was an agent for ${clueGiverName} (clue giver).`;
        
        if (activeClue) { // activeClue should exist if we are in guessing phase
            const maxGuessesAllowed = activeClue.count === 0 ? (perspectiveOfGuesser === 'human' ? Infinity : 1) : activeClue.count + 1; // Human gets unlimited on 0 for now.
            if (newGuessesMade >= maxGuessesAllowed && activeClue.count !==0) { // For clue 0, human can continue. AI stops after 1.
              result.turnShouldEnd = true;
              result.newMessage += ` Max guesses for this clue reached by ${perspectiveOfGuesser}.`;
              if (perspectiveOfGuesser === 'human') newHumanClueGuessingConcluded = true;
            } else if (activeClue.count === 0 && perspectiveOfGuesser === 'ai') { // AI only gets one guess on count 0
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
        activeClue: result.newGameOver ? null : prev.activeClue, // activeClue nullified by endPlayerTurn later if needed
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
    if (gameState.timerTokens <= 0 && gameState.currentTurn !== 'human_clue' && gameState.currentTurn !== 'ai_clue') { // Check only if not in clue giving phase
      setGameState(prev => prev ? { ...prev, gameOver: true, gameMessage: 'Out of time! Not all agents were contacted. You lose.', activeClue: null } : null);
      return true;
    }
    return false;
  }, [gameState, setGameState]);

  useEffect(() => {
    setGameState(initializeGameState());
  }, [resetGame]);

  useEffect(() => {
    if (gameState && !gameState.isAIClueLoading && !gameState.isAIGuessing) {
        checkWinOrLossCondition();
    }
  }, [gameState, checkWinOrLossCondition]);

  const handleCardClick = useCallback(async (id: number) => {
    if (!gameState || gameState.gameOver || !gameState.activeClue || gameState.revealedStates[id] !== 'hidden' || gameState.isAIClueLoading || gameState.isAIGuessing || gameState.humanClueGuessingConcluded) return;
    if (gameState.currentTurn !== 'ai_clue') return; 

    const currentGuessesMade = gameState.guessesMadeForClue;
    const clueCount = gameState.activeClue.count;
    // For clue 0, human can make "unlimited" correct green guesses. For other clues, N+1.
    const maxGuessesThisClue = clueCount === 0 ? Infinity : clueCount + 1; 
    if (currentGuessesMade >= maxGuessesThisClue && clueCount !== 0) {
      toast({ title: "Max Guesses", description: "You've reached the maximum guesses for this clue." });
      return;
    }

    // processReveal will update gameState, including humanClueGuessingConcluded if a bystander/assassin is hit or max guesses.
    const { newMessage, newGameOver } = processReveal(id, 'human');
    toast({ title: "Guess Result", description: newMessage });

    // If game is over, GameEndModal will show.
    // If humanClueGuessingConcluded is true (e.g. bystander hit), player must click "End Turn" button.
    // No direct call to endPlayerTurn here anymore, unless game over.
    if (newGameOver) {
        // Game over state is set within processReveal, which triggers modal.
        // Ensure activeClue is nullified if game over occurs mid-turn.
        setGameState(prev => prev ? {...prev, activeClue: null} : null);
    }

  }, [gameState, processReveal, toast, setGameState]);

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
      const aiAssassins = gameState.gridWords.filter((word, i) => 
        aiPerspectiveKey[i] === 'ASSASSIN' && gameState.revealedStates[i] === 'hidden'
      );

      if (unrevealedAIGreens.length === 0) {
        toast({ title: "AI Info", description: "AI has no more green words to give clues for. AI passes." });
        setGameState(prev => prev ? { 
            ...prev, 
            isAIClueLoading: false, 
            activeClue: null, // AI passes, so no active clue
            guessesMadeForClue: 0,
            humanClueGuessingConcluded: false, // Reset this flag
        } : null);
        endPlayerTurn(false); // AI passes, turn ends, no token used for passing clue turn
        return;
      }

      const aiClueResponse = await generateAIClue({
        grid: gameState.gridWords,
        greenWords: unrevealedAIGreens,
        assassinWords: aiAssassins,
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
      setGameState(prev => prev ? { ...prev, isAIClueLoading: false, humanClueGuessingConcluded: false, gameMessage: "Error getting AI clue. Your turn to give a clue or try AI again." } : null);
    }
  }, [gameState, toast, setGameState, endPlayerTurn]);

  const handleAIGuesses = useCallback(async (clue: Clue) => {
    setGameState(prevGS => {
        if (!prevGS || prevGS.gameOver) return prevGS;
        return { ...prevGS, isAIGuessing: true, gameMessage: `AI is considering guesses for your clue: ${clue.word.toUpperCase()} ${clue.count}...` };
    });
    
    let currentGS: GameState | null = null;
    setGameState(prev => { currentGS = prev; return prev; });

    if (!currentGS) {
      toast({ title: "AI Error", description: "Cannot get current game state for AI.", variant: "destructive"});
      setGameState(prev => prev ? { ...prev, isAIGuessing: false } : null);
      endPlayerTurn(true);
      return;
    }

    const aiPerspectiveKey = getPerspective(currentGS.keyCardSetup, 'ai');
    const aiUnrevealedGreenWords = currentGS.gridWords.filter((word: string, i: number) => aiPerspectiveKey[i] === 'GREEN' && currentGS!.revealedStates[i] === 'hidden');
    const aiUnrevealedAssassinWords = currentGS.gridWords.filter((word: string, i: number) => aiPerspectiveKey[i] === 'ASSASSIN' && currentGS!.revealedStates[i] === 'hidden');
    const revealedWordsList = currentGS.gridWords.filter((_: string, i: number) => currentGS!.revealedStates[i] !== 'hidden');

    try {
      const aiGuessResponse = await generateAiGuess({
        clueWord: clue.word,
        clueNumber: clue.count,
        gridWords: currentGS.gridWords,
        aiGreenWords: aiUnrevealedGreenWords,
        aiAssassinWords: aiUnrevealedAssassinWords,
        revealedWords: revealedWordsList,
      });

      toast({title: "AI Guessing", description: `AI is guessing: ${aiGuessResponse.guessedWords.join(', ') || "Pass"}. Reasoning: ${aiGuessResponse.reasoning || 'N/A'}`});

      if (!aiGuessResponse.guessedWords || aiGuessResponse.guessedWords.length === 0) {
        toast({ title: "AI Action", description: "AI decided to pass this turn." });
        setGameState(prev => prev ? {...prev, gameMessage: "AI passes."} : null);
        endPlayerTurn(true); // AI passes guess, token used
      } else {
        let turnEndedMidGuess = false;
        let tokenUsedForTurnEnd = false; // This will be determined by processReveal
        let gameEndedMidGuess = false;
        
        for (const guessedWord of aiGuessResponse.guessedWords) {
          let cardId = -1;
          let cardIsStillHidden = false;
          // Critical: ensure operations on gameState are atomic or use latest from setGameState callback
          setGameState(prevForCardLookup => {
            if (!prevForCardLookup) return prevForCardLookup;
            cardId = prevForCardLookup.gridWords.indexOf(guessedWord);
            if (cardId !== -1 && prevForCardLookup.revealedStates[cardId] === 'hidden') {
              cardIsStillHidden = true;
            }
            // Check if game already ended from a previous AI guess in this loop
            if(prevForCardLookup.gameOver) gameEndedMidGuess = true;
            return prevForCardLookup;
          });

          if (gameEndedMidGuess) break; // Stop if a previous guess in this loop ended the game
          if (cardId === -1 || !cardIsStillHidden) continue; 

          await delay(1000);
          const revealResult = processReveal(cardId, 'ai');
          toast({title: `AI Guesses: ${guessedWord.toUpperCase()}`, description: revealResult.newMessage});
          
          if (revealResult.newGameOver) {
             gameEndedMidGuess = true;
             // No need to explicitly call endPlayerTurn, game over state handles it.
             // Active clue is nullified by processReveal if game over.
             break; 
          }
          if (revealResult.turnShouldEnd) { // AI hit bystander, or max guesses for AI
            turnEndedMidGuess = true;
            tokenUsedForTurnEnd = revealResult.useTokenOnTurnEnd;
            break;
          }
        }
        
        // After loop, if game hasn't ended, then end AI's turn
        // Read latest game over state
        let finalGameOverCheck = false;
        setGameState(prev => {
            if (prev) finalGameOverCheck = prev.gameOver;
            return prev;
        });

        if (!finalGameOverCheck) {
             endPlayerTurn(turnEndedMidGuess ? tokenUsedForTurnEnd : false); // If AI turn ended by bystander, tokenUsedForTurnEnd is true. If it just made its guesses correctly, false.
        }
      }
    } catch (error) {
      console.error("Error during AI guessing:", error);
      toast({ title: "AI Error", description: "AI had trouble making a guess. Turn passes.", variant: "destructive" });
      endPlayerTurn(true); // Error, token used
    } finally {
      setGameState(prev => prev ? { ...prev, isAIGuessing: false } : null);
    }
  }, [toast, processReveal, endPlayerTurn, setGameState]);

  const handleHumanClueSubmit = useCallback((clue: Clue) => {
    setGameState(prev => {
      if (!prev || prev.gameOver || prev.isAIGuessing || prev.isAIClueLoading) return prev;
      return {
        ...prev,
        activeClue: clue,
        currentTurn: 'human_clue', 
        gameMessage: `Your Clue: ${clue.word.toUpperCase()} for ${clue.count}. AI is now 'guessing'.`,
        guessesMadeForClue: 0,
        humanClueGuessingConcluded: false, // Should not apply to AI's guessing phase
      };
    });
    handleAIGuesses(clue);
  }, [setGameState, handleAIGuesses]);
  
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
  
  // Number of guesses human has left for the current AI clue
  const guessesLeftForThisClue = gameState.activeClue && !gameState.humanClueGuessingConcluded ?
    Math.max(0, (gameState.activeClue.count === 0 ? Infinity : gameState.activeClue.count + 1) - gameState.guessesMadeForClue)
    : 0;

  // Is it the human's turn to make a guess for an AI clue?
  const isHumanCurrentlyGuessingPhase =
    gameState.currentTurn === 'ai_clue' &&
    !!gameState.activeClue &&
    !gameState.gameOver &&
    !gameState.isAIClueLoading &&
    !gameState.isAIGuessing;

  // Can the human player click on a card?
  const isClickableForHuman = isHumanCurrentlyGuessingPhase && !gameState.humanClueGuessingConcluded && guessesLeftForThisClue > 0;

  // Should the "End Guessing Voluntarily" button be shown?
  const canHumanVoluntarilyEndGuessing = isHumanCurrentlyGuessingPhase && !gameState.humanClueGuessingConcluded && guessesLeftForThisClue > 0;
  
  // Should the "End Turn (Token Used)" button be shown (because human's guessing concluded by system)?
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
        onEndTurn={() => endPlayerTurn(true)} // Always use token if turn ended via button
        canHumanVoluntarilyEndGuessing={canHumanVoluntarilyEndGuessing}
        mustHumanConfirmTurnEnd={mustHumanConfirmTurnEnd}
        guessesLeftForClue={guessesLeftForThisClue} // Still useful for display
        humanClueGuessingConcluded={gameState.humanClueGuessingConcluded} // Pass this down for button text
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
