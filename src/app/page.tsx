
"use client";

import type React from 'react';
import { useState, useEffect, useCallback }from 'react';
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
    if (!gameState) {
      resetGame();
    }
  }, [gameState, resetGame]);


  const endPlayerTurn = useCallback((useTimerToken: boolean) => {
    setGameState(prev => {
      if (!prev || prev.gameOver) return prev; 

      const currentTotalGreensFound = prev.revealedStates.filter(s => s === 'green').length;
      let gameShouldBeOver = prev.gameOver;
      let finalMessage = prev.gameMessage;
      let enteringSuddenDeath = prev.inSuddenDeath;


      let newTimerTokens = prev.timerTokens;
      if (!prev.inSuddenDeath && useTimerToken) { 
          newTimerTokens = Math.max(0, prev.timerTokens - 1);
      }
      
      if (currentTotalGreensFound === TOTAL_UNIQUE_GREEN_AGENTS && !gameShouldBeOver) {
        gameShouldBeOver = true;
        finalMessage = 'All 15 agents contacted! You win!';
      } else if (newTimerTokens <= 0 && !prev.inSuddenDeath && !gameShouldBeOver) { 
        if (!prev.revealedStates.includes('assassin')) {
            enteringSuddenDeath = true;
        } else if (!gameShouldBeOver) { 
            gameShouldBeOver = true;
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
        const humanPartnerHasGreensForAIToGuess = countRemainingGreens(getPerspective(prev.keyCardSetup, 'human'), prev.revealedStates) > 0;
        const aiPartnerHasGreensForHumanToGuess = countRemainingGreens(getPerspective(prev.keyCardSetup, 'ai'), prev.revealedStates) > 0;

        if (prev.currentTurn === 'ai_clue') { 
            if (aiPartnerHasGreensForHumanToGuess) nextSuddenDeathGuesser = 'human';
            else if (humanPartnerHasGreensForAIToGuess) nextSuddenDeathGuesser = 'ai';
        } else { 
            if (humanPartnerHasGreensForAIToGuess) nextSuddenDeathGuesser = 'ai';
            else if (aiPartnerHasGreensForHumanToGuess) nextSuddenDeathGuesser = 'human';
        }
        
        if (!nextSuddenDeathGuesser && currentTotalGreensFound < TOTAL_UNIQUE_GREEN_AGENTS) {
             return { 
                ...prev,
                gameOver: true,
                gameMessage: "Timer ran out! No agents left for either player to target in Sudden Death. You lose.",
                timerTokens: 0,
                activeClue: null,
                inSuddenDeath: false,
                suddenDeathGuesser: null,
             }
        }
         if (!nextSuddenDeathGuesser && currentTotalGreensFound === TOTAL_UNIQUE_GREEN_AGENTS) {
             return { 
                ...prev,
                gameOver: true,
                gameMessage: "All agents found as timer ran out! You win!",
                timerTokens: 0,
                inSuddenDeath: false,
                activeClue: null,
                suddenDeathGuesser: null,
             }
        }

        let suddenDeathStartMessage = "Timer exhausted! Entering Sudden Death! No more clues. Players now try to REVEAL THEIR PARTNER'S agents.";
        if (nextSuddenDeathGuesser) {
            suddenDeathStartMessage += ` ${nextSuddenDeathGuesser === 'human' ? 'Your' : 'AI\'s'} turn to make a selection for your partner.`;
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
            humanClueGuessingConcluded: false, 
            currentTurn: prev.currentTurn, 
        };
      }

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
  }, [setGameState, getPerspective]);


  const processReveal = useCallback((cardId: number, guesserPerspective: GuesserType): RevealResult => {
    let result: RevealResult = { turnShouldEnd: false, useTokenOnTurnEnd: false, correctGuess: false, newGameOver: false, newMessage: "" };
    setGameState(prev => {
      if (!prev || prev.gameOver || prev.inSuddenDeath || prev.revealedStates[cardId] !== 'hidden') {
          if (prev && prev.revealedStates[cardId] !== 'hidden') {
              result.newMessage = `${prev.gridWords[cardId].toUpperCase()} was already revealed.`;
          } else if (prev && prev.gameOver) {
              result.newMessage = "Game is over.";
          } else if (prev && prev.inSuddenDeath) {
              result.newMessage = "In Sudden Death mode, specific rules apply for selections.";
          }
          return prev;
      }

      const { activeClue, keyCardSetup, revealedStates: currentRevealedStates, guessesMadeForClue, gridWords, currentTurn } = prev;

      // In NORMAL play, card identity is based on CLUE GIVER'S key
      const clueGiverPlayerType = currentTurn === 'ai_clue' ? 'ai' : 'human';
      const cardIdentityOnClueGiverSide = keyCardSetup[cardId][clueGiverPlayerType];

      const clueGiverName = clueGiverPlayerType === 'ai' ? 'The AI' : 'You (Human)';
      const guesserName = guesserPerspective === 'human' ? 'You (Human)' : 'The AI';

      const newRevealedStates = [...currentRevealedStates];
      let newGuessesMade = guessesMadeForClue + 1;
      let newHumanClueGuessingConcluded = prev.humanClueGuessingConcluded;

      if (cardIdentityOnClueGiverSide === 'ASSASSIN') {
        newRevealedStates[cardId] = 'assassin';
        result.newMessage = `${guesserName} hit an ASSASSIN! (${gridWords[cardId].toUpperCase()}) Game Over! This was an assassin for ${clueGiverName} (the clue giver).`;
        result.newGameOver = true;
        result.turnShouldEnd = true; 
        if (guesserPerspective === 'human') newHumanClueGuessingConcluded = true;
      } else if (cardIdentityOnClueGiverSide === 'GREEN') {
        newRevealedStates[cardId] = 'green';
        result.correctGuess = true;
        result.newMessage = `Correct! ${gridWords[cardId].toUpperCase()} was an agent for ${clueGiverName} (the clue giver).`;

        if (activeClue) {
            const maxGuessesAllowed = activeClue.count === 0 ? (guesserPerspective === 'human' ? Infinity : 1) : activeClue.count + 1;
            if (newGuessesMade >= maxGuessesAllowed && activeClue.count !==0) {
              result.turnShouldEnd = true;
              result.newMessage += ` Max selections for this clue reached by ${guesserName}.`;
              if (guesserPerspective === 'human') newHumanClueGuessingConcluded = true;
            } else if (activeClue.count === 0 && guesserPerspective === 'ai' && newGuessesMade >=1 ) {
                result.turnShouldEnd = true;
                 result.newMessage += ` AI made its one selection for clue '0'.`;
            } else if (activeClue.count === 0 && guesserPerspective === 'human' && newGuessesMade >=1 && !result.newGameOver){
                 result.newMessage += ` You can make another selection for clue '0'.`;
            }
             else {
              result.newMessage += ` ${guesserName} can make another selection.`;
            }
        }
      } else { // Bystander for the clue giver
        newRevealedStates[cardId] = guesserPerspective === 'human' ? 'bystander_human_turn' : 'bystander_ai_turn';
        result.newMessage = `Bystander. ${gridWords[cardId].toUpperCase()} was a bystander for ${clueGiverName} (the clue giver). Turn ends for ${guesserName}.`;
        result.turnShouldEnd = true;
        result.useTokenOnTurnEnd = true; 
        if (guesserPerspective === 'human') newHumanClueGuessingConcluded = true;
      }

      const updatedTotalGreensFound = newRevealedStates.filter(s => s === 'green').length;

      if (!result.newGameOver && updatedTotalGreensFound === TOTAL_UNIQUE_GREEN_AGENTS) {
          result.newGameOver = true;
          result.newMessage = 'All 15 agents contacted! You win!';
          result.turnShouldEnd = true; 
          if (guesserPerspective === 'human') newHumanClueGuessingConcluded = true;
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
            result.newMessage = prev?.revealedStates[cardId] !== 'hidden' ? "Card already revealed." : "Invalid state for sudden death selection.";
            return prev;
        }

        const { keyCardSetup, revealedStates: currentRevealedStates, gridWords } = prev;
        
        const partnerType = guesser === 'human' ? 'ai' : 'human'; // The one whose agents are being guessed
        const cardIdentityOnPartnerKey = keyCardSetup[cardId][partnerType];
        const cardIdentityOnGuesserKey = keyCardSetup[cardId][guesser]; // For self-assassin check

        const guesserName = guesser === 'human' ? "Human" : "AI";
        const partnerName = partnerType === 'human' ? "Human" : "AI";

        const newRevealedStates = [...currentRevealedStates];
        let nextSuddenDeathGuesser: GuesserType | null = null;
        
        if (cardIdentityOnGuesserKey === 'ASSASSIN') { // Guesser hits their OWN assassin
            newRevealedStates[cardId] = 'assassin';
            result.newGameOver = true;
            result.newMessage = `Sudden Death: ${guesserName.toUpperCase()} revealed THEIR OWN ASSASSIN (${gridWords[cardId].toUpperCase()})! You lose.`;
            result.isWin = false;
        } else if (cardIdentityOnPartnerKey === 'ASSASSIN') { // Guesser hits PARTNER'S assassin
            newRevealedStates[cardId] = 'assassin';
            result.newGameOver = true;
            result.newMessage = `Sudden Death: ${guesserName.toUpperCase()} revealed an ASSASSIN for ${partnerName.toUpperCase()} (${gridWords[cardId].toUpperCase()})! You lose.`;
            result.isWin = false;
        } else if (cardIdentityOnPartnerKey === 'BYSTANDER') { // Guesser hits PARTNER'S bystander
            newRevealedStates[cardId] = guesser === 'human' ? 'bystander_human_turn' : 'bystander_ai_turn'; // or a generic 'bystander_sudden_death'
            result.newGameOver = true;
            result.newMessage = `Sudden Death: ${guesserName.toUpperCase()} revealed a BYSTANDER for ${partnerName.toUpperCase()} (${gridWords[cardId].toUpperCase()})! You lose.`;
            result.isWin = false;
        } else if (cardIdentityOnPartnerKey === 'GREEN') { // Guesser hits PARTNER'S green
            newRevealedStates[cardId] = 'green';
            const newTotalGreensFound = newRevealedStates.filter(s => s === 'green').length;
            result.newMessage = `Sudden Death: Correct! ${gridWords[cardId].toUpperCase()} was an agent for ${partnerName.toUpperCase()}.`;

            if (newTotalGreensFound === TOTAL_UNIQUE_GREEN_AGENTS) {
                result.newGameOver = true;
                result.newMessage = "All agents contacted in Sudden Death! You win!";
                result.isWin = true;
            } else {
                // Determine next guesser based on whose partner still has agents
                const humanPartnerStillHasGreensForAIToGuess = countRemainingGreens(getPerspective(keyCardSetup, 'human'), newRevealedStates) > 0;
                const aiPartnerStillHasGreensForHumanToGuess = countRemainingGreens(getPerspective(keyCardSetup, 'ai'), newRevealedStates) > 0;

                if (guesser === 'human') { // Human just guessed for AI partner
                    if (humanPartnerStillHasGreensForAIToGuess) nextSuddenDeathGuesser = 'ai'; // AI's turn (to guess for Human)
                    else if (aiPartnerStillHasGreensForHumanToGuess) nextSuddenDeathGuesser = 'human'; // Human guesses again for AI (if AI no more for Human)
                    else { /* No more targets for anyone */ }
                } else { // AI just guessed for Human partner
                    if (aiPartnerStillHasGreensForHumanToGuess) nextSuddenDeathGuesser = 'human'; // Human's turn (to guess for AI)
                    else if (humanPartnerStillHasGreensForAIToGuess) nextSuddenDeathGuesser = 'ai'; // AI guesses again for Human
                    else { /* No more targets for anyone */ }
                }

                if (nextSuddenDeathGuesser) {
                    result.newMessage += ` ${nextSuddenDeathGuesser === 'human' ? 'Your' : 'AI\'s'} turn to make a selection for your partner.`;
                } else if (!result.newGameOver) { 
                    result.newGameOver = true; 
                    result.newMessage = "Sudden Death: No more agents left for either player's partner to target, but not all 15 found. You lose.";
                    result.isWin = false;
                }
            }
        } else {
            newRevealedStates[cardId] = guesser === 'human' ? 'bystander_human_turn' : 'bystander_ai_turn';
            result.newGameOver = true;
            result.newMessage = `Sudden Death: Revealed ${gridWords[cardId].toUpperCase()}, which was a non-agent for ${partnerName.toUpperCase()}. You lose.`;
            result.isWin = false;
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
  }, [setGameState, getPerspective]);

  const handleAIClueGeneration = useCallback(async () => {
    if (!gameState || gameState.gameOver || gameState.inSuddenDeath || gameState.isAIClueLoading) {
      toast({ title: "Game Info", description: "Cannot generate AI clue at this time.", variant: "default" });
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
        gameMessage: `AI's Clue: ${aiClueResponse.clueWord.toUpperCase()} for ${aiClueResponse.clueNumber}. Your turn to make selections.`,
        guessesMadeForClue: 0,
        humanClueGuessingConcluded: false,
      } : null);
      toast({ title: "AI Clue", description: `${aiClueResponse.clueWord.toUpperCase()} - ${aiClueResponse.clueNumber}. Reasoning: ${aiClueResponse.reasoning || 'N/A'}` });

    } catch (error) {
      console.error("Error generating AI clue:", error);
      toast({ title: "AI Error", description: "Could not generate AI clue.", variant: "destructive" });
      setGameState(prev => prev ? { ...prev, isAIClueLoading: false, gameMessage: "Error getting AI clue. Try AI again or if issue persists, restart." } : null);
    }
  }, [gameState, toast, setGameState, endPlayerTurn, getPerspective]);


  const handleAIGuesses = useCallback(async (clueForAI?: Clue) => {
    const currentProcessingGameState = gameState; 

    if (!currentProcessingGameState || currentProcessingGameState.gameOver || currentProcessingGameState.isAIGuessing || (currentProcessingGameState.inSuddenDeath && currentProcessingGameState.suddenDeathGuesser !== 'ai')) {
      if (currentProcessingGameState && currentProcessingGameState.isAIGuessing) {
        toast({ title: "AI Action Blocked", description: "AI is already processing selections.", variant: "default" });
      } else if (currentProcessingGameState && (currentProcessingGameState.gameOver || (currentProcessingGameState.inSuddenDeath && currentProcessingGameState.suddenDeathGuesser !== 'ai'))) {
        toast({ title: "AI Action Blocked", description: "AI cannot make selections at this time (game over or not AI's turn in sudden death).", variant: "default" });
      } else if (!currentProcessingGameState) {
        toast({ title: "Game Error", description: "Game state not available for AI selection.", variant: "destructive" });
      }
      if (currentProcessingGameState) setGameState(prev => prev ? { ...prev, isAIGuessing: false } : null);
      return;
    }
    
    setGameState(prevGS => {
      if (!prevGS) return null;
      return {
        ...prevGS,
        isAIGuessing: true,
        gameMessage: prevGS.inSuddenDeath ? "AI is selecting for its HUMAN PARTNER..." : `AI is considering selections for your clue: ${clueForAI?.word.toUpperCase()} ${clueForAI?.count}...`
      }
    });
        
    const aiPerspectiveKey = getPerspective(currentProcessingGameState.keyCardSetup, 'ai');
    const aiUnrevealedAssassinWords = currentProcessingGameState.gridWords.filter((word, i) => aiPerspectiveKey[i] === 'ASSASSIN' && currentProcessingGameState.revealedStates[i] === 'hidden');
    
    const revealedWordsList = currentProcessingGameState.gridWords.filter((_, i) => currentProcessingGameState.revealedStates[i] !== 'hidden');

    try {
      const aiOwnUnrevealedGreenWords = currentProcessingGameState.gridWords.filter((word, i) => aiPerspectiveKey[i] === 'GREEN' && currentProcessingGameState.revealedStates[i] === 'hidden');

      const guessInput = currentProcessingGameState.inSuddenDeath ? {
        clueWord: "FIND_GREEN_AGENT_SUDDEN_DEATH",
        clueNumber: 1, 
        gridWords: currentProcessingGameState.gridWords,
        aiGreenWords: aiOwnUnrevealedGreenWords, 
        aiAssassinWords: aiUnrevealedAssassinWords, 
        revealedWords: revealedWordsList,
      } : {
        clueWord: clueForAI!.word, 
        clueNumber: clueForAI!.count,
        gridWords: currentProcessingGameState.gridWords,
        aiGreenWords: aiOwnUnrevealedGreenWords, 
        aiAssassinWords: aiUnrevealedAssassinWords, 
        revealedWords: revealedWordsList,
      };

      const aiGuessResponse = await generateAiGuess(guessInput);

      toast({title: currentProcessingGameState.inSuddenDeath ? "AI Sudden Death Analysis" : "AI Analyzing Your Clue", description: `AI intends to select: ${aiGuessResponse.guessedWords.join(', ') || "Pass"}. Reasoning: ${aiGuessResponse.reasoning || 'N/A'}`});

      if (!aiGuessResponse.guessedWords || aiGuessResponse.guessedWords.length === 0) {
        toast({ title: "AI Action: Pass", description: `AI decided to pass. Reasoning: ${aiGuessResponse.reasoning || 'No specific reason given.'}` });
        
        const passedInSuddenDeath = currentProcessingGameState.inSuddenDeath;
        setGameState(prev => {
          if(!prev) return null;
          let updatedState = {...prev, gameMessage: `AI passes. ${aiGuessResponse.reasoning || ''}`, isAIGuessing: false};
           if (passedInSuddenDeath) { 
              const aiPartnerStillHasGreensForHumanToGuess = countRemainingGreens(getPerspective(prev.keyCardSetup, 'ai'), prev.revealedStates) > 0;
              if (aiPartnerStillHasGreensForHumanToGuess) {
                  updatedState.suddenDeathGuesser = 'human';
                  updatedState.gameMessage = "AI passes in Sudden Death. Your turn to select for the AI partner.";
              } else { 
                  updatedState.gameOver = true;
                  updatedState.gameMessage = "AI passes in Sudden Death, and AI has no agents left for Human to select. You lose.";
              }
           }
           return updatedState;
        });
        
        if (!passedInSuddenDeath && !currentProcessingGameState.gameOver) { 
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
          toast({ title: "AI Error", description: `AI tried to select '${guessedWord}', which is not on the board. Skipping.`});
          continue;
        }
        
        // The check for already revealed cards is handled within processReveal/processSuddenDeathReveal
        // using their 'prev' state, which is more reliable than checking currentProcessingGameState.revealedStates here.

        await delay(1500); 
        
        let revealResult: RevealResult | SuddenDeathRevealResult;
        let messageToToast: string;

        if (currentProcessingGameState.inSuddenDeath) {
            revealResult = processSuddenDeathReveal(cardId, 'ai'); 
            messageToToast = `AI Sudden Death Selection (${guessedWord.toUpperCase()}): ${revealResult.newMessage}`;
            if ((revealResult as SuddenDeathRevealResult).newGameOver) {
                gameEndedByAI = true; 
            }
            toast({title: "AI Sudden Death Action", description: messageToToast});
            if(gameEndedByAI) break; 
        } else { 
            revealResult = processReveal(cardId, 'ai'); 
            messageToToast = `AI Selects (${guessedWord.toUpperCase()}): ${revealResult.newMessage}`;
            if ((revealResult as RevealResult).newGameOver) {
               gameEndedByAI = true;
            }
            toast({title: "AI Normal Selection Action", description: messageToToast});
            if ((revealResult as RevealResult).turnShouldEnd || (revealResult as RevealResult).newGameOver) {
              turnEndedForAINormalPlay = true;
              if(gameEndedByAI || turnEndedForAINormalPlay) break; 
            }
        }
      } 
      
      setGameState(prev => {
          if(!prev) return null;
          return { ...prev, isAIGuessing: false }; 
      });
      
      if (!currentProcessingGameState.inSuddenDeath && !gameEndedByAI && !currentProcessingGameState.gameOver) {
           endPlayerTurn(true); 
      }

    } catch (error) {
      console.error("Error during AI selections:", error);
      toast({ title: "AI Error", description: "AI had trouble making a selection. Turn may pass.", variant: "destructive" });
      
      const wasInSuddenDeathOnError = currentProcessingGameState.inSuddenDeath;
      const gameWasOverOnError = currentProcessingGameState.gameOver;
      
      setGameState(prev => {
          if (!prev) {
            // Game state was already lost, set a definitive game over state.
            return {
                ...(gameState || initializeGameState()), // Try to use existing gameState if somehow available, else fallback
                gridWords: (gameState || initializeGameState()).gridWords, // Keep words if possible
                keyCardSetup: (gameState || initializeGameState()).keyCardSetup, // Keep keycard if possible
                revealedStates: (gameState || initializeGameState()).revealedStates, // Keep reveals if possible
                gameOver: true,
                gameMessage: "Critical error: Game state was lost during AI processing.",
                isAIGuessing: false,
                activeClue: null,
                inSuddenDeath: false,
                suddenDeathGuesser: null,
            };
          }
          // prev is the current state.
          let updatedState = { ...prev, isAIGuessing: false };
          if (wasInSuddenDeathOnError && !gameWasOverOnError) {
            const aiPartnerStillHasGreensForHumanToGuess = countRemainingGreens(getPerspective(updatedState.keyCardSetup, 'ai'), updatedState.revealedStates) > 0;
            if (aiPartnerStillHasGreensForHumanToGuess) {
                updatedState.suddenDeathGuesser = 'human';
                updatedState.gameMessage = "AI error in Sudden Death. Your turn to select for the AI partner.";
            } else { 
                updatedState.gameOver = true;
                updatedState.gameMessage = "AI error in Sudden Death, and AI has no agents left for Human to select. You lose.";
            }
          } else if (!gameWasOverOnError) { // Normal play error
            updatedState.gameMessage = "AI error during selections. AI passes its turn.";
          }
          return updatedState;
      });
      
      // Check currentProcessingGameState for the turn end decision, as gameState might be stale here.
      if (!wasInSuddenDeathOnError && !gameWasOverOnError && currentProcessingGameState && !currentProcessingGameState.gameOver) {
          endPlayerTurn(true);
      }
    }
  }, [gameState, toast, processReveal, processSuddenDeathReveal, endPlayerTurn, setGameState, getPerspective]);


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
            gameMessage: `Your Clue: ${clue.word.toUpperCase()} for ${clue.count}. AI is now making selections.`,
            guessesMadeForClue: 0, 
            humanClueGuessingConcluded: false, 
        };
    });
  }, [gameState, setGameState, toast]);

  useEffect(() => {
    if (gameState && gameState.currentTurn === 'human_clue' && gameState.activeClue && !gameState.isAIGuessing && !gameState.gameOver && !gameState.inSuddenDeath) {
        handleAIGuesses(gameState.activeClue);
    }
  }, [gameState?.activeClue, gameState?.currentTurn, gameState?.isAIGuessing, gameState?.gameOver, gameState?.inSuddenDeath, handleAIGuesses]); 

  useEffect(() => {
    if (gameState && gameState.inSuddenDeath && gameState.suddenDeathGuesser === 'ai' && !gameState.isAIGuessing && !gameState.gameOver) {
        handleAIGuesses(); 
    }
  }, [gameState?.inSuddenDeath, gameState?.suddenDeathGuesser, gameState?.isAIGuessing, gameState?.gameOver, handleAIGuesses]);


  const handleCardClick = useCallback(async (id: number) => {
    const currentClickGameState = gameState; 
    if (!currentClickGameState || currentClickGameState.gameOver || currentClickGameState.revealedStates[id] !== 'hidden' || currentClickGameState.isAIClueLoading || currentClickGameState.isAIGuessing) {
      return;
    }

    if (currentClickGameState.inSuddenDeath) {
        if (currentClickGameState.suddenDeathGuesser !== 'human') {
            toast({ title: "Sudden Death", description: "Not your turn to make a selection." });
            return;
        }
        const sdRevealResult = processSuddenDeathReveal(id, 'human');
        toast({ title: "Sudden Death Selection", description: sdRevealResult.newMessage });
        return; 
    }

    if (currentClickGameState.currentTurn !== 'ai_clue' || !currentClickGameState.activeClue || currentClickGameState.humanClueGuessingConcluded) {
      toast({ title: "Game Info", description: "Not your turn to make selections or selection phase for this clue is over." });
      return;
    }

    const currentGuessesMade = currentClickGameState.guessesMadeForClue;
    const clueCount = currentClickGameState.activeClue.count;
    const maxGuessesThisClue = clueCount === 0 ? Infinity : clueCount + 1;


    if (currentGuessesMade >= maxGuessesThisClue && clueCount !== 0) {
      toast({ title: "Max Selections", description: "You've reached the maximum selections for this clue." });
      setGameState(prev => prev ? {...prev, humanClueGuessingConcluded: true} : null);
      return;
    }

    const { newMessage, newGameOver, turnShouldEnd, useTokenOnTurnEnd } = processReveal(id, 'human');
    toast({ title: "Selection Result", description: newMessage });

    if (newGameOver) {
        return;
    }
    // Turn ending due to bystander or max guesses is handled by humanClueGuessingConcluded and ControlsPanel button
  }, [gameState, processReveal, processSuddenDeathReveal, toast, setGameState]);

  useEffect(() => {
    if (gameState && !gameState.gameOver && !gameState.inSuddenDeath) {
        const revealedGreenCount = gameState.revealedStates.filter(s => s === 'green').length;
        if (revealedGreenCount === TOTAL_UNIQUE_GREEN_AGENTS) {
            setGameState(prev => prev ? { ...prev, gameOver: true, gameMessage: 'All 15 agents contacted! You win!', activeClue: null } : null);
        }
    }
  }, [gameState?.revealedStates, gameState?.gameOver, gameState?.inSuddenDeath, setGameState]);


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

