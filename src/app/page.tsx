
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
            finalMessage = "Timer exhausted! Entering Sudden Death round!";
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

        if (prev.currentTurn === 'ai_clue') { // Human was guessing, AI gave clue. Next SD guesser prioritizes human.
            if (humanCanGuess) nextSuddenDeathGuesser = 'human';
            else if (aiCanGuess) nextSuddenDeathGuesser = 'ai';
        } else { // AI was guessing, Human gave clue. Next SD guesser prioritizes AI.
            if (aiCanGuess) nextSuddenDeathGuesser = 'ai';
            else if (humanCanGuess) nextSuddenDeathGuesser = 'human';
        }
        
        if (!humanCanGuess && !aiCanGuess && currentTotalGreensFound < TOTAL_UNIQUE_GREEN_AGENTS) {
             return {
                ...prev,
                gameOver: true,
                gameMessage: "Out of time and no agents left to guess for either player in Sudden Death. You lose.",
                timerTokens: 0,
                activeClue: null,
                inSuddenDeath: false,
                suddenDeathGuesser: null,
             }
        }

        let suddenDeathStartMessage = finalMessage;
        if (nextSuddenDeathGuesser) {
            suddenDeathStartMessage += ` ${nextSuddenDeathGuesser === 'human' ? 'Your' : 'AI\'s'} turn to guess.`;
        } else {
            if (currentTotalGreensFound === TOTAL_UNIQUE_GREEN_AGENTS) {
                 return {...prev, gameOver: true, gameMessage: "All agents found as timer ran out! You win!", timerTokens:0, inSuddenDeath: false, activeClue: null}
            }
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
            currentTurn: prev.currentTurn, // Keep current turn to help decide SD guesser order
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
              result.newMessage = "In Sudden Death mode, different rules apply.";
          }
          return prev;
      }

      const { activeClue, keyCardSetup, revealedStates: currentRevealedStates, guessesMadeForClue, gridWords, currentTurn } = prev;

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
        result.turnShouldEnd = true; // Turn ends, game over
        if (perspectiveOfGuesser === 'human') newHumanClueGuessingConcluded = true;
      } else if (cardIdentityOnClueGiverSide === 'GREEN') {
        newRevealedStates[cardId] = 'green';
        result.correctGuess = true;
        result.newMessage = `Correct! ${gridWords[cardId].toUpperCase()} was an agent for ${clueGiverName} (the clue giver).`;

        if (activeClue) {
            const maxGuessesAllowed = activeClue.count === 0 ? (perspectiveOfGuesser === 'human' ? Infinity : 1) : activeClue.count + 1; // Human gets unlimited on 0, AI gets 1
            if (newGuessesMade >= maxGuessesAllowed && activeClue.count !==0) {
              result.turnShouldEnd = true;
              result.newMessage += ` Max guesses for this clue reached by ${guesserName}.`;
              if (perspectiveOfGuesser === 'human') newHumanClueGuessingConcluded = true;
            } else if (activeClue.count === 0 && perspectiveOfGuesser === 'ai' && newGuessesMade >=1 ) { // AI specifically gets 1 guess on clue 0
                result.turnShouldEnd = true;
                 result.newMessage += ` AI made its one guess for clue '0'.`;
            } else if (activeClue.count === 0 && perspectiveOfGuesser === 'human' && newGuessesMade >=1 && !result.newGameOver){
                 // Human continues on clue 0 until wrong or pass
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
        result.useTokenOnTurnEnd = true; // Bystander always uses a token
        if (perspectiveOfGuesser === 'human') newHumanClueGuessingConcluded = true;
      }

      const updatedTotalGreensFound = newRevealedStates.filter(s => s === 'green').length;

      if (!result.newGameOver && updatedTotalGreensFound === TOTAL_UNIQUE_GREEN_AGENTS) {
          result.newGameOver = true;
          result.newMessage = 'All 15 agents contacted! You win!';
          result.turnShouldEnd = true; // Game over, so turn ends
          if (perspectiveOfGuesser === 'human') newHumanClueGuessingConcluded = true;
      }
      result.newGameOver = result.newGameOver || prev.gameOver; // Ensure game over state persists

      return {
        ...prev,
        revealedStates: newRevealedStates,
        gameOver: result.newGameOver,
        gameMessage: result.newMessage,
        guessesMadeForClue: newGuessesMade,
        totalGreensFound: updatedTotalGreensFound,
        humanClueGuessingConcluded: newHumanClueGuessingConcluded,
        activeClue: result.newGameOver ? null : prev.activeClue, // Clear active clue if game over
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

        const { keyCardSetup, revealedStates: currentRevealedStates, gridWords, totalGreensFound: prevTotalGreens } = prev;
        const cardIdentityOnGuessersKey = keyCardSetup[cardId][guesser]; // In SD, it's about the GUESSER'S key
        const newRevealedStates = [...currentRevealedStates];
        let nextSuddenDeathGuesser: GuesserType | null = null;

        if (cardIdentityOnGuessersKey === 'ASSASSIN' || cardIdentityOnGuessersKey === 'BYSTANDER') {
            newRevealedStates[cardId] = cardIdentityOnGuessersKey === 'ASSASSIN' ? 'assassin' : (guesser === 'human' ? 'bystander_human_turn' : 'bystander_ai_turn');
            result.newGameOver = true;
            result.newMessage = `Sudden Death: ${guesser.toUpperCase()} hit a ${cardIdentityOnGuessersKey.toLowerCase()} (${gridWords[cardId].toUpperCase()})! You lose.`;
            result.isWin = false;
        } else { // GREEN for the guesser
            newRevealedStates[cardId] = 'green';
            const newTotalGreensFound = newRevealedStates.filter(s => s === 'green').length;
            result.newMessage = `Sudden Death: Correct! ${gridWords[cardId].toUpperCase()} was an agent for ${guesser.toUpperCase()}.`;

            if (newTotalGreensFound === TOTAL_UNIQUE_GREEN_AGENTS) {
                result.newGameOver = true;
                result.newMessage = "All agents contacted in Sudden Death! You win!";
                result.isWin = true;
            } else {
                // Determine next guesser: other player if they can, otherwise current player if they can, else game over
                const otherPlayer = guesser === 'human' ? 'ai' : 'human';
                const humanCanStillGuessSD = countRemainingGreens(getPerspective(keyCardSetup, 'human'), newRevealedStates) > 0;
                const aiCanStillGuessSD = countRemainingGreens(getPerspective(keyCardSetup, 'ai'), newRevealedStates) > 0;

                if (otherPlayer === 'ai' && aiCanStillGuessSD) {
                    nextSuddenDeathGuesser = 'ai';
                } else if (otherPlayer === 'human' && humanCanStillGuessSD) {
                    nextSuddenDeathGuesser = 'human';
                } else if (guesser === 'ai' && aiCanStillGuessSD) { // Current player (AI) can go again if other can't
                    nextSuddenDeathGuesser = 'ai';
                } else if (guesser === 'human' && humanCanStillGuessSD) { // Current player (Human) can go again if other can't
                    nextSuddenDeathGuesser = 'human';
                } else {
                    result.newGameOver = true; // No one can guess, but not all agents found
                    result.newMessage = "Sudden Death: All available agents guessed by players, but not all 15 found. You lose.";
                    result.isWin = false;
                }
                
                if (nextSuddenDeathGuesser && !result.newGameOver) {
                    result.newMessage += ` ${nextSuddenDeathGuesser === 'human' ? 'Your' : 'AI\'s'} turn to guess.`;
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
            activeClue: null, // No active clue in sudden death
        };
    });
    return result;
  }, [setGameState]);


  const handleAIClueGeneration = useCallback(async () => {
    if (!gameState || gameState.gameOver || gameState.inSuddenDeath) {
      toast({ title: "Game Info", description: "Cannot generate AI clue at this time.", variant: "default" });
      return;
    }
    // Use gameState directly from closure
    if (!gameState) { // Should be caught by above, but as a safeguard
      toast({ title: "AI Error", description: "Failed to get current game state for AI clue.", variant: "destructive" });
      return;
    }

    setGameState(prev => prev ? { ...prev, isAIClueLoading: true, gameMessage: "AI is thinking of a clue..." } : null);

    try {
      const aiPerspectiveKey = getPerspective(gameState.keyCardSetup, 'ai');
      const humanPerspectiveKey = getPerspective(gameState.keyCardSetup, 'human'); // Clue giver needs to know guesser's assassins

      const unrevealedAIGreens = gameState.gridWords.filter((word, i) =>
        aiPerspectiveKey[i] === 'GREEN' && gameState.revealedStates[i] === 'hidden'
      );
      const humanAssassinsOnBoard = gameState.gridWords.filter((word, i) => // These are assassins for the HUMAN (guesser)
        humanPerspectiveKey[i] === 'ASSASSIN' && gameState.revealedStates[i] === 'hidden'
      );

      if (unrevealedAIGreens.length === 0) {
        toast({ title: "AI Info", description: "AI has no more green words to give clues for. AI passes clue giving." });
         setGameState(prev => prev ? {
            ...prev,
            isAIClueLoading: false,
            activeClue: null, // No clue given
            guessesMadeForClue: 0,
            humanClueGuessingConcluded: false, // Reset for human's turn
        } : null);
        endPlayerTurn(false); // AI passes clue giving, no token used as no "guessing turn" happened
        return;
      }

      const aiClueResponse = await generateAIClue({
        grid: gameState.gridWords,
        greenWords: unrevealedAIGreens, // AI's own green words it wants to hint at
        assassinWords: humanAssassinsOnBoard, // Assassins for the human guesser
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
    // Use gameState directly from closure. This is the state when this callback was created or last updated.
    if (!gameState || gameState.gameOver || gameState.isAIGuessing || (gameState.inSuddenDeath && gameState.suddenDeathGuesser !== 'ai')) {
      if (gameState && gameState.isAIGuessing) {
        toast({ title: "AI Action Blocked", description: "AI is already processing guesses.", variant: "default" });
      } else if (gameState && (gameState.gameOver || (gameState.inSuddenDeath && gameState.suddenDeathGuesser !== 'ai'))) {
        toast({ title: "AI Action Blocked", description: "AI cannot guess at this time (game over or not AI's turn in sudden death).", variant: "default" });
      } else if (!gameState) {
        toast({ title: "Game Error", description: "Game state not available for AI guess.", variant: "destructive" });
      }
      if (gameState) setGameState(prev => prev ? { ...prev, isAIGuessing: false } : null); // Ensure isAIGuessing is false if blocked
      return;
    }
    
    const currentProcessingGameState = gameState; // Capture for use in this async operation

    setGameState(prevGS => {
      if (!prevGS) return null;
      return {
        ...prevGS,
        isAIGuessing: true,
        gameMessage: prevGS.inSuddenDeath ? "AI is making a Sudden Death guess..." : `AI is considering guesses for your clue: ${clueForAI?.word.toUpperCase()} ${clueForAI?.count}...`
      }
    });
        
    // Perspective keys are based on the stable currentProcessingGameState.keyCardSetup
    const aiPerspectiveKey = getPerspective(currentProcessingGameState.keyCardSetup, 'ai');
    // Filter words based on currentProcessingGameState.revealedStates
    const aiUnrevealedGreenWords = currentProcessingGameState.gridWords.filter((word, i) => aiPerspectiveKey[i] === 'GREEN' && currentProcessingGameState.revealedStates[i] === 'hidden');
    const aiUnrevealedAssassinWords = currentProcessingGameState.gridWords.filter((word, i) => aiPerspectiveKey[i] === 'ASSASSIN' && currentProcessingGameState.revealedStates[i] === 'hidden');
    const revealedWordsList = currentProcessingGameState.gridWords.filter((_, i) => currentProcessingGameState.revealedStates[i] !== 'hidden');

    try {
      const guessInput = currentProcessingGameState.inSuddenDeath ? {
        clueWord: "FIND_GREEN_AGENT_SUDDEN_DEATH",
        clueNumber: 1,
        gridWords: currentProcessingGameState.gridWords,
        aiGreenWords: aiUnrevealedGreenWords, // AI's own greens for SD
        aiAssassinWords: aiUnrevealedAssassinWords, // AI's own assassins for SD
        revealedWords: revealedWordsList,
      } : {
        clueWord: clueForAI!.word, // Clue from human
        clueNumber: clueForAI!.count,
        gridWords: currentProcessingGameState.gridWords,
        aiGreenWords: aiUnrevealedGreenWords, // For AI's general awareness
        aiAssassinWords: aiUnrevealedAssassinWords, // AI's own assassins it must be cautious about
        revealedWords: revealedWordsList,
      };

      const aiGuessResponse = await generateAiGuess(guessInput);

      toast({title: currentProcessingGameState.inSuddenDeath ? "AI Sudden Death Analysis" : "AI Analyzing", description: `AI intends to guess: ${aiGuessResponse.guessedWords.join(', ') || "Pass"}. Reasoning: ${aiGuessResponse.reasoning || 'N/A'}`});

      if (!aiGuessResponse.guessedWords || aiGuessResponse.guessedWords.length === 0) {
        toast({ title: "AI Action: Pass", description: `AI decided to pass. Reasoning: ${aiGuessResponse.reasoning || 'No specific reason given.'}` });
        
        setGameState(prev => {
          if(!prev) return null;
          let updatedState = {...prev, gameMessage: `AI passes. ${aiGuessResponse.reasoning || ''}`, isAIGuessing: false};
           if (prev.inSuddenDeath) { // AI passed in Sudden Death
              const humanCanStillGuessSD = countRemainingGreens(getPerspective(prev.keyCardSetup, 'human'), prev.revealedStates) > 0;
              if (humanCanStillGuessSD) {
                  updatedState.suddenDeathGuesser = 'human';
                  updatedState.gameMessage = "AI passes in Sudden Death. Your turn to guess.";
              } else { // No one can guess
                  updatedState.gameOver = true;
                  updatedState.gameMessage = "AI passes in Sudden Death, no agents left for human. You lose.";
              }
           }
           return updatedState;
        });
        
        // If AI passes in normal play, the turn should still end and use a token.
        if (!currentProcessingGameState.inSuddenDeath && !currentProcessingGameState.gameOver) { // Check gameOver from currentProcessingGameState
            endPlayerTurn(true); // Pass uses a token
        }
        return;
      }

      let gameEndedByAI = false;
      let turnEndedForAINormalPlay = false; // Flag if a specific reveal ends the turn (bystander, max guesses)

      // For sudden death, AI only gets one guess.
      const guessesToProcess = currentProcessingGameState.inSuddenDeath ? aiGuessResponse.guessedWords.slice(0,1) : aiGuessResponse.guessedWords;

      for (const guessedWord of guessesToProcess) {
        const cardId = currentProcessingGameState.gridWords.indexOf(guessedWord);
        if (cardId === -1) {
          toast({ title: "AI Error", description: `AI tried to guess '${guessedWord}', which is not on the board. Skipping.`});
          continue;
        }
        
        // Check if the game ended from a previous guess in this loop or if turn ended for AI
        // This check is done at the START of the iteration
        // However, gameEndedByAI and turnEndedForAINormalPlay are updated AFTER processReveal/processSuddenDeathReveal
        // This means the loop always runs at least once if guessesToProcess is not empty.
        // The BREAK condition needs to be AFTER the reveal processing.

        await delay(1500); // Delay before each reveal
        
        if (currentProcessingGameState.inSuddenDeath) {
            const sdRevealResult = processSuddenDeathReveal(cardId, 'ai');
            toast({title: `AI Sudden Death Guess: ${guessedWord.toUpperCase()}`, description: sdRevealResult.newMessage});
            if (sdRevealResult.newGameOver) {
                gameEndedByAI = true; // Mark game as ended by AI
            }
            break; // AI only gets one guess in sudden death, so always break after the first processed guess.
        } else { 
            // Normal play reveal
            const revealResult = processReveal(cardId, 'ai');
            toast({title: `AI Guesses: ${guessedWord.toUpperCase()}`, description: revealResult.newMessage});

            if (revealResult.newGameOver) {
               gameEndedByAI = true;
            }
            // If the reveal itself says the turn should end (assassin, bystander, or max guesses for AI)
            // or if the game is now over, AI should stop guessing further.
            if (revealResult.turnShouldEnd || revealResult.newGameOver) {
              turnEndedForAINormalPlay = true; // Mark that AI's guessing phase for this clue is done.
                                             // This also covers game over scenario for loop breaking.
              break; // Stop processing more guesses from aiGuessResponse.guessedWords
            }
        }
      } // End of for...of loop for AI guesses
      
      // Reset isAIGuessing after the loop finishes or breaks
      setGameState(prev => {
          if(!prev) return null;
          return { ...prev, isAIGuessing: false };
      });
      
      // End AI's turn (normal play)
      // A token is used if its normal turn concluded (guesses made, or passed after clue) AND game not over
      // If gameEndedByAI is true, it means an assassin was hit, game is over, no further turn processing.
      if (!currentProcessingGameState.inSuddenDeath && !gameEndedByAI) {
           endPlayerTurn(true); // AI's normal turn (whether it made guesses or its turn ended by bystander/max) uses a token
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
                updatedState.gameMessage = "AI error in Sudden Death. Your turn to guess.";
            } else {
                updatedState.gameOver = true;
                updatedState.gameMessage = "AI error in Sudden Death, no agents left for human. You lose.";
            }
          } else {
            updatedState.gameMessage = "AI error during guessing. AI passes its turn.";
          }
          return updatedState;
      });
      
      // If error happened during normal play and game wasn't already over, end the AI's turn with token usage
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
            gameMessage: `Your Clue: ${clue.word.toUpperCase()} for ${clue.count}. AI is now 'guessing'.`,
            guessesMadeForClue: 0, // Reset for AI's turn
            humanClueGuessingConcluded: false, // Not relevant for AI guessing
        };
    });
    // Note: handleAIGuesses will be triggered by the useEffect below that watches for activeClue on human_clue turn.
  }, [gameState, setGameState, toast]);

  useEffect(() => {
    // Trigger AI guesses AFTER human clue is set and state updates.
    if (gameState && gameState.currentTurn === 'human_clue' && gameState.activeClue && !gameState.isAIGuessing && !gameState.gameOver && !gameState.inSuddenDeath) {
        handleAIGuesses(gameState.activeClue);
    }
  }, [gameState, handleAIGuesses]); // gameState.activeClue, gameState.currentTurn, gameState.isAIGuessing are key deps

  useEffect(() => {
    // Trigger AI sudden death guess if it's AI's turn.
    if (gameState && gameState.inSuddenDeath && gameState.suddenDeathGuesser === 'ai' && !gameState.isAIGuessing && !gameState.gameOver) {
        handleAIGuesses(); // No clue passed for sudden death
    }
  }, [gameState, handleAIGuesses]); // gameState.inSuddenDeath, gameState.suddenDeathGuesser are key


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
        // Sudden death reveals are final for that one guess. State updates in processSuddenDeathReveal handle next.
        return;
    }

    // Normal Play Human Guessing
    if (gameState.currentTurn !== 'ai_clue' || !gameState.activeClue || gameState.humanClueGuessingConcluded) {
      toast({ title: "Game Info", description: "Not your turn to guess or guessing phase for this clue is over." });
      return;
    }

    const currentGuessesMade = gameState.guessesMadeForClue;
    const clueCount = gameState.activeClue.count;
    // For clue count 0, human can guess "infinitely" until wrong or pass.
    // For clue count > 0, human can guess up to count + 1.
    const maxGuessesThisClue = clueCount === 0 ? Infinity : clueCount + 1;


    if (currentGuessesMade >= maxGuessesThisClue && clueCount !== 0) {
      toast({ title: "Max Guesses", description: "You've reached the maximum guesses for this clue." });
      setGameState(prev => prev ? {...prev, humanClueGuessingConcluded: true} : null);
      return;
    }

    const { newMessage, turnShouldEnd, useTokenOnTurnEnd, newGameOver } = processReveal(id, 'human');
    toast({ title: "Guess Result", description: newMessage });

    // If the reveal itself indicates the turn/game should end, it's handled by humanClueGuessingConcluded changing,
    // prompting the "End Turn" button. No need to call endPlayerTurn directly here.
    // Game over is handled by setting gameState.gameOver in processReveal.
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

  // How many guesses are left for the human player on the current AI clue
  const guessesLeftForThisClue = gameState.activeClue && gameState.currentTurn === 'ai_clue' && !gameState.humanClueGuessingConcluded && !gameState.inSuddenDeath && !gameState.gameOver ?
    Math.max(0, (gameState.activeClue.count === 0 ? Infinity : gameState.activeClue.count + 1) - gameState.guessesMadeForClue)
    : 0;

  // Is it the human's turn to make guesses in normal play?
  const isHumanCurrentlyGuessingPhase =
    gameState.currentTurn === 'ai_clue' &&
    !!gameState.activeClue &&
    !gameState.gameOver &&
    !gameState.isAIClueLoading &&
    !gameState.isAIGuessing &&
    !gameState.inSuddenDeath;

  // Can human click on the board during normal play? (must be their guessing phase and have guesses left)
  const isClickableForHumanNormalPlay = isHumanCurrentlyGuessingPhase && !gameState.humanClueGuessingConcluded && guessesLeftForThisClue > 0;
  
  // Can human voluntarily end their guessing phase? (must have made at least one guess)
  const canHumanVoluntarilyEndGuessing = isHumanCurrentlyGuessingPhase && !gameState.humanClueGuessingConcluded && guessesLeftForThisClue > 0 && gameState.guessesMadeForClue > 0;
  
  // Must human confirm to end their turn? (e.g., after hitting bystander/assassin or max guesses)
  const mustHumanConfirmTurnEnd = isHumanCurrentlyGuessingPhase && gameState.humanClueGuessingConcluded;

  // Can human click on the board during sudden death?
  const isClickableForHumanSuddenDeath = gameState.inSuddenDeath && gameState.suddenDeathGuesser === 'human' && !gameState.gameOver;
  
  // Overall condition for board clickability for human
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
        onEndTurn={() => endPlayerTurn(true)} // Always use a token when turn is ended via this button
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
        disabled={gameState.isAIClueLoading || gameState.isAIGuessing} // Disable restart if AI is busy
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

