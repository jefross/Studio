
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
  useTokenOnTurnEnd: boolean; // For normal play bystander
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

  // This useEffect handles game over conditions that are not directly tied to a player action,
  // like winning by revealing the last agent.
 useEffect(() => {
    if (gameState && !gameState.gameOver && !gameState.inSuddenDeath) {
        const revealedGreenCount = gameState.revealedStates.filter(s => s === 'green').length;
        if (revealedGreenCount === TOTAL_UNIQUE_GREEN_AGENTS) {
            setGameState(prev => prev ? { ...prev, gameOver: true, gameMessage: 'All 15 agents contacted! You win!', activeClue: null } : null);
        }
        // Loss by running out of tokens (and not in sudden death yet) is handled in endPlayerTurn
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
        // Timer depleted, game not won, and not lost by assassin. Enter Sudden Death.
        if (!prev.revealedStates.includes('assassin')) {
            enteringSuddenDeath = true;
            finalMessage = "Timer exhausted! Entering Sudden Death round!";
            // gameOver remains false for sudden death phase
        } else if (!gameShouldBeOver) { // Timer depleted and already lost by assassin (should be caught by processReveal)
            gameShouldBeOver = true; // Or this state is already set
            finalMessage = prev.gameMessage; // Keep assassin message
        }
      }

      if (gameShouldBeOver && !enteringSuddenDeath) {
        return {
            ...prev,
            gameOver: true,
            gameMessage: finalMessage,
            activeClue: null,
            timerTokens: newTimerTokens, // Show final token count
            humanClueGuessingConcluded: false,
            inSuddenDeath: false, // Ensure not in sudden death if game over normally
            suddenDeathGuesser: null,
        };
      }

      if (enteringSuddenDeath) {
        let nextSuddenDeathGuesser: GuesserType | null = null;
        const humanCanGuess = countRemainingGreens(getPerspective(prev.keyCardSetup, 'human'), prev.revealedStates) > 0;
        const aiCanGuess = countRemainingGreens(getPerspective(prev.keyCardSetup, 'ai'), prev.revealedStates) > 0;

        // Determine who starts sudden death based on whose turn it would have been to guess
        if (prev.currentTurn === 'ai_clue') { // Human was to guess
            if (humanCanGuess) nextSuddenDeathGuesser = 'human';
            else if (aiCanGuess) nextSuddenDeathGuesser = 'ai';
        } else { // AI was to guess (prev.currentTurn === 'human_clue')
            if (aiCanGuess) nextSuddenDeathGuesser = 'ai';
            else if (humanCanGuess) nextSuddenDeathGuesser = 'human';
        }
        
        // If after all that, no one can guess, it's a loss (should have been caught by agent count check)
        if (!humanCanGuess && !aiCanGuess && currentTotalGreensFound < TOTAL_UNIQUE_GREEN_AGENTS) {
             return {
                ...prev,
                gameOver: true,
                gameMessage: "Out of time and no agents left to guess for either player. You lose.",
                timerTokens: 0,
                activeClue: null,
                inSuddenDeath: false, // Not entering SD if it's an immediate loss
                suddenDeathGuesser: null,
             }
        }


        let suddenDeathStartMessage = finalMessage;
        if (nextSuddenDeathGuesser) {
            suddenDeathStartMessage += ` ${nextSuddenDeathGuesser === 'human' ? 'Your' : 'AI\'s'} turn to guess.`;
        } else {
            // This case implies all findable agents are found, or a win/loss should have been declared.
            // If all agents found, it's a win. Otherwise, if tokens are 0 and agents remain, it's a loss.
            // This should ideally be handled by the win check before sudden death logic.
            if (currentTotalGreensFound === TOTAL_UNIQUE_GREEN_AGENTS) {
                 return {...prev, gameOver: true, gameMessage: "All agents found as timer ran out! You win!", timerTokens:0, inSuddenDeath: false, activeClue: null}
            }
            return {...prev, gameOver: true, gameMessage: "Timer ran out & no valid guesser for Sudden Death. You lose.", timerTokens:0, inSuddenDeath: false, activeClue: null};
        }

        return {
            ...prev,
            timerTokens: 0,
            gameOver: false, // Game continues in sudden death phase
            inSuddenDeath: true,
            suddenDeathGuesser: nextSuddenDeathGuesser,
            activeClue: null, // No clues in sudden death
            guessesMadeForClue: 0,
            gameMessage: suddenDeathStartMessage,
            humanClueGuessingConcluded: false, // Reset
            currentTurn: prev.currentTurn, // Keep to know who would have given clue, not strictly needed for SD
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
        inSuddenDeath: false, // Ensure this is false for normal turn ends
        suddenDeathGuesser: null,
      };
    });
  }, [setGameState]);


  const processReveal = useCallback((cardId: number, perspectiveOfGuesser: GuesserType): RevealResult => {
    // This function is for REGULAR play, not sudden death.
    // Card identity is based on the CLUE GIVER's key card.
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

      const clueGiverPerspective = currentTurn === 'ai_clue' ? 'ai' : 'human'; // If AI gave clue (ai_clue turn), human is guessing, use AI key.
      const cardIdentityOnClueGiverSide = keyCardSetup[cardId][clueGiverPerspective];

      const clueGiverName = clueGiverPerspective === 'ai' ? 'the AI' : 'you';
      const guesserName = perspectiveOfGuesser === 'human' ? 'You' : 'The AI';

      const newRevealedStates = [...currentRevealedStates];
      let newGuessesMade = guessesMadeForClue + 1;
      let newHumanClueGuessingConcluded = prev.humanClueGuessingConcluded;

      if (cardIdentityOnClueGiverSide === 'ASSASSIN') {
        newRevealedStates[cardId] = 'assassin';
        result.newMessage = `${guesserName} hit an ASSASSIN! (${gridWords[cardId].toUpperCase()}) Game Over! This was an assassin for ${clueGiverName} (the clue giver).`;
        result.newGameOver = true;
        result.turnShouldEnd = true; // Assassin always ends turn/game
        if (perspectiveOfGuesser === 'human') newHumanClueGuessingConcluded = true;
      } else if (cardIdentityOnClueGiverSide === 'GREEN') {
        newRevealedStates[cardId] = 'green';
        result.correctGuess = true;
        result.newMessage = `Correct! ${gridWords[cardId].toUpperCase()} was an agent for ${clueGiverName} (the clue giver).`;

        if (activeClue) {
            const maxGuessesAllowed = activeClue.count === 0 ? (perspectiveOfGuesser === 'human' ? Infinity : 1) : activeClue.count + 1;
            if (newGuessesMade >= maxGuessesAllowed && activeClue.count !==0) { // For clue 0, human can guess infinitely if correct. AI only 1.
              result.turnShouldEnd = true;
              result.newMessage += ` Max guesses for this clue reached by ${perspectiveOfGuesser}.`;
              if (perspectiveOfGuesser === 'human') newHumanClueGuessingConcluded = true;
            } else if (activeClue.count === 0 && perspectiveOfGuesser === 'ai' && newGuessesMade >=1 ) {
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


  const processSuddenDeathReveal = useCallback((cardId: number, guesser: GuesserType): SuddenDeathRevealResult => {
    let result: SuddenDeathRevealResult = { newGameOver: false, newMessage: "", isWin: false };
    setGameState(prev => {
        if (!prev || !prev.inSuddenDeath || prev.gameOver || prev.revealedStates[cardId] !== 'hidden') {
            result.newMessage = prev?.revealedStates[cardId] !== 'hidden' ? "Card already revealed." : "Invalid state for sudden death reveal.";
            return prev;
        }

        const { keyCardSetup, revealedStates: currentRevealedStates, gridWords } = prev;
        const cardIdentityOnGuessersKey = keyCardSetup[cardId][guesser];
        const newRevealedStates = [...currentRevealedStates];
        let nextSuddenDeathGuesser: GuesserType | null = null;

        if (cardIdentityOnGuessersKey === 'ASSASSIN' || cardIdentityOnGuessersKey === 'BYSTANDER') {
            newRevealedStates[cardId] = cardIdentityOnGuessersKey === 'ASSASSIN' ? 'assassin' : (guesser === 'human' ? 'bystander_human_turn' : 'bystander_ai_turn');
            result.newGameOver = true;
            result.newMessage = `Sudden Death: ${guesser.toUpperCase()} hit a ${cardIdentityOnGuessersKey.toLowerCase()} (${gridWords[cardId].toUpperCase()})! You lose.`;
            result.isWin = false;
        } else { // GREEN
            newRevealedStates[cardId] = 'green';
            const newTotalGreensFound = newRevealedStates.filter(s => s === 'green').length;
            result.newMessage = `Sudden Death: Correct! ${gridWords[cardId].toUpperCase()} was an agent for ${guesser.toUpperCase()}.`;

            if (newTotalGreensFound === TOTAL_UNIQUE_GREEN_AGENTS) {
                result.newGameOver = true;
                result.newMessage = "All agents contacted in Sudden Death! You win!";
                result.isWin = true;
            } else {
                // Determine next guesser
                const otherPlayer = guesser === 'human' ? 'ai' : 'human';
                const humanCanStillGuess = countRemainingGreens(getPerspective(keyCardSetup, 'human'), newRevealedStates) > 0;
                const aiCanStillGuess = countRemainingGreens(getPerspective(keyCardSetup, 'ai'), newRevealedStates) > 0;

                if (otherPlayer === 'ai' && aiCanStillGuess) {
                    nextSuddenDeathGuesser = 'ai';
                } else if (otherPlayer === 'human' && humanCanStillGuess) {
                    nextSuddenDeathGuesser = 'human';
                } else if (guesser === 'ai' && aiCanStillGuess) { // Current guesser (AI) can go again if human can't
                    nextSuddenDeathGuesser = 'ai';
                } else if (guesser === 'human' && humanCanStillGuess) { // Current guesser (human) can go again if AI can't
                    nextSuddenDeathGuesser = 'human';
                } else { // No one left to guess, but not all agents found
                    result.newGameOver = true;
                    result.newMessage = "Sudden Death: All available agents guessed, but not all 15 found. You lose.";
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
            activeClue: null, // no active clue in SD
        };
    });
    return result;
  }, [setGameState]);


  const handleAIClueGeneration = useCallback(async () => {
    if (!gameState || gameState.gameOver || gameState.inSuddenDeath) {
      toast({ title: "Game Info", description: "Cannot generate AI clue at this time.", variant: "default" });
      return;
    }
    setGameState(prev => prev ? { ...prev, isAIClueLoading: true, gameMessage: "AI is thinking of a clue..." } : null);

    try {
      // AI needs to know which words are green for itself (clue giver)
      // and which words are assassins for the human (guesser)
      const aiPerspectiveKey = getPerspective(gameState.keyCardSetup, 'ai');
      const humanPerspectiveKey = getPerspective(gameState.keyCardSetup, 'human');

      const unrevealedAIGreens = gameState.gridWords.filter((word, i) =>
        aiPerspectiveKey[i] === 'GREEN' && gameState.revealedStates[i] === 'hidden'
      );
      const humanAssassins = gameState.gridWords.filter((word, i) =>
        humanPerspectiveKey[i] === 'ASSASSIN' && gameState.revealedStates[i] === 'hidden'
      );

      if (unrevealedAIGreens.length === 0) {
        toast({ title: "AI Info", description: "AI has no more green words to give clues for. AI passes clue." });
         setGameState(prev => prev ? {
            ...prev,
            isAIClueLoading: false,
            activeClue: null,
            guessesMadeForClue: 0,
            humanClueGuessingConcluded: false,
        } : null);
        endPlayerTurn(false); // AI passing clue does not use a token
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
      setGameState(prev => prev ? { ...prev, isAIClueLoading: false, gameMessage: "Error getting AI clue. Try AI again or if issue persists, restart." } : null);
    }
  }, [gameState, toast, setGameState, endPlayerTurn]);


  const handleAIGuesses = useCallback(async (clueForAI?: Clue) => { // clueForAI is from human
    // This function handles AI guessing in NORMAL play and initiates AI guess in SUDDEN DEATH.
    if (!gameState) {
        toast({ title: "Game Error", description: "Game state not available for AI guess.", variant: "destructive" });
        return;
    }
    if (gameState.gameOver || gameState.isAIGuessing) {
      toast({ title: "AI Action Blocked", description: "AI cannot guess at this time (game over or already guessing).", variant: "default" });
      setGameState(prev => prev ? { ...prev, isAIGuessing: false } : null);
      return;
    }
    
    if (gameState.inSuddenDeath && gameState.suddenDeathGuesser !== 'ai') {
        toast({ title: "Game Info", description: "Not AI's turn to guess in Sudden Death.", variant: "default" });
        return;
    }


    setGameState(prevGS => ({
      ...prevGS!,
      isAIGuessing: true,
      gameMessage: gameState.inSuddenDeath ? "AI is making a Sudden Death guess..." : `AI is considering guesses for your clue: ${clueForAI?.word.toUpperCase()} ${clueForAI?.count}...`
    }));
    
    // AI needs to know its own green and assassin words FOR ITS OWN KEY.
    // For normal play, it's guessing on human's clue (human is clue giver).
    // For sudden death, it's just trying to find its own greens.
    const aiPerspectiveKey = getPerspective(gameState.keyCardSetup, 'ai');
    const aiUnrevealedGreenWords = gameState.gridWords.filter((word, i) => aiPerspectiveKey[i] === 'GREEN' && gameState.revealedStates[i] === 'hidden');
    const aiUnrevealedAssassinWords = gameState.gridWords.filter((word, i) => aiPerspectiveKey[i] === 'ASSASSIN' && gameState.revealedStates[i] === 'hidden');
    const revealedWordsList = gameState.gridWords.filter((_, i) => gameState.revealedStates[i] !== 'hidden');

    try {
      // For sudden death, AI just needs to pick one of its green words.
      // For normal play, it uses the human's clue.
      const guessInput = gameState.inSuddenDeath ? {
        clueWord: "FIND_GREEN_AGENT_SUDDEN_DEATH", // Special instruction
        clueNumber: 1, // Pick one
        gridWords: gameState.gridWords,
        aiGreenWords: aiUnrevealedGreenWords, // AI's own greens are targets
        aiAssassinWords: aiUnrevealedAssassinWords, // AI's own assassins to avoid
        revealedWords: revealedWordsList,
      } : {
        clueWord: clueForAI!.word,
        clueNumber: clueForAI!.count,
        gridWords: gameState.gridWords,
        // AI refers to its own assassins (self-preservation), but targets based on human's clue.
        // The prompt guides it to understand human's likely targets.
        aiGreenWords: aiUnrevealedGreenWords, 
        aiAssassinWords: aiUnrevealedAssassinWords,
        revealedWords: revealedWordsList,
      };

      const aiGuessResponse = await generateAiGuess(guessInput);

      toast({title: gameState.inSuddenDeath ? "AI Sudden Death Analysis" : "AI Analyzing", description: `AI intends to guess: ${aiGuessResponse.guessedWords.join(', ') || "Pass"}. Reasoning: ${aiGuessResponse.reasoning || 'N/A'}`});

      if (!aiGuessResponse.guessedWords || aiGuessResponse.guessedWords.length === 0) {
        toast({ title: "AI Action: Pass", description: `AI decided to pass. Reasoning: ${aiGuessResponse.reasoning || 'No specific reason given.'}` });
        setGameState(prev => prev ? {...prev, gameMessage: `AI passes. ${aiGuessResponse.reasoning || ''}`, isAIGuessing: false} : null);
        if (!gameState.inSuddenDeath) {
            endPlayerTurn(true); // AI passes guess in normal play, token used
        } else {
            // In Sudden Death, passing means AI has no more valid moves or thinks risk is too high.
            // This should lead to a loss if agents are remaining.
            // Or switch to human if AI has no words left but human does.
             setGameState(prev => {
                if (!prev) return null;
                const humanCanStillGuessSD = countRemainingGreens(getPerspective(prev.keyCardSetup, 'human'), prev.revealedStates) > 0;
                if (humanCanStillGuessSD) {
                    return {...prev, suddenDeathGuesser: 'human', gameMessage: "AI passes in Sudden Death. Your turn to guess.", isAIGuessing: false};
                }
                return {...prev, gameOver: true, gameMessage: "AI passes in Sudden Death, no agents left for human. You lose.", isAIGuessing: false };
            });
        }
        return;
      }

      let gameEndedByAI = false;
      let turnEndedForAINormalPlay = false;
      let tokenUsedForAIsTurnNormalPlay = false;

      // In sudden death, AI only makes one guess per its "turn"
      const guessesToProcess = gameState.inSuddenDeath ? aiGuessResponse.guessedWords.slice(0,1) : aiGuessResponse.guessedWords;

      for (const guessedWord of guessesToProcess) {
        const cardId = gameState.gridWords.indexOf(guessedWord);
        if (cardId === -1) {
          toast({ title: "AI Error", description: `AI tried to guess '${guessedWord}', which is not on the board. Skipping.`});
          continue;
        }
        
        await delay(1500); 
        
        if (gameState.inSuddenDeath) {
            const sdRevealResult = processSuddenDeathReveal(cardId, 'ai');
            toast({title: `AI Sudden Death Guess: ${guessedWord.toUpperCase()}`, description: sdRevealResult.newMessage});
            if (sdRevealResult.newGameOver) {
                gameEndedByAI = true; // Game ended (win or loss)
            }
            // Loop breaks after one guess in sudden death regardless of outcome (unless game over)
            // The nextSuddenDeathGuesser is set by processSuddenDeathReveal
            break; 
        } else { // Normal Play
            const revealResult = processReveal(cardId, 'ai');
            toast({title: `AI Guesses: ${guessedWord.toUpperCase()}`, description: revealResult.newMessage});

            if (revealResult.newGameOver) {
               gameEndedByAI = true;
               break; 
            }
            if (revealResult.turnShouldEnd) {
              turnEndedForAINormalPlay = true;
              tokenUsedForAIsTurnNormalPlay = revealResult.useTokenOnTurnEnd;
              break; 
            }
        }
      }

      setGameState(prev => prev ? { ...prev, isAIGuessing: false } : null);
      
      if (!gameState.inSuddenDeath && !gameEndedByAI) {
           endPlayerTurn(turnEndedForAINormalPlay ? tokenUsedForAIsTurnNormalPlay : true); // AI's turn uses a token if not bystander, or if it was bystander
      }
      // If inSuddenDeath or gameEndedByAI, the state is managed by processSuddenDeathReveal or processReveal

    } catch (error) {
      console.error("Error during AI guessing:", error);
      toast({ title: "AI Error", description: "AI had trouble making a guess. Turn may pass.", variant: "destructive" });
      setGameState(prev => {
          if (!prev) return null;
          const wasInSuddenDeath = prev.inSuddenDeath;
          const updatedState = { ...prev, isAIGuessing: false };
          if (wasInSuddenDeath) { // If error in SD, try to pass to human or lose
            const humanCanStillGuessSD = countRemainingGreens(getPerspective(updatedState.keyCardSetup, 'human'), updatedState.revealedStates) > 0;
            if (humanCanStillGuessSD) {
                updatedState.suddenDeathGuesser = 'human';
                updatedState.gameMessage = "AI error in Sudden Death. Your turn to guess.";
            } else {
                updatedState.gameOver = true;
                updatedState.gameMessage = "AI error in Sudden Death, no agents left for human. You lose.";
            }
            return updatedState;
          }
          return updatedState;
      });
      // Only end normal turn if not in sudden death and game not already over
      if (!gameState?.inSuddenDeath && !gameState?.gameOver) {
          endPlayerTurn(true); // Error during AI normal guess, token used
      }
    }
  }, [gameState, toast, processReveal, processSuddenDeathReveal, endPlayerTurn, setGameState]);


  const handleHumanClueSubmit = useCallback((clue: Clue) => {
    if (!gameState || gameState.gameOver || gameState.inSuddenDeath || gameState.isAIGuessing || gameState.isAIClueLoading) {
      toast({ title: "Action Blocked", description: "Cannot submit clue at this time."});
      return;
    }
    if (gameState.gridWords.map(w => w.toUpperCase()).includes(clue.word.toUpperCase())) {
      toast({ title: "Invalid Clue", description: "Clue word cannot be one of the words on the board.", variant: "destructive" });
      return;
    }

    setGameState(prev => {
        if (!prev) return null; // Should be caught by earlier guard
        return {
            ...prev,
            activeClue: clue,
            currentTurn: 'human_clue', 
            gameMessage: `Your Clue: ${clue.word.toUpperCase()} for ${clue.count}. AI is now 'guessing'.`,
            guessesMadeForClue: 0,
            humanClueGuessingConcluded: false,
        };
    });
    // Use useEffect to call handleAIGuesses when activeClue and currentTurn are right for AI guessing
  }, [setGameState, toast]);

  // Effect to trigger AI guesses when it's AI's turn to guess (after human clue)
  useEffect(() => {
    if (gameState && gameState.currentTurn === 'human_clue' && gameState.activeClue && !gameState.isAIGuessing && !gameState.gameOver && !gameState.inSuddenDeath) {
        handleAIGuesses(gameState.activeClue);
    }
  }, [gameState, handleAIGuesses]); // gameState.activeClue, gameState.currentTurn, gameState.isAIGuessing, gameState.gameOver, gameState.inSuddenDeath are dependencies

  // Effect to trigger AI guess in Sudden Death when it's AI's turn
  useEffect(() => {
    if (gameState && gameState.inSuddenDeath && gameState.suddenDeathGuesser === 'ai' && !gameState.isAIGuessing && !gameState.gameOver) {
        handleAIGuesses(); // No clue needed for sudden death AI guess
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
        // State updates including gameOver and next suddenDeathGuesser are handled by processSuddenDeathReveal
        return;
    }

    // Normal play
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

    const { newMessage, newGameOver, turnShouldEnd, useTokenOnTurnEnd } = processReveal(id, 'human');
    toast({ title: "Guess Result", description: newMessage });

    // processReveal sets humanClueGuessingConcluded, gameOver, activeClue=null if game ends.
    // Player must click "End Turn" button if humanClueGuessingConcluded is true and game is not over.
    if (turnShouldEnd && !newGameOver) {
        // If turn ends due to bystander or max guesses for human, humanClueGuessingConcluded is true.
        // Player then needs to click the End Turn button.
    } else if (newGameOver) {
        // GameEndModal will appear.
    }
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

  const guessesLeftForThisClue = gameState.activeClue && gameState.currentTurn === 'ai_clue' && !gameState.humanClueGuessingConcluded && !gameState.inSuddenDeath ?
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
  const canHumanVoluntarilyEndGuessing = isHumanCurrentlyGuessingPhase && !gameState.humanClueGuessingConcluded && guessesLeftForThisClue > 0;
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
      />

      <GameBoard
        cards={wordCardsData}
        onCardClick={handleCardClick}
        isClickableForHuman={isBoardClickableForHuman}
      />

      <Button variant="outline" onClick={resetGame} className="mt-4">
        <RefreshCw className="mr-2 h-4 w-4" /> Restart Game
      </Button>

      <GameEndModal
        isOpen={gameState.gameOver}
        message={gameState.gameMessage}
        isWin={gameState.totalGreensFound === TOTAL_UNIQUE_GREEN_AGENTS && gameState.gameOver && (gameState.gameMessage.toLowerCase().includes("win") || gameState.gameMessage.toLowerCase().includes("all agents contacted"))}
        onPlayAgain={resetGame}
      />
    </div>
  );
}
