
"use client";

import type React from 'react';
import { useState, useEffect, useCallback } from 'react';
import GameBoard from '@/components/GameBoard';
import ControlsPanel from '@/components/ControlsPanel';
import GameEndModal from '@/components/GameEndModal';
import { initializeGameState, getPerspective, countRemainingGreens } from '@/lib/game-logic';
import type { GameState, WordCardData, Clue, PlayerTurn, CardType, RevealedState, GuesserType } from '@/types';
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

interface SuddenDeathRevealResult {
    newGameOver: boolean;
    newMessage: string;
    isWin: boolean;
}

export default function CodenamesDuetPage() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const { toast } = useToast();

  const resetGame = useCallback(() => {
    setGameState(initializeGameState());
  }, []);

  useEffect(() => {
    resetGame();
  }, [resetGame]);

 useEffect(() => {
    if (gameState && !gameState.gameOver && !gameState.inSuddenDeath) {
        const revealedGreenCount = gameState.revealedStates.filter(s => s === 'green').length;
        if (revealedGreenCount === TOTAL_UNIQUE_GREEN_AGENTS) {
            setGameState(prev => prev ? { ...prev, gameOver: true, gameMessage: 'All 15 agents contacted! You win!', activeClue: null } : null);
        }
    }
  }, [gameState]);


  const endPlayerTurn = useCallback((useTimerToken: boolean) => {
    setGameState(prev => {
      if (!prev || prev.gameOver || prev.inSuddenDeath) return prev;

      const currentTotalGreensFound = prev.revealedStates.filter(s => s === 'green').length;
      let gameShouldBeOver = prev.gameOver;
      let finalMessage = prev.gameMessage;
      let enteringSuddenDeath = false;

      const newTimerTokens = useTimerToken ? Math.max(0, prev.timerTokens - 1) : prev.timerTokens;

      if (currentTotalGreensFound === TOTAL_UNIQUE_GREEN_AGENTS) {
        gameShouldBeOver = true;
        finalMessage = 'All 15 agents contacted! You win!';
      } else if (newTimerTokens <= 0 && !gameShouldBeOver) {
        if (!prev.revealedStates.includes('assassin')) {
            enteringSuddenDeath = true;
            finalMessage = "Timer exhausted! Entering Sudden Death! Players now try to guess THEIR OWN agents.";
        } else if (!gameShouldBeOver) {
            gameShouldBeOver = true;
            finalMessage = prev.gameMessage; // Keep existing game over message if an assassin was hit earlier
        }
      }

      if (gameShouldBeOver && !enteringSuddenDeath) {
        return {
            ...prev,
            gameOver: true,
            gameMessage: finalMessage,
            activeClue: null,
            timerTokens: newTimerTokens,
            humanClueGuessingConcluded: false,
            inSuddenDeath: false,
            suddenDeathGuesser: null,
        };
      }

      if (enteringSuddenDeath) {
        let nextSuddenDeathGuesser: GuesserType | null = null;
        const humanCanGuess = countRemainingGreens(getPerspective(prev.keyCardSetup, 'human'), prev.revealedStates) > 0;
        const aiCanGuess = countRemainingGreens(getPerspective(prev.keyCardSetup, 'ai'), prev.revealedStates) > 0;

        // Order of guessing in sudden death: if AI gave last clue, human was guessing, so human goes first in SD if able.
        // If human gave last clue, AI was guessing, so AI goes first in SD if able.
        if (prev.currentTurn === 'ai_clue') { // Human was guessing (AI gave last clue)
            if (humanCanGuess) nextSuddenDeathGuesser = 'human';
            else if (aiCanGuess) nextSuddenDeathGuesser = 'ai';
        } else { // AI was guessing (Human gave last clue)
            if (aiCanGuess) nextSuddenDeathGuesser = 'ai';
            else if (humanCanGuess) nextSuddenDeathGuesser = 'human';
        }
        
        if (!humanCanGuess && !aiCanGuess && currentTotalGreensFound < TOTAL_UNIQUE_GREEN_AGENTS) {
             return {
                ...prev,
                gameOver: true,
                gameMessage: "Out of time and no agents left for either player in Sudden Death. You lose.",
                timerTokens: 0,
                activeClue: null,
                inSuddenDeath: false,
                suddenDeathGuesser: null,
             }
        }

        let suddenDeathStartMessage = finalMessage;
        if (nextSuddenDeathGuesser) {
            suddenDeathStartMessage += ` ${nextSuddenDeathGuesser === 'human' ? 'Your' : 'AI\'s'} turn to pick one of YOUR/ITS OWN agents.`;
        } else {
            if (currentTotalGreensFound === TOTAL_UNIQUE_GREEN_AGENTS) {
                 return {...prev, gameOver: true, gameMessage: "All agents found as timer ran out! You win!", timerTokens:0, inSuddenDeath: false, activeClue: null}
            }
            // This case means someone hit an assassin when timer was already 0, or some other rare edge case.
            return {...prev, gameOver: true, gameMessage: "Timer ran out & no valid guesser for Sudden Death. You lose.", timerTokens:0, inSuddenDeath: false, activeClue: null};
        }

        return {
            ...prev,
            timerTokens: 0,
            gameOver: false,
            inSuddenDeath: true,
            suddenDeathGuesser: nextSuddenDeathGuesser,
            activeClue: null,
            guessesMadeForClue: 0,
            gameMessage: suddenDeathStartMessage,
            humanClueGuessingConcluded: false, // Reset for sudden death
            currentTurn: prev.currentTurn, 
        };
      }

      // Normal turn transition
      const nextTurnPlayer = prev.currentTurn === 'human_clue' ? 'ai_clue' : 'human_clue';
      return {
        ...prev,
        currentTurn: nextTurnPlayer,
        activeClue: null,
        guessesMadeForClue: 0,
        timerTokens: newTimerTokens,
        gameMessage: `${nextTurnPlayer === 'ai_clue' ? "AI's" : "Your"} turn to give a clue.`,
        humanClueGuessingConcluded: false,
        inSuddenDeath: false,
        suddenDeathGuesser: null,
      };
    });
  }, [setGameState]);


  const processReveal = useCallback((cardId: number, perspectiveOfGuesser: GuesserType): RevealResult => {
    let result: RevealResult = { turnShouldEnd: false, useTokenOnTurnEnd: false, correctGuess: false, newGameOver: false, newMessage: "" };
    setGameState(prev => {
      if (!prev || prev.gameOver || prev.inSuddenDeath || prev.revealedStates[cardId] !== 'hidden') {
          if (prev && prev.revealedStates[cardId] !== 'hidden') {
              result.newMessage = `${prev.gridWords[cardId].toUpperCase()} was already revealed.`;
          } else if (prev && prev.gameOver) {
              result.newMessage = "Game is over.";
          } else if (prev && prev.inSuddenDeath) {
              // This should not happen as processSuddenDeathReveal should be called instead
              result.newMessage = "In Sudden Death mode, specific rules apply.";
          }
          return prev;
      }

      const { activeClue, keyCardSetup, revealedStates: currentRevealedStates, guessesMadeForClue, gridWords, currentTurn } = prev;

      // In normal play, the card's identity is determined by the CLUE-GIVER's key card.
      const clueGiverPlayerType = currentTurn === 'ai_clue' ? 'ai' : 'human';
      const cardIdentityOnClueGiverSide = keyCardSetup[cardId][clueGiverPlayerType];


      const clueGiverName = clueGiverPlayerType === 'ai' ? 'The AI' : 'You (Human)';
      const guesserName = perspectiveOfGuesser === 'human' ? 'You (Human)' : 'The AI';

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
              result.newMessage += ` Max guesses for this clue reached by ${guesserName}.`;
              if (perspectiveOfGuesser === 'human') newHumanClueGuessingConcluded = true;
            } else if (activeClue.count === 0 && perspectiveOfGuesser === 'ai' && newGuessesMade >=1 ) {
                result.turnShouldEnd = true;
                 result.newMessage += ` AI made its one guess for clue '0'.`;
            } else if (activeClue.count === 0 && perspectiveOfGuesser === 'human' && newGuessesMade >=1 && !result.newGameOver){
                 result.newMessage += ` You can make another guess for clue '0'.`;
            }
             else {
              result.newMessage += ` ${guesserName} can make another guess.`;
            }
        }
      } else { // BYSTANDER
        newRevealedStates[cardId] = perspectiveOfGuesser === 'human' ? 'bystander_human_turn' : 'bystander_ai_turn';
        result.newMessage = `Bystander. ${gridWords[cardId].toUpperCase()} was a bystander for ${clueGiverName} (the clue giver). Turn ends for ${guesserName}.`;
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


  const processSuddenDeathReveal = useCallback((cardId: number, guesser: GuesserType): SuddenDeathRevealResult => {
    let result: SuddenDeathRevealResult = { newGameOver: false, newMessage: "", isWin: false };
    setGameState(prev => {
        if (!prev || !prev.inSuddenDeath || prev.gameOver || prev.revealedStates[cardId] !== 'hidden') {
            result.newMessage = prev?.revealedStates[cardId] !== 'hidden' ? "Card already revealed." : "Invalid state for sudden death reveal.";
            return prev;
        }

        const { keyCardSetup, revealedStates: currentRevealedStates, gridWords } = prev;
        // In SUDDEN DEATH, the card's identity is determined by the GUESSER'S key card.
        const cardIdentityOnGuessersKey = keyCardSetup[cardId][guesser];
        const newRevealedStates = [...currentRevealedStates];
        let nextSuddenDeathGuesser: GuesserType | null = null;
        let currentGuesserAgentsLeft = countRemainingGreens(getPerspective(keyCardSetup, guesser), newRevealedStates);


        if (cardIdentityOnGuessersKey === 'ASSASSIN' || cardIdentityOnGuessersKey === 'BYSTANDER') {
            newRevealedStates[cardId] = cardIdentityOnGuessersKey === 'ASSASSIN' ? 'assassin' : (guesser === 'human' ? 'bystander_human_turn' : 'bystander_ai_turn');
            result.newGameOver = true;
            result.newMessage = `Sudden Death: ${guesser.toUpperCase()} hit a ${cardIdentityOnGuessersKey.toLowerCase()} (${gridWords[cardId].toUpperCase()}) on THEIR OWN key! You lose.`;
            result.isWin = false;
        } else { // GREEN for the guesser
            newRevealedStates[cardId] = 'green';
            const newTotalGreensFound = newRevealedStates.filter(s => s === 'green').length;
            // After reveal, re-count for the current guesser
            currentGuesserAgentsLeft = countRemainingGreens(getPerspective(keyCardSetup, guesser), newRevealedStates);
            result.newMessage = `Sudden Death: Correct! ${gridWords[cardId].toUpperCase()} was one of ${guesser.toUpperCase()}'s agents.`;

            if (newTotalGreensFound === TOTAL_UNIQUE_GREEN_AGENTS) {
                result.newGameOver = true;
                result.newMessage = "All agents contacted in Sudden Death! You win!";
                result.isWin = true;
            } else {
                const otherPlayer = guesser === 'human' ? 'ai' : 'human';
                const humanCanStillGuessSD = countRemainingGreens(getPerspective(keyCardSetup, 'human'), newRevealedStates) > 0;
                const aiCanStillGuessSD = countRemainingGreens(getPerspective(keyCardSetup, 'ai'), newRevealedStates) > 0;

                if (otherPlayer === 'ai' && aiCanStillGuessSD) {
                    nextSuddenDeathGuesser = 'ai';
                    result.newMessage += ` AI's turn to pick one of ITS OWN agents.`;
                } else if (otherPlayer === 'human' && humanCanStillGuessSD) {
                    nextSuddenDeathGuesser = 'human';
                    result.newMessage += ` Your turn to pick one of YOUR OWN agents.`;
                } else if (guesser === 'ai' && aiCanStillGuessSD) { // Current player (AI) can go again if other can't AND they still have agents
                    nextSuddenDeathGuesser = 'ai';
                    result.newMessage += ` AI has more agents. AI's turn again.`;
                } else if (guesser === 'human' && humanCanStillGuessSD) { // Current player (Human) can go again if other can't AND they still have agents
                    nextSuddenDeathGuesser = 'human';
                    result.newMessage += ` You have more agents. Your turn again.`;
                } else { // No one has agents left, or the current guesser cleared their list and the other player has none.
                    result.newGameOver = true; // Not all 15 agents found
                    result.newMessage = "Sudden Death: No more agents left to guess for either player, but not all 15 found. You lose.";
                    if (newTotalGreensFound === TOTAL_UNIQUE_GREEN_AGENTS) { // Should have been caught above, but for safety
                        result.newMessage = "All agents found in Sudden Death! You win!";
                        result.isWin = true;
                    } else {
                       result.isWin = false;
                    }
                }
            }
        }
        
        return {
            ...prev,
            revealedStates: newRevealedStates,
            gameOver: result.newGameOver,
            gameMessage: result.newMessage,
            totalGreensFound: newRevealedStates.filter(s => s === 'green').length,
            suddenDeathGuesser: result.newGameOver ? null : nextSuddenDeathGuesser,
            activeClue: null, 
        };
    });
    return result;
  }, [setGameState]);


  const handleAIClueGeneration = useCallback(async () => {
    if (!gameState || gameState.gameOver || gameState.inSuddenDeath) {
      toast({ title: "Game Info", description: "Cannot generate AI clue at this time.", variant: "default" });
      return;
    }
    if (!gameState) {
      toast({ title: "AI Error", description: "Failed to get current game state for AI clue.", variant: "destructive" });
      setGameState(prev => prev ? { ...prev, isAIClueLoading: false } : null);
      return;
    }

    setGameState(prev => prev ? { ...prev, isAIClueLoading: true, gameMessage: "AI is thinking of a clue..." } : null);

    try {
      const aiPerspectiveKey = getPerspective(gameState.keyCardSetup, 'ai');
      const humanPerspectiveKey = getPerspective(gameState.keyCardSetup, 'human'); 

      const unrevealedAIGreens = gameState.gridWords.filter((word, i) =>
        aiPerspectiveKey[i] === 'GREEN' && gameState.revealedStates[i] === 'hidden'
      );
      const humanAssassinsOnBoard = gameState.gridWords.filter((word, i) => 
        humanPerspectiveKey[i] === 'ASSASSIN' && gameState.revealedStates[i] === 'hidden'
      );

      if (unrevealedAIGreens.length === 0) {
        toast({ title: "AI Info", description: "AI has no more green words to give clues for. AI passes clue giving." });
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
        assassinWords: humanAssassinsOnBoard, 
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
      setGameState(prev => prev ? { ...prev, isAIClueLoading: false, gameMessage: "Error getting AI clue. Try AI again or if issue persists, restart." } : null);
    }
  }, [gameState, toast, setGameState, endPlayerTurn]);


  const handleAIGuesses = useCallback(async (clueForAI?: Clue) => {
    const currentProcessingGameState = gameState; 

    if (!currentProcessingGameState || currentProcessingGameState.gameOver || currentProcessingGameState.isAIGuessing || (currentProcessingGameState.inSuddenDeath && currentProcessingGameState.suddenDeathGuesser !== 'ai')) {
      if (currentProcessingGameState && currentProcessingGameState.isAIGuessing) {
        toast({ title: "AI Action Blocked", description: "AI is already processing guesses.", variant: "default" });
      } else if (currentProcessingGameState && (currentProcessingGameState.gameOver || (currentProcessingGameState.inSuddenDeath && currentProcessingGameState.suddenDeathGuesser !== 'ai'))) {
        toast({ title: "AI Action Blocked", description: "AI cannot guess at this time (game over or not AI's turn in sudden death).", variant: "default" });
      } else if (!currentProcessingGameState) {
        toast({ title: "Game Error", description: "Game state not available for AI guess.", variant: "destructive" });
      }
      if (currentProcessingGameState) setGameState(prev => prev ? { ...prev, isAIGuessing: false } : null);
      return;
    }
    
    setGameState(prevGS => {
      if (!prevGS) return null;
      return {
        ...prevGS,
        isAIGuessing: true,
        gameMessage: prevGS.inSuddenDeath ? "AI is picking one of ITS OWN agents for Sudden Death..." : `AI is considering guesses for your clue: ${clueForAI?.word.toUpperCase()} ${clueForAI?.count}...`
      }
    });
        
    const aiPerspectiveKey = getPerspective(currentProcessingGameState.keyCardSetup, 'ai');
    const aiUnrevealedGreenWords = currentProcessingGameState.gridWords.filter((word, i) => aiPerspectiveKey[i] === 'GREEN' && currentProcessingGameState.revealedStates[i] === 'hidden');
    const aiUnrevealedAssassinWords = currentProcessingGameState.gridWords.filter((word, i) => aiPerspectiveKey[i] === 'ASSASSIN' && currentProcessingGameState.revealedStates[i] === 'hidden');
    const revealedWordsList = currentProcessingGameState.gridWords.filter((_, i) => currentProcessingGameState.revealedStates[i] !== 'hidden');

    try {
      const guessInput = currentProcessingGameState.inSuddenDeath ? {
        clueWord: "FIND_GREEN_AGENT_SUDDEN_DEATH",
        clueNumber: 1,
        gridWords: currentProcessingGameState.gridWords,
        aiGreenWords: aiUnrevealedGreenWords, 
        aiAssassinWords: aiUnrevealedAssassinWords, 
        revealedWords: revealedWordsList,
      } : {
        clueWord: clueForAI!.word, 
        clueNumber: clueForAI!.count,
        gridWords: currentProcessingGameState.gridWords,
        aiGreenWords: aiUnrevealedGreenWords, 
        aiAssassinWords: aiUnrevealedAssassinWords, 
        revealedWords: revealedWordsList,
      };

      const aiGuessResponse = await generateAiGuess(guessInput);

      toast({title: currentProcessingGameState.inSuddenDeath ? "AI Sudden Death Analysis" : "AI Analyzing", description: `AI intends to guess: ${aiGuessResponse.guessedWords.join(', ') || "Pass"}. Reasoning: ${aiGuessResponse.reasoning || 'N/A'}`});

      if (!aiGuessResponse.guessedWords || aiGuessResponse.guessedWords.length === 0) {
        toast({ title: "AI Action: Pass", description: `AI decided to pass. Reasoning: ${aiGuessResponse.reasoning || 'No specific reason given.'}` });
        
        setGameState(prev => {
          if(!prev) return null;
          let updatedState = {...prev, gameMessage: `AI passes. ${aiGuessResponse.reasoning || ''}`, isAIGuessing: false};
           if (prev.inSuddenDeath) { 
              const humanCanStillGuessSD = countRemainingGreens(getPerspective(prev.keyCardSetup, 'human'), prev.revealedStates) > 0;
              if (humanCanStillGuessSD) {
                  updatedState.suddenDeathGuesser = 'human';
                  updatedState.gameMessage = "AI passes in Sudden Death. Your turn to pick one of YOUR OWN agents.";
              } else { 
                  updatedState.gameOver = true;
                  updatedState.gameMessage = "AI passes in Sudden Death, and Human has no agents left. You lose.";
              }
           }
           return updatedState;
        });
        
        if (!currentProcessingGameState.inSuddenDeath && !currentProcessingGameState.gameOver) { 
            endPlayerTurn(true); 
        }
        return;
      }

      let gameEndedByAI = false;
      let turnEndedForAINormalPlay = false; 

      const guessesToProcess = currentProcessingGameState.inSuddenDeath ? aiGuessResponse.guessedWords.slice(0,1) : aiGuessResponse.guessedWords;

      for (const guessedWord of guessesToProcess) {
        const cardId = currentProcessingGameState.gridWords.indexOf(guessedWord);
        if (cardId === -1) {
          toast({ title: "AI Error", description: `AI tried to guess '${guessedWord}', which is not on the board. Skipping.`});
          continue;
        }
        
        // This check is crucial: if game state became null for any reason, abort.
        if (!gameState) {
          toast({ title: "Critical Error", description: "Game state lost during AI guess processing.", variant: "destructive" });
          // Attempt a safe state reset or clear isAIGuessing
          setGameState(prev => prev ? { ...prev, isAIGuessing: false, gameOver: true, gameMessage: "Critical error during AI guess." } : initializeGameState());
          return; // Abort further processing
        }


        await delay(1500); 
        
        let revealResult: RevealResult | SuddenDeathRevealResult;
        let messageToToast: string;

        if (currentProcessingGameState.inSuddenDeath) {
            revealResult = processSuddenDeathReveal(cardId, 'ai');
            messageToToast = `AI Sudden Death Guess (${guessedWord.toUpperCase()}): ${revealResult.newMessage}`;
            if ((revealResult as SuddenDeathRevealResult).newGameOver) {
                gameEndedByAI = true; 
            }
             // AI only gets one guess in sudden death.
            toast({title: "AI Sudden Death Action", description: messageToToast});
            break;
        } else { 
            revealResult = processReveal(cardId, 'ai');
            messageToToast = `AI Guesses (${guessedWord.toUpperCase()}): ${revealResult.newMessage}`;
            if ((revealResult as RevealResult).newGameOver) {
               gameEndedByAI = true;
            }
            toast({title: "AI Normal Guess Action", description: messageToToast});
            if ((revealResult as RevealResult).turnShouldEnd || (revealResult as RevealResult).newGameOver) {
              turnEndedForAINormalPlay = true;
              break; 
            }
        }
      } 
      
      setGameState(prev => {
          if(!prev) return null;
          // Only update isAIGuessing if game not over. If it IS over, keep isAIGuessing as is or false.
          // Game over state would be set by processReveal/processSuddenDeathReveal.
          return { ...prev, isAIGuessing: prev.gameOver ? false : false };
      });
      
      if (!currentProcessingGameState.inSuddenDeath && !gameEndedByAI) {
           endPlayerTurn(true); 
      }

    } catch (error) {
      console.error("Error during AI guessing:", error);
      toast({ title: "AI Error", description: "AI had trouble making a guess. Turn may pass.", variant: "destructive" });
      
      const wasInSuddenDeathOnError = currentProcessingGameState.inSuddenDeath;
      
      setGameState(prev => {
          if (!prev) return null;
          let updatedState = { ...prev, isAIGuessing: false };
          if (wasInSuddenDeathOnError) {
            const humanCanStillGuessSD = countRemainingGreens(getPerspective(updatedState.keyCardSetup, 'human'), updatedState.revealedStates) > 0;
            if (humanCanStillGuessSD) {
                updatedState.suddenDeathGuesser = 'human';
                updatedState.gameMessage = "AI error in Sudden Death. Your turn to pick one of YOUR OWN agents.";
            } else {
                updatedState.gameOver = true;
                updatedState.gameMessage = "AI error in Sudden Death, and Human has no agents left. You lose.";
            }
          } else {
            updatedState.gameMessage = "AI error during guessing. AI passes its turn.";
          }
          return updatedState;
      });
      
      if (!wasInSuddenDeathOnError && !currentProcessingGameState.gameOver) {
          endPlayerTurn(true);
      }
    }
  }, [gameState, toast, processReveal, processSuddenDeathReveal, endPlayerTurn, setGameState]);


  const handleHumanClueSubmit = useCallback((clue: Clue) => {
    if (!gameState || gameState.gameOver || gameState.inSuddenDeath || gameState.isAIGuessing || gameState.isAIClueLoading) {
      toast({ title: "Action Blocked", description: "Cannot submit clue at this time."});
      return;
    }
    if (gameState.currentTurn !== 'human_clue' || gameState.activeClue) {
        toast({ title: "Action Blocked", description: "Not your turn to give a clue, or a clue is already active."});
        return;
    }
    if (gameState.gridWords.map(w => w.toUpperCase()).includes(clue.word.toUpperCase())) {
      toast({ title: "Invalid Clue", description: "Clue word cannot be one of the words on the board.", variant: "destructive" });
      return;
    }

    setGameState(prev => {
        if (!prev) return null;
        return {
            ...prev,
            activeClue: clue,
            gameMessage: `Your Clue: ${clue.word.toUpperCase()} for ${clue.count}. AI is now guessing.`,
            guessesMadeForClue: 0, 
            humanClueGuessingConcluded: false, 
        };
    });
  }, [gameState, setGameState, toast]);

  useEffect(() => {
    if (gameState && gameState.currentTurn === 'human_clue' && gameState.activeClue && !gameState.isAIGuessing && !gameState.gameOver && !gameState.inSuddenDeath) {
        handleAIGuesses(gameState.activeClue);
    }
  }, [gameState, handleAIGuesses]); 

  useEffect(() => {
    if (gameState && gameState.inSuddenDeath && gameState.suddenDeathGuesser === 'ai' && !gameState.isAIGuessing && !gameState.gameOver) {
        handleAIGuesses(); 
    }
  }, [gameState, handleAIGuesses]); 


  const handleCardClick = useCallback(async (id: number) => {
    if (!gameState || gameState.gameOver || gameState.revealedStates[id] !== 'hidden' || gameState.isAIClueLoading || gameState.isAIGuessing) {
      return;
    }

    if (gameState.inSuddenDeath) {
        if (gameState.suddenDeathGuesser !== 'human') {
            toast({ title: "Sudden Death", description: "Not your turn to guess." });
            return;
        }
        const sdRevealResult = processSuddenDeathReveal(id, 'human');
        toast({ title: "Sudden Death Guess", description: sdRevealResult.newMessage });
        return;
    }

    if (gameState.currentTurn !== 'ai_clue' || !gameState.activeClue || gameState.humanClueGuessingConcluded) {
      toast({ title: "Game Info", description: "Not your turn to guess or guessing phase for this clue is over." });
      return;
    }

    const currentGuessesMade = gameState.guessesMadeForClue;
    const clueCount = gameState.activeClue.count;
    const maxGuessesThisClue = clueCount === 0 ? Infinity : clueCount + 1;


    if (currentGuessesMade >= maxGuessesThisClue && clueCount !== 0) {
      toast({ title: "Max Guesses", description: "You've reached the maximum guesses for this clue." });
      setGameState(prev => prev ? {...prev, humanClueGuessingConcluded: true} : null);
      return;
    }

    const { newMessage } = processReveal(id, 'human');
    toast({ title: "Guess Result", description: newMessage });

  }, [gameState, processReveal, processSuddenDeathReveal, toast, setGameState]);

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

  const guessesLeftForThisClue = gameState.activeClue && gameState.currentTurn === 'ai_clue' && !gameState.humanClueGuessingConcluded && !gameState.inSuddenDeath && !gameState.gameOver ?
    Math.max(0, (gameState.activeClue.count === 0 ? Infinity : gameState.activeClue.count + 1) - gameState.guessesMadeForClue)
    : 0;

  const isHumanCurrentlyGuessingPhase =
    gameState.currentTurn === 'ai_clue' &&
    !!gameState.activeClue &&
    !gameState.gameOver &&
    !gameState.isAIClueLoading &&
    !gameState.isAIGuessing &&
    !gameState.inSuddenDeath;

  const isClickableForHumanNormalPlay = isHumanCurrentlyGuessingPhase && !gameState.humanClueGuessingConcluded && guessesLeftForThisClue > 0;
  
  const canHumanVoluntarilyEndGuessing = isHumanCurrentlyGuessingPhase && !gameState.humanClueGuessingConcluded && guessesLeftForThisClue > 0 && gameState.guessesMadeForClue > 0;
  
  const mustHumanConfirmTurnEnd = isHumanCurrentlyGuessingPhase && gameState.humanClueGuessingConcluded;

  const isClickableForHumanSuddenDeath = gameState.inSuddenDeath && gameState.suddenDeathGuesser === 'human' && !gameState.gameOver;
  
  const isBoardClickableForHuman = isClickableForHumanNormalPlay || isClickableForHumanSuddenDeath;


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
        inSuddenDeath={gameState.inSuddenDeath}
        suddenDeathGuesser={gameState.suddenDeathGuesser}
        gameOver={gameState.gameOver}
      />

      <GameBoard
        cards={wordCardsData}
        onCardClick={handleCardClick}
        isClickableForHuman={isBoardClickableForHuman}
      />

      <Button
        variant="outline"
        onClick={resetGame}
        className="mt-4"
        disabled={gameState.isAIClueLoading || gameState.isAIGuessing} 
      >
        <RefreshCw className="mr-2 h-4 w-4" /> Restart Game
      </Button>

      <GameEndModal
        isOpen={gameState.gameOver}
        message={gameState.gameMessage}
        isWin={gameState.totalGreensFound === TOTAL_UNIQUE_GREEN_AGENTS && gameState.gameOver && (gameState.gameMessage.toLowerCase().includes("win") || gameState.gameMessage.toLowerCase().includes("all agents contacted") || gameState.gameMessage.toLowerCase().includes("all agents found"))}
        onPlayAgain={resetGame}
      />
    </div>
  );
}

