
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

  useEffect(() => {
    setGameState(initializeGameState());
  }, []);

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
      };
    });
  }, [setGameState]);

  const processReveal = useCallback((cardId: number, perspectiveOfGuesser: 'human' | 'ai'): { turnShouldEnd: boolean, useTokenOnTurnEnd: boolean, correctGuess: boolean, newGameOver: boolean, newMessage: string } => {
    let result = { turnShouldEnd: false, useTokenOnTurnEnd: false, correctGuess: false, newGameOver: false, newMessage: "" };
    setGameState(prev => {
      if (!prev || prev.gameOver || !prev.activeClue || prev.revealedStates[cardId] !== 'hidden') return prev;

      const { activeClue, keyCardSetup, revealedStates: currentRevealedStates, guessesMadeForClue, gridWords } = prev;
      
      // This line determines card identity based on the GUESSER's perspective.
      const cardIdentityOnTargetSide = perspectiveOfGuesser === 'human' ? keyCardSetup[cardId].human : keyCardSetup[cardId].ai;
      
      const newRevealedStates = [...currentRevealedStates];
      let newGuessesMade = guessesMadeForClue + 1;

      if (cardIdentityOnTargetSide === 'ASSASSIN') {
        newRevealedStates[cardId] = 'assassin';
        result.newMessage = `Assassin hit! ${perspectiveOfGuesser === 'human' ? 'You' : 'AI'} revealed an assassin (${gridWords[cardId].toUpperCase()}). Game Over!`;
        result.newGameOver = true;
        result.turnShouldEnd = true;
        result.useTokenOnTurnEnd = false;
      } else if (cardIdentityOnTargetSide === 'GREEN') {
        newRevealedStates[cardId] = 'green';
        result.correctGuess = true;
        result.newMessage = `Correct! ${gridWords[cardId].toUpperCase()} is an agent for ${perspectiveOfGuesser}.`;
        
        const maxGuessesAllowed = activeClue.count === 0 ? 1 : activeClue.count + 1;
        if (newGuessesMade >= maxGuessesAllowed) {
          result.turnShouldEnd = true;
          result.newMessage += " Max guesses for this clue reached.";
          result.useTokenOnTurnEnd = false; 
        } else {
          result.newMessage += ` ${perspectiveOfGuesser === 'human' ? 'You' : 'AI'} can make another guess.`;
        }
      } else { // BYSTANDER
        newRevealedStates[cardId] = perspectiveOfGuesser === 'human' ? 'bystander_human_turn' : 'bystander_ai_turn';
        result.newMessage = `Incorrect. ${gridWords[cardId].toUpperCase()} is a bystander for ${perspectiveOfGuesser}. Turn ends.`;
        result.turnShouldEnd = true;
        result.useTokenOnTurnEnd = true;
      }
      
      const updatedTotalGreensFound = newRevealedStates.filter(s => s === 'green').length;

      if (!result.newGameOver && updatedTotalGreensFound === TOTAL_UNIQUE_GREEN_AGENTS) {
          result.newGameOver = true;
          result.newMessage = 'All 15 agents contacted! You win!';
          result.turnShouldEnd = true; 
      }
      
      result.newGameOver = result.newGameOver || prev.gameOver;

      return {
        ...prev,
        revealedStates: newRevealedStates,
        gameOver: result.newGameOver,
        gameMessage: result.newMessage,
        guessesMadeForClue: newGuessesMade,
        totalGreensFound: updatedTotalGreensFound,
        activeClue: result.newGameOver ? null : prev.activeClue,
      };
    });
    return result;
  }, [setGameState]);

  const checkWinOrLossCondition = useCallback(() => {
    // This function relies on gameState, so ensure it's checked.
    if (!gameState || gameState.gameOver) return true;

    const revealedGreenCount = gameState.revealedStates.filter(s => s === 'green').length;

    if (revealedGreenCount === TOTAL_UNIQUE_GREEN_AGENTS) {
      setGameState(prev => prev ? { ...prev, gameOver: true, gameMessage: 'All 15 agents contacted! You win!', activeClue: null } : null);
      return true;
    }
    if (gameState.timerTokens <= 0) {
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

  const handleCardClick = useCallback(async (id: number) => {
    if (!gameState || gameState.gameOver || !gameState.activeClue || gameState.revealedStates[id] !== 'hidden' || gameState.isAIClueLoading || gameState.isAIGuessing) return;
    if (gameState.currentTurn !== 'ai_clue') return; 

    const { turnShouldEnd, useTokenOnTurnEnd, newMessage, newGameOver } = processReveal(id, 'human');
    toast({ title: "Guess Result", description: newMessage });

    if (newGameOver) return;
    if (turnShouldEnd) {
      endPlayerTurn(useTokenOnTurnEnd);
    }
  }, [gameState, processReveal, endPlayerTurn, toast]);

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
            activeClue: null,
            guessesMadeForClue: 0,
        } : null);
        endPlayerTurn(false); 
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
      } : null);
      toast({ title: "AI Clue", description: `${aiClueResponse.clueWord.toUpperCase()} - ${aiClueResponse.clueNumber}. Reasoning: ${aiClueResponse.reasoning || 'N/A'}` });

    } catch (error) {
      console.error("Error generating AI clue:", error);
      toast({ title: "AI Error", description: "Could not generate AI clue.", variant: "destructive" });
      setGameState(prev => prev ? { ...prev, isAIClueLoading: false, gameMessage: "Error getting AI clue. Your turn to give a clue or try AI again." } : null);
    }
  }, [gameState, toast, setGameState, endPlayerTurn]);

  const handleAIGuesses = useCallback(async (clue: Clue) => {
    if (!gameState || gameState.gameOver) return;

    setGameState(prev => prev ? { ...prev, isAIGuessing: true, gameMessage: `AI is considering guesses for your clue: ${clue.word.toUpperCase()} ${clue.count}...` } : null);
    
    // Use a local copy of gameState for this async operation to avoid stale closures
    const currentGS = JSON.parse(JSON.stringify(gameState)); 
    const aiPerspectiveKey = getPerspective(currentGS.keyCardSetup, 'ai');
    const aiUnrevealedGreenWords = currentGS.gridWords.filter((word: string, i: number) => aiPerspectiveKey[i] === 'GREEN' && currentGS.revealedStates[i] === 'hidden');
    const aiUnrevealedAssassinWords = currentGS.gridWords.filter((word: string, i: number) => aiPerspectiveKey[i] === 'ASSASSIN' && currentGS.revealedStates[i] === 'hidden');
    const revealedWordsList = currentGS.gridWords.filter((_: string, i: number) => currentGS.revealedStates[i] !== 'hidden');

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
        // Update gameMessage through setGameState for proper reactivity
        setGameState(prev => prev ? {...prev, gameMessage: "AI passes."} : null);
        endPlayerTurn(true); 
      } else {
        let turnEndedMidGuess = false;
        let tokenUsedForTurnEnd = false;
        let gameEndedMidGuess = false;

        for (const guessedWord of aiGuessResponse.guessedWords) {
          // Re-fetch gameState inside the loop IF processReveal doesn't update it synchronously enough
          // For now, we assume processReveal updates are reflected before the next iteration or endPlayerTurn call
          const cardId = currentGS.gridWords.indexOf(guessedWord);
          
          // Check against the potentially updated revealedStates from a previous guess in this loop
          let latestGameState = gameState; // Read fresh gameState before check
          if (cardId === -1 || (latestGameState && latestGameState.revealedStates[cardId] !== 'hidden')) {
            continue;
          }

          await delay(1000); 
          const revealResult = processReveal(cardId, 'ai');
          toast({title: `AI Guesses: ${guessedWord.toUpperCase()}`, description: revealResult.newMessage});
          
          // Important: checkWinOrLossCondition might update gameOver state based on revealResult
          // Re-check gameState for gameOver after processReveal
          latestGameState = gameState; // Refresh gameState
          if (latestGameState && latestGameState.gameOver) {
             gameEndedMidGuess = true;
             break;
          }

          if (revealResult.turnShouldEnd) {
            turnEndedMidGuess = true;
            tokenUsedForTurnEnd = revealResult.useTokenOnTurnEnd;
            break;
          }
        }
        
        // Ensure game over state is checked before deciding to end turn
        const finalGameState = gameState; // get the latest state
        if (finalGameState && !finalGameState.gameOver) { 
             endPlayerTurn(turnEndedMidGuess ? tokenUsedForTurnEnd : false);
        }
      }
    } catch (error) {
      console.error("Error during AI guessing:", error);
      toast({ title: "AI Error", description: "AI had trouble making a guess. Turn passes.", variant: "destructive" });
      endPlayerTurn(true); 
    } finally {
      setGameState(prev => prev ? { ...prev, isAIGuessing: false } : null);
    }
  }, [gameState, toast, processReveal, endPlayerTurn, setGameState]);

  const handleHumanClueSubmit = useCallback((clue: Clue) => {
    if (!gameState || gameState.gameOver || gameState.isAIGuessing || gameState.isAIClueLoading) return;
    
    setGameState(prev => prev ? {
      ...prev,
      activeClue: clue,
      currentTurn: 'human_clue', // Explicitly keep it human_clue, AI will guess under this turn
      gameMessage: `Your Clue: ${clue.word.toUpperCase()} for ${clue.count}. AI is now 'guessing'.`,
      guessesMadeForClue: 0, 
    } : null);
    handleAIGuesses(clue);
  }, [gameState, setGameState, handleAIGuesses]);
  
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
  
  const guessesLeftForThisClue = gameState.activeClue && gameState.activeClue.count >= 0 ? 
    Math.max(0, (gameState.activeClue.count === 0 ? 1 : gameState.activeClue.count + 1) - gameState.guessesMadeForClue) 
    : 0;

  const isHumanPlayerTurnToGuess = 
    gameState.currentTurn === 'ai_clue' && 
    !!gameState.activeClue && 
    !gameState.gameOver && 
    !gameState.isAIClueLoading && 
    !gameState.isAIGuessing &&
    guessesLeftForThisClue > 0; // Added this condition

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
        isPlayerTurnToGuess={isHumanPlayerTurnToGuess}
        guessesLeftForClue={guessesLeftForThisClue}
      />

      <GameBoard
        cards={wordCardsData}
        onCardClick={handleCardClick}
        isClickableForHuman={isHumanPlayerTurnToGuess} // Uses the refined condition
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


