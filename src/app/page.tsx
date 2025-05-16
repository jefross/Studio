"use client";

import type React from 'react';
import { useState, useEffect, useCallback }from 'react';
import GameBoard from '@/components/GameBoard';
import ControlsPanel from '@/components/ControlsPanel';
import GameEndModal from '@/components/GameEndModal';
import ApiKeySettings from '@/components/ApiKeySettings';
import { initializeGameState, getPerspective, countRemainingGreens } from '@/lib/game-logic';
import type { GameState, WordCardData, Clue, PlayerTurn, CardType, RevealedState, GuesserType } from '@/types';
import { TOTAL_UNIQUE_GREEN_AGENTS, INITIAL_TIMER_TOKENS } from '@/types';
import { generateClue as generateAIClue } from '@/ai/flows/ai-clue-generator';
import { generateAiGuess } from '@/ai/flows/ai-guess-generator';
import { useToast } from "@/hooks/use-toast";
import { Button } from '@/components/ui/button';
import { RefreshCw, Loader2, AlertTriangle } from 'lucide-react';
import { Label } from '@/components/ui/label';
import type { WordTheme } from '@/lib/words';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";


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
  const [difficultyTokens, setDifficultyTokens] = useState<number>(INITIAL_TIMER_TOKENS);
  const [currentTheme, setCurrentTheme] = useState<WordTheme>('standard');
  const [apiKeyError, setApiKeyError] = useState<boolean>(false);
  const [hasCheckedApiKey, setHasCheckedApiKey] = useState<boolean>(false);
  const { toast } = useToast();

  // Check if API key exists in local storage on component mount
  useEffect(() => {
    const checkApiKey = () => {
      try {
        const storedKey = localStorage.getItem('gemini-api-key');
        const hasKey = storedKey && JSON.parse(storedKey);
        setApiKeyError(!hasKey);
        setHasCheckedApiKey(true);
      } catch (error) {
        console.error('Error checking for API key:', error);
        setApiKeyError(true);
        setHasCheckedApiKey(true);
      }
    };
    
    // Delay checking until after hydration is complete
    const timer = setTimeout(checkApiKey, 100);
    return () => clearTimeout(timer);
  }, []);

  const resetGame = useCallback((tokens: number = difficultyTokens, theme: WordTheme = currentTheme) => {
    setGameState(initializeGameState(tokens, theme));
  }, [difficultyTokens, currentTheme]);

  useEffect(() => {
    if (!gameState) {
      resetGame(difficultyTokens, currentTheme);
    }
  }, [gameState, resetGame, difficultyTokens, currentTheme]);


  const endPlayerTurn = useCallback((useTimerToken: boolean) => {
    setGameState(prev => {
      if (!prev || prev.gameOver) return prev; 

      const currentTotalGreensFound = prev.revealedStates.filter(s => s === 'green').length;
      const gameShouldBeOver = prev.gameOver; // Start with current state
      let shouldEndGame = false; // New variable to track if game should end
      let finalMessage = prev.gameMessage;
      let enteringSuddenDeath = prev.inSuddenDeath;

      let newTimerTokens = prev.timerTokens;
      if (!prev.inSuddenDeath && useTimerToken) { 
          newTimerTokens = Math.max(0, prev.timerTokens - 1);
      }
      
      if (currentTotalGreensFound === TOTAL_UNIQUE_GREEN_AGENTS && !shouldEndGame) {
        shouldEndGame = true;
        finalMessage = 'All 15 agents contacted! You win!';
      } else if (newTimerTokens <= 0 && !prev.inSuddenDeath && !shouldEndGame) { 
        if (!prev.revealedStates.includes('assassin')) {
            enteringSuddenDeath = true;
            finalMessage = "Timer exhausted! Entering Sudden Death! Players now try to REVEAL THEIR PARTNER'S agents.";
        } else if (!shouldEndGame) { 
            shouldEndGame = true;
            // finalMessage remains as assassin hit message
        }
      }

      if (shouldEndGame && !enteringSuddenDeath) {
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
        // In Sudden Death, a player needs to reveal for their PARTNER.
        // So, if AI is next to guess (for Human), we check if Human still has agents.
        const humanPartnerHasGreensForAIToGuess = countRemainingGreens(getPerspective(prev.keyCardSetup, 'human'), prev.revealedStates) > 0;
        // If Human is next to guess (for AI), we check if AI still has agents.
        const aiPartnerHasGreensForHumanToGuess = countRemainingGreens(getPerspective(prev.keyCardSetup, 'ai'), prev.revealedStates) > 0;

        // Determine whose turn it would be to guess for their partner
        if (prev.currentTurn === 'ai_clue') { // AI just gave a clue, Human would have guessed
            if (aiPartnerHasGreensForHumanToGuess) nextSuddenDeathGuesser = 'human'; // Human guesses for AI
            else if (humanPartnerHasGreensForAIToGuess) nextSuddenDeathGuesser = 'ai'; // AI guesses for Human (if Human can't guess for AI)
        } else { // Human just gave a clue, AI would have guessed
            if (humanPartnerHasGreensForAIToGuess) nextSuddenDeathGuesser = 'ai'; // AI guesses for Human
            else if (aiPartnerHasGreensForHumanToGuess) nextSuddenDeathGuesser = 'human'; // Human guesses for AI (if AI can't guess for Human)
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
         if (!nextSuddenDeathGuesser && currentTotalGreensFound === TOTAL_UNIQUE_GREEN_AGENTS) { // Should be caught by shouldEndGame check above
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

        let suddenDeathStartMessage = finalMessage; // Use the "Timer exhausted..." message
        if (nextSuddenDeathGuesser) {
            suddenDeathStartMessage += ` ${nextSuddenDeathGuesser === 'human' ? 'Your' : 'AI\'s'} turn to make a selection for your partner.`;
        }

        return {
            ...prev,
            timerTokens: 0, // Timer is exhausted
            gameOver: false, // Game is not over yet, it's sudden death
            inSuddenDeath: true,
            suddenDeathGuesser: nextSuddenDeathGuesser,
            activeClue: null, // No active clue in sudden death
            guessesMadeForClue: 0,
            gameMessage: suddenDeathStartMessage,
            humanClueGuessingConcluded: false, // Reset this
            currentTurn: prev.currentTurn, // Keep currentTurn for context, though clue giving is over
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
        
        // In Sudden Death, guesser is trying to reveal their PARTNER's agent.
        const partnerType = guesser === 'human' ? 'ai' : 'human'; 
        const cardIdentityOnPartnerKey = keyCardSetup[cardId][partnerType];
        // Also need to check if guesser hits their OWN assassin
        const cardIdentityOnGuesserKey = keyCardSetup[cardId][guesser]; 

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
            newRevealedStates[cardId] = guesser === 'human' ? 'bystander_human_turn' : 'bystander_ai_turn'; 
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
                    else if (aiPartnerStillHasGreensForHumanToGuess) nextSuddenDeathGuesser = 'human'; // Human guesses again for AI (if AI has no more for Human)
                } else { // AI just guessed for Human partner
                    if (aiPartnerStillHasGreensForHumanToGuess) nextSuddenDeathGuesser = 'human'; // Human's turn (to guess for AI)
                    else if (humanPartnerStillHasGreensForAIToGuess) nextSuddenDeathGuesser = 'ai'; // AI guesses again for Human
                }

                if (nextSuddenDeathGuesser) {
                    result.newMessage += ` ${nextSuddenDeathGuesser === 'human' ? 'Your' : 'AI\'s'} turn to make a selection for your partner.`;
                } else if (!result.newGameOver) { 
                    result.newGameOver = true; 
                    result.newMessage = "Sudden Death: No more agents left for either player's partner to target, but not all 15 found. You lose.";
                    result.isWin = false;
                }
            }
        } else { // This case should not ideally happen if logic is sound (e.g. card is Green for guesser but Bystander for partner)
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
    if (!gameState || gameState.gameOver || gameState.currentTurn !== 'ai_clue' || gameState.activeClue) return;

    // Check for API key before attempting to generate clue
    try {
      const storedKey = localStorage.getItem('gemini-api-key');
      const hasKey = storedKey && JSON.parse(storedKey);
      if (!hasKey) {
        setApiKeyError(true);
        toast({
          title: "API Key Required",
          description: "Please set your Gemini API key in settings to use AI features.",
          variant: "destructive"
        });
        return;
      }
    } catch (error) {
      console.error('Error checking for API key:', error);
      setApiKeyError(true);
      return;
    }

    setGameState(prev => {
      if (!prev) return prev;
      return { ...prev, isAIClueLoading: true };
    });

    try {
      const aiPerspective = getPerspective(gameState.keyCardSetup, 'ai');
      const gridWords = gameState.gridWords;
      
      // Get green and assassin words for AI's clue giving
      const greenWords = gameState.gridWords.filter((word, idx) => {
          return gameState.revealedStates[idx] === 'hidden' && aiPerspective[idx] === 'GREEN';
      });
      
      const assassinWords = gameState.gridWords.filter((word, idx) => {
          return gameState.revealedStates[idx] === 'hidden' && aiPerspective[idx] === 'ASSASSIN';
      });
      
      const clue = await generateAIClue({
        grid: gridWords,
        greenWords,
        assassinWords,
        timerTokens: gameState.timerTokens,
        theme: currentTheme
      });

      setGameState(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          isAIClueLoading: false,
          activeClue: {
            word: clue.clueWord,
            count: clue.clueNumber
          },
          gameMessage: `AI gave the clue: ${clue.clueWord.toUpperCase()} ${clue.clueNumber}. Click on words to try guessing!`,
          aiReasoning: clue.reasoning
        };
      });
      
      setApiKeyError(false);
    } catch (error: any) {
      console.error('Failed to generate AI clue:', error);
      let errorMessage = 'Failed to generate AI clue. Please try again.';
      
      // Check if it's an API key error
      if (error.message?.includes('No Gemini API key found') || error.message?.includes('API key')) {
        setApiKeyError(true);
        errorMessage = 'No valid Gemini API key found. Please add your API key in settings.';
      }
      
      setGameState(prev => {
        if (!prev) return prev;
        return { ...prev, isAIClueLoading: false, gameMessage: errorMessage };
      });
      
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      });
    }
  }, [gameState, currentTheme, toast]);


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
    
    // Add a toast notification when the AI is making guesses with a longer duration
    toast({ 
      title: "AI Analyzing", 
      description: currentProcessingGameState.inSuddenDeath 
        ? "The AI is analyzing the board for Sudden Death selections..." 
        : `The AI is analyzing your clue: ${clueForAI?.word.toUpperCase()} ${clueForAI?.count}...`,
      variant: "thinking",
      duration: 15000 // 15 seconds
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
        theme: currentProcessingGameState.theme
      } : {
        clueWord: clueForAI!.word, 
        clueNumber: clueForAI!.count,
        gridWords: currentProcessingGameState.gridWords,
        aiGreenWords: aiOwnUnrevealedGreenWords, 
        aiAssassinWords: aiUnrevealedAssassinWords, 
        revealedWords: revealedWordsList,
        theme: currentProcessingGameState.theme
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
              if (updatedState.suddenDeathGuesser === 'ai') { // AI was trying to guess for Human
                 const aiPartnerStillHasGreensForHumanToTarget = countRemainingGreens(getPerspective(prev.keyCardSetup, 'ai'), prev.revealedStates) > 0;
                 if (aiPartnerStillHasGreensForHumanToTarget) { 
                    updatedState.suddenDeathGuesser = 'human';
                    updatedState.gameMessage = "AI passes in Sudden Death. Your turn to select for the AI partner.";
                 } else { 
                    updatedState.gameOver = true;
                    updatedState.gameMessage = "AI passes in Sudden Death, and no agents left for Human to select for AI. You lose.";
                 }
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
            }
             if(gameEndedByAI || turnEndedForAINormalPlay) break; 
        }
      } 
      
      setGameState(prev => {
          if(!prev) return null;
          return { ...prev, isAIGuessing: false }; 
      });
      
      if (!currentProcessingGameState.inSuddenDeath && !gameEndedByAI && !currentProcessingGameState.gameOver) {
           endPlayerTurn(turnEndedForAINormalPlay); 
      }

    } catch (error) {
      console.error("Error during AI selections:", error);
      toast({ title: "AI Error", description: "AI had trouble making a selection. Turn may pass.", variant: "destructive" });
      
      const wasInSuddenDeathOnError = currentProcessingGameState.inSuddenDeath;
      const gameWasOverOnError = currentProcessingGameState.gameOver;
      
      setGameState(prev => {
          if (!prev) {
            return {
                ...(gameState || initializeGameState(difficultyTokens, currentTheme)), // Fallback to a fresh state if prev is somehow null
                gridWords: (gameState || initializeGameState(difficultyTokens, currentTheme)).gridWords,
                keyCardSetup: (gameState || initializeGameState(difficultyTokens, currentTheme)).keyCardSetup,
                revealedStates: (gameState || initializeGameState(difficultyTokens, currentTheme)).revealedStates,
                gameOver: true,
                gameMessage: "Critical error: Game state was lost during AI processing.",
                isAIGuessing: false,
                activeClue: null,
                inSuddenDeath: false,
                suddenDeathGuesser: null,
            };
          }
          let updatedState = { ...prev, isAIGuessing: false };
          if (wasInSuddenDeathOnError && !gameWasOverOnError) {
            const aiPartnerStillHasGreensForHumanToTarget = countRemainingGreens(
              getPerspective(updatedState.keyCardSetup, 'ai'), 
              updatedState.revealedStates
            ) > 0;

            if (aiPartnerStillHasGreensForHumanToTarget) { 
                updatedState = {
                  ...updatedState,
                  suddenDeathGuesser: 'human',
                  gameMessage: "AI error in Sudden Death. Your turn to select for the AI partner."
                };
            } else { 
                updatedState = {
                  ...updatedState,
                  gameOver: true,
                  gameMessage: "AI error in Sudden Death, and AI has no agents left for Human to select. You lose."
                };
            }
          } else if (!gameWasOverOnError) { 
            updatedState = {
              ...updatedState,
              gameMessage: "AI error during selections. AI passes its turn."
            };
          }
          return updatedState;
      });
      
      if (!wasInSuddenDeathOnError && !gameWasOverOnError && currentProcessingGameState && !currentProcessingGameState.gameOver) {
          endPlayerTurn(true);
      }
    }
  }, [gameState, toast, processReveal, processSuddenDeathReveal, endPlayerTurn, setGameState, getPerspective, difficultyTokens, currentTheme]);


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
    if (turnShouldEnd) { 
        setGameState(prev => prev ? {...prev, humanClueGuessingConcluded: true } : null);
    }
  }, [gameState, processReveal, processSuddenDeathReveal, toast, setGameState]);

  useEffect(() => {
    if (gameState && !gameState.gameOver && !gameState.inSuddenDeath) {
        const revealedGreenCount = gameState.revealedStates.filter(s => s === 'green').length;
        if (revealedGreenCount === TOTAL_UNIQUE_GREEN_AGENTS) {
            setGameState(prev => prev ? { ...prev, gameOver: true, gameMessage: 'All 15 agents contacted! You win!', activeClue: null } : null);
        }
    }
  }, [gameState?.revealedStates, gameState?.gameOver, gameState?.inSuddenDeath, setGameState]);


  if (!hasCheckedApiKey) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="mt-4 text-muted-foreground">Initializing application...</p>
      </div>
    );
  }

  if (!gameState) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="mt-4 text-muted-foreground">Initializing game...</p>
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
  
  const canHumanVoluntarilyEndGuessing = isHumanCurrentlyGuessingPhase && !gameState.humanClueGuessingConcluded && guessesLeftForThisClue > 0 && gameState.guessesMadeForClue > 0 && !(gameState.activeClue?.count === 0 && gameState.guessesMadeForClue > 0);
  
  const mustHumanConfirmTurnEnd = isHumanCurrentlyGuessingPhase && gameState.humanClueGuessingConcluded;

  const isClickableForHumanSuddenDeath = gameState.inSuddenDeath && gameState.suddenDeathGuesser === 'human' && !gameState.gameOver;
  
  const isBoardClickableForHuman = isClickableForHumanNormalPlay || isClickableForHumanSuddenDeath;


  return (
    <div className="flex flex-col min-h-screen p-4 max-w-7xl mx-auto">
      <header className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold text-primary">Codenames Duet AI</h1>
        <div className="flex items-center">
          <ApiKeySettings />
          <Button
            onClick={() => resetGame(difficultyTokens, currentTheme)}
            variant="outline"
            size="icon"
            className="ml-2"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {apiKeyError && (
        <div className="w-full max-w-3xl mx-auto mb-4 p-4 bg-destructive/10 border border-destructive rounded-md text-center">
          <div className="flex items-center justify-center mb-2">
            <AlertTriangle className="h-5 w-5 text-destructive mr-2" />
            <p className="text-destructive font-medium">Please set your Gemini API Key in settings to use AI features.</p>
          </div>
          <p className="text-sm">You can get a free API key from <a href="https://aistudio.google.com/app/apikey" className="underline" target="_blank" rel="noopener noreferrer">Google AI Studio</a>.</p>
        </div>
      )}

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
      
      <div className="flex flex-col sm:flex-row items-center gap-4 mt-4">
        <div className="flex items-center gap-2">
            <Label htmlFor="difficulty-select" className="text-muted-foreground">Difficulty (Tokens):</Label>
            <Select
                value={difficultyTokens.toString()}
                onValueChange={(value) => {
                    const numTokens = parseInt(value, 10);
                    setDifficultyTokens(numTokens);
                    resetGame(numTokens, currentTheme); 
                }}
                disabled={gameState.isAIClueLoading || gameState.isAIGuessing}
            >
                <SelectTrigger id="difficulty-select" className="w-[80px] bg-card">
                    <SelectValue placeholder="Tokens" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="9">9</SelectItem>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="11">11</SelectItem>
                </SelectContent>
            </Select>
        </div>

        <div className="flex items-center gap-2">
            <Label htmlFor="theme-select" className="text-muted-foreground">Theme:</Label>
            <Select
                value={currentTheme}
                onValueChange={(value: WordTheme) => {
                    setCurrentTheme(value);
                    resetGame(difficultyTokens, value);
                }}
                disabled={gameState.isAIClueLoading || gameState.isAIGuessing}
            >
                <SelectTrigger id="theme-select" className="w-[140px] bg-card">
                    <SelectValue placeholder="Select Theme" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="standard">Standard</SelectItem>
                    <SelectItem value="simpsons">The Simpsons</SelectItem>
                    <SelectItem value="marvel">Marvel</SelectItem>
                    <SelectItem value="harry-potter">Harry Potter</SelectItem>
                    <SelectItem value="disney">Disney</SelectItem>
                    <SelectItem value="video-games">Video Games</SelectItem>
                    <SelectItem value="star-wars">Star Wars</SelectItem>
                </SelectContent>
            </Select>
        </div>

        <Button
          variant="outline"
          onClick={() => resetGame(difficultyTokens, currentTheme)}
          className="bg-card"
          disabled={gameState.isAIClueLoading || gameState.isAIGuessing} 
        >
          <RefreshCw className="mr-2 h-4 w-4" /> Restart Game
        </Button>
      </div>


      <GameEndModal
        isOpen={gameState.gameOver}
        message={gameState.gameMessage}
        isWin={gameState.totalGreensFound === TOTAL_UNIQUE_GREEN_AGENTS && gameState.gameOver && (gameState.gameMessage.toLowerCase().includes("win") || gameState.gameMessage.toLowerCase().includes("all agents contacted") || gameState.gameMessage.toLowerCase().includes("all agents found"))}
        onPlayAgain={() => resetGame(difficultyTokens, currentTheme)}
      />
    </div>
  );
}

