
"use client";

import type React from 'react';
import { useState, useEffect, useCallback } from 'react';
import GameBoard from '@/components/GameBoard';
import ControlsPanel from '@/components/ControlsPanel';
import GameEndModal from '@/components/GameEndModal';
import { initializeGameState, getPerspective, countRemainingGreens } from '@/lib/game-logic';
import type { GameState, WordCardData, Clue } from '@/types';
import { TOTAL_UNIQUE_GREEN_AGENTS } from '@/types';
import { generateClue as generateAIClue } from '@/ai/flows/ai-clue-generator';
import { useToast } from "@/hooks/use-toast";
import { Button } from '@/components/ui/button';
import { RefreshCw, Loader2 } from 'lucide-react';

export default function CodenamesDuetPage() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    setGameState(initializeGameState());
  }, []);

  const resetGame = useCallback(() => {
    setGameState(initializeGameState());
  }, []);

  const checkWinOrLossCondition = useCallback(() => {
    if (!gameState) return false;

    let newGameOver = gameState.gameOver;
    let newMessage = gameState.gameMessage;

    const revealedGreenCount = gameState.revealedStates.filter(s => s === 'green').length;

    if (revealedGreenCount === TOTAL_UNIQUE_GREEN_AGENTS) {
      if (!newGameOver) {
        newGameOver = true;
        newMessage = 'All 15 agents contacted! You win!';
      }
    } else if (gameState.timerTokens <= 0 && !newGameOver) {
      newGameOver = true;
      newMessage = 'Out of time! Not all agents were contacted. You lose.';
    }
    
    if (newGameOver && !gameState.gameOver) { 
      setGameState(prev => prev ? { ...prev, gameOver: true, gameMessage: newMessage, activeClue: null } : null);
    }
    return newGameOver;
  }, [gameState]);


  useEffect(() => {
    if (!gameState || gameState.isAIClueLoading || gameState.gameOver) {
        return;
    }
    checkWinOrLossCondition();
  }, [gameState, checkWinOrLossCondition]);

  const endPlayerTurn = useCallback((useTimerToken: boolean) => {
    setGameState(prev => {
      if (!prev) return null;

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

  const handleAIClueGeneration = useCallback(async () => {
    if (!gameState) {
      toast({ title: "Game Error", description: "Game state not available.", variant: "destructive" });
      return;
    }
    setGameState(prev => prev ? { ...prev, isAIClueLoading: true, gameMessage: "AI is thinking of a clue..." } : null);

    try {
      const aiPerspective = getPerspective(gameState.keyCardSetup, 'ai');
      const unrevealedAIGreens = gameState.gridWords.filter((word, i) => 
        aiPerspective[i] === 'GREEN' && gameState.revealedStates[i] === 'hidden'
      );
      const aiAssassins = gameState.gridWords.filter((word, i) => 
        aiPerspective[i] === 'ASSASSIN' && gameState.revealedStates[i] === 'hidden'
      );

      if (unrevealedAIGreens.length === 0) {
        toast({ title: "AI Info", description: "AI has no more green words to give clues for." });
        setGameState(prev => prev ? { 
            ...prev, 
            isAIClueLoading: false, 
            activeClue: null, 
            gameMessage: "AI passes. Your turn to give a clue.",
            currentTurn: 'human_clue',
            guessesMadeForClue: 0,
        } : null);
        return;
      }

      const aiClue = await generateAIClue({
        grid: gameState.gridWords,
        greenWords: unrevealedAIGreens,
        assassinWords: aiAssassins,
        timerTokens: gameState.timerTokens,
      });
      
      setGameState(prev => prev ? {
        ...prev,
        activeClue: { word: aiClue.clueWord, count: aiClue.clueNumber },
        isAIClueLoading: false,
        gameMessage: `AI's Clue: ${aiClue.clueWord.toUpperCase()} for ${aiClue.clueNumber}. Your turn to guess.`,
        guessesMadeForClue: 0,
      } : null);
      toast({ title: "AI Clue", description: `${aiClue.clueWord.toUpperCase()} - ${aiClue.clueNumber}. Reasoning: ${aiClue.reasoning || 'N/A'}` });

    } catch (error) {
      console.error("Error generating AI clue:", error);
      toast({ title: "AI Error", description: "Could not generate AI clue.", variant: "destructive" });
      setGameState(prev => prev ? { ...prev, isAIClueLoading: false, gameMessage: "Error getting AI clue. Try again or give a clue." } : null);
    }
  }, [gameState, toast, setGameState]);

  const handleHumanClueSubmit = useCallback((clue: Clue) => {
    setGameState(prev => prev ? {
      ...prev,
      activeClue: clue,
      gameMessage: `Your Clue: ${clue.word.toUpperCase()} for ${clue.count}. Click words for AI to 'guess'.`,
      guessesMadeForClue: 0,
    } : null);
  }, [setGameState]);

  const handleCardClick = useCallback((id: number) => {
    if (!gameState || gameState.gameOver || !gameState.activeClue || gameState.revealedStates[id] !== 'hidden' || gameState.isAIClueLoading) return;

    const { currentTurn, activeClue, keyCardSetup, revealedStates: currentRevealedStates, guessesMadeForClue } = gameState;
    
    const perspectiveKey = currentTurn === 'ai_clue' ? 'ai' : 'human';
    const cardIdentityOnClueGiverSide = keyCardSetup[id][perspectiveKey];
    
    const newRevealedStates = [...currentRevealedStates];
    let correctGuess = false;
    let turnShouldEnd = false;
    let newGameMessage = "";
    let newGameOver = false;
    let newGuessesMade = guessesMadeForClue + 1;
    let useTokenOnTurnEnd = false;

    if (cardIdentityOnClueGiverSide === 'ASSASSIN') {
      newRevealedStates[id] = 'assassin';
      newGameMessage = `Assassin hit! ${currentTurn === 'ai_clue' ? 'You' : 'AI'} revealed an assassin. Game Over!`;
      newGameOver = true;
      turnShouldEnd = true;
    } else if (cardIdentityOnClueGiverSide === 'GREEN') {
      newRevealedStates[id] = 'green';
      correctGuess = true;
      newGameMessage = `Correct! ${gameState.gridWords[id].toUpperCase()} is an agent.`;
      if (newGuessesMade >= activeClue.count +1 ) { 
        turnShouldEnd = true;
        newGameMessage += " Max guesses for this clue reached.";
      } else if (newGuessesMade === activeClue.count && activeClue.count > 0) {
        newGameMessage += ` One guess remaining for this clue or end turn.`;
      } else if (activeClue.count === 0 && newGuessesMade === 1) {
        turnShouldEnd = true;
        newGameMessage += " Max guess for this clue (0+1) reached.";
      }
    } else { 
      newRevealedStates[id] = currentTurn === 'ai_clue' ? 'bystander_human_turn' : 'bystander_ai_turn';
      newGameMessage = `Incorrect. ${gameState.gridWords[id].toUpperCase()} is a bystander. Turn ends.`;
      turnShouldEnd = true;
      useTokenOnTurnEnd = true;
    }
    
    const updatedTotalGreensFound = newRevealedStates.filter(s => s === 'green').length;

    setGameState(prev => prev ? {
      ...prev,
      revealedStates: newRevealedStates,
      gameOver: newGameOver,
      gameMessage: newGameMessage,
      guessesMadeForClue: newGuessesMade,
      totalGreensFound: updatedTotalGreensFound,
    } : null);

    if (newGameOver) {
        return; 
    }
    
    if (correctGuess && updatedTotalGreensFound === TOTAL_UNIQUE_GREEN_AGENTS) {
        setGameState(prev => prev ? {
            ...prev,
            gameOver: true,
            gameMessage: 'All 15 agents contacted! You win!',
            activeClue: null,
        } : null);
        return; 
    }

    if (turnShouldEnd) {
      endPlayerTurn(useTokenOnTurnEnd);
    } else if (correctGuess) {
       toast({ title: "Correct!", description: `You can make another guess for this clue (${(activeClue.count + 1) - newGuessesMade} left).`});
    }
  }, [gameState, toast, endPlayerTurn, setGameState]);
  
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

  const isPlayerGuessingPhase = !!gameState.activeClue && !gameState.gameOver && !gameState.isAIClueLoading;
  const isHumanPlayerGuessing = isPlayerGuessingPhase && gameState.currentTurn === 'ai_clue';
  const isAIPlayerGuessing = isPlayerGuessingPhase && gameState.currentTurn === 'human_clue';

  const guessesLeftForThisClue = gameState.activeClue && gameState.activeClue.count >= 0 ? 
    Math.max(0, (gameState.activeClue.count + 1) - gameState.guessesMadeForClue) 
    : 0;

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
        onHumanClueSubmit={handleHumanClueSubmit}
        onGetAIClue={handleAIClueGeneration}
        onEndTurn={() => endPlayerTurn(true)} 
        isGuessingPhase={isPlayerGuessingPhase}
        guessesLeftForClue={guessesLeftForThisClue}
      />

      <GameBoard
        cards={wordCardsData}
        onCardClick={handleCardClick}
        isPlayerGuessing={isHumanPlayerGuessing || isAIPlayerGuessing}
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
