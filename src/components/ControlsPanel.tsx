
import React from 'react';
import type { Clue, PlayerTurn, GuesserType } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Timer, Lightbulb, User, BotIcon, Info, CheckCircle, CircleDotDashed, Loader2, ShieldAlert, AlertTriangle, XCircle } from 'lucide-react';

interface ControlsPanelProps {
  currentTurn: PlayerTurn;
  timerTokens: number;
  activeClue: Clue | null;
  gameMessage: string;
  humanGreensLeft: number; // Number of human's agents AI needs to guess
  aiGreensLeft: number;   // Number of AI's agents human needs to guess
  totalGreensFound: number;
  isAIClueLoading: boolean;
  isAIGuessing: boolean;
  onHumanClueSubmit: (clue: Clue) => void;
  onGetAIClue: () => void;
  onEndTurn: () => void;
  canHumanVoluntarilyEndGuessing: boolean;
  mustHumanConfirmTurnEnd: boolean;
  guessesLeftForClue: number;
  humanClueGuessingConcluded: boolean;
  inSuddenDeath: boolean;
  suddenDeathGuesser: GuesserType | null;
  gameOver: boolean; 
}

const ControlsPanel: React.FC<ControlsPanelProps> = ({
  currentTurn,
  timerTokens,
  activeClue,
  gameMessage,
  humanGreensLeft,
  aiGreensLeft,
  totalGreensFound,
  isAIClueLoading,
  isAIGuessing,
  onHumanClueSubmit,
  onGetAIClue,
  onEndTurn,
  canHumanVoluntarilyEndGuessing,
  mustHumanConfirmTurnEnd,
  guessesLeftForClue,
  humanClueGuessingConcluded,
  inSuddenDeath,
  suddenDeathGuesser,
  gameOver, 
}) => {
  const [humanClueWord, setHumanClueWord] = React.useState('');
  const [humanClueCount, setHumanClueCount] = React.useState<number | ''>(1);

  const handleHumanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (humanClueWord.trim() && typeof humanClueCount === 'number' && humanClueCount >= 0) {
      onHumanClueSubmit({ word: humanClueWord.trim(), count: humanClueCount });
      setHumanClueWord('');
      setHumanClueCount(1);
    }
  };

  let whoseTurnDisplay: string;
  let turnIcon;

  if (gameOver) {
    whoseTurnDisplay = "Game Over";
    turnIcon = <Info className="mr-2 h-5 w-5" />;
  } else if (inSuddenDeath) {
    whoseTurnDisplay = "SUDDEN DEATH!";
    turnIcon = <AlertTriangle className="mr-2 h-5 w-5 text-destructive" />;
    if (suddenDeathGuesser === 'human') {
        whoseTurnDisplay += " Your turn to select for the AI partner!";
        turnIcon = <User className="mr-2 h-5 w-5" />;
    } else if (suddenDeathGuesser === 'ai') {
        whoseTurnDisplay += " AI's turn to select for its Human partner!";
        turnIcon = <BotIcon className="mr-2 h-5 w-5" />;
    } else {
        whoseTurnDisplay += " Evaluating..."; 
    }
  } else if (isAIGuessing) {
    whoseTurnDisplay = "AI is Making Selections...";
    turnIcon = <Loader2 className="mr-2 h-5 w-5 animate-spin" />;
  } else if (isAIClueLoading) {
    whoseTurnDisplay = "AI is Thinking of a Clue...";
    turnIcon = <Loader2 className="mr-2 h-5 w-5 animate-spin" />;
  } else if (activeClue && currentTurn === 'ai_clue') {
    whoseTurnDisplay = humanClueGuessingConcluded ? "Selections Ended. Confirm to End Turn." : "Your Turn to Make Selections for AI's Clue";
    turnIcon = <User className="mr-2 h-5 w-5" />;
  } else {
    whoseTurnDisplay = currentTurn === 'human_clue' ? "Your Turn to Give Clue" : "AI's Turn to Give Clue";
    turnIcon = currentTurn === 'human_clue' ? <User className="mr-2 h-5 w-5" /> : <BotIcon className="mr-2 h-5 w-5" />;
  }
  
  const disableHumanClueInput = gameOver || inSuddenDeath || isAIClueLoading || isAIGuessing || currentTurn !== 'human_clue' || !!activeClue;
  const disableAICallButton = gameOver || inSuddenDeath || isAIClueLoading || isAIGuessing || currentTurn !== 'ai_clue' || !!activeClue;


  return (
    <Card className="w-full max-w-3xl mx-auto shadow-lg">
      <CardHeader className="pb-2">
        <CardTitle className="text-center text-xl flex items-center justify-center">
          {turnIcon} 
          {whoseTurnDisplay}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 text-center p-3 bg-muted/50 rounded-md">
          <div>
            <Label className="text-sm font-medium text-muted-foreground">Timer Tokens</Label>
            <div className={`flex items-center justify-center text-2xl font-bold ${timerTokens <= 2 && timerTokens > 0 && !inSuddenDeath ? 'text-orange-500' : timerTokens === 0 && !inSuddenDeath ? 'text-destructive' : ''}`}>
              <Timer className="mr-2 h-6 w-6 text-primary" /> {timerTokens}
            </div>
          </div>
          <div>
            <Label className="text-sm font-medium text-muted-foreground">Agents Found</Label>
            <div className="flex items-center justify-center text-2xl font-bold">
              <Lightbulb className="mr-2 h-6 w-6 text-primary" /> {totalGreensFound} / 15
            </div>
          </div>
        </div>

        <div className="flex justify-around text-xs text-muted-foreground px-2 py-1 bg-muted/30 rounded-md">
            <div className="flex items-center">
                <User className="mr-1 h-3 w-3" />
                <span>Partner (Human) Needs: {humanGreensLeft} found</span>
            </div>
            <div className="flex items-center">
                <BotIcon className="mr-1 h-3 w-3" />
                <span>Partner (AI) Needs: {aiGreensLeft} found</span>
            </div>
        </div>


        {!gameOver && !inSuddenDeath && currentTurn === 'human_clue' && !activeClue && !isAIGuessing && (
          <form onSubmit={handleHumanSubmit} className="space-y-3 p-3 border rounded-md bg-background">
            <CardDescription className="text-center text-sm">Provide a one-word clue and a number.</CardDescription>
            <div className="space-y-1">
              <Label htmlFor="clueWord">Clue Word</Label>
              <Input
                id="clueWord"
                type="text"
                value={humanClueWord}
                onChange={(e) => setHumanClueWord(e.target.value.toUpperCase())}
                placeholder="E.g., ANIMAL"
                className="bg-card"
                autoCapitalize="characters"
                disabled={disableHumanClueInput}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="clueCount">Number (0-9)</Label>
              <Input
                id="clueCount"
                type="number"
                min="0"
                max="9"
                value={humanClueCount}
                onChange={(e) => {
                    const val = e.target.value;
                    if (val === '') {
                        setHumanClueCount('');
                    } else {
                        const num = parseInt(val, 10);
                        if (num >= 0 && num <= 9) {
                           setHumanClueCount(num);
                        }
                    }
                }}
                placeholder="E.g., 3"
                className="bg-card"
                disabled={disableHumanClueInput}
              />
            </div>
            <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-primary-foreground" disabled={disableHumanClueInput}>
              <Lightbulb className="mr-2 h-4 w-4" /> Submit Your Clue
            </Button>
          </form>
        )}

        {!gameOver && !inSuddenDeath && currentTurn === 'ai_clue' && !activeClue && !isAIGuessing && (
          <Button onClick={onGetAIClue} disabled={disableAICallButton} className="w-full bg-accent hover:bg-accent/90 text-accent-foreground">
            {isAIClueLoading ? (
              <> <CircleDotDashed className="mr-2 h-4 w-4 animate-spin" /> AI is Thinking...</>
            ) : (
              <> <BotIcon className="mr-2 h-4 w-4" /> Get AI Clue </>
            )}
          </Button>
        )}

        {!gameOver && !inSuddenDeath && activeClue && !isAIGuessing && ( 
          <Card className="bg-secondary p-4 rounded-md shadow-sm">
            <CardContent className="p-0 text-center">
              <p className="text-sm text-muted-foreground">
                {currentTurn === 'ai_clue' ? 'AI gave the clue:' : 'Your clue for AI was:'}
              </p>
              <p className="text-2xl font-bold text-primary">
                {activeClue.word.toUpperCase()} <span className="text-accent">{activeClue.count}</span>
              </p>
              {currentTurn === 'ai_clue' && !humanClueGuessingConcluded && guessesLeftForClue > 0 && (
                 <p className="text-xs text-muted-foreground mt-1">
                    Selections available: {guessesLeftForClue === Infinity ? 'Unlimited (for clue 0)' : guessesLeftForClue}
                 </p>
              )}
               {currentTurn === 'ai_clue' && humanClueGuessingConcluded && (
                 <p className="text-xs text-destructive mt-1">
                    Selections ended for this clue. Confirm to end turn.
                 </p>
              )}
            </CardContent>
          </Card>
        )}

        {!gameOver && !inSuddenDeath && (canHumanVoluntarilyEndGuessing || mustHumanConfirmTurnEnd) && (
            <Button onClick={onEndTurn} variant={mustHumanConfirmTurnEnd ? "destructive" : "outline"} className="w-full">
             {mustHumanConfirmTurnEnd ? <ShieldAlert className="mr-2 h-4 w-4" /> : <CheckCircle className="mr-2 h-4 w-4" />}
             {mustHumanConfirmTurnEnd ? "End Turn (Token Used)" : "End Selections Voluntarily"}
            </Button>
        )}

        {gameMessage && (
          <div className={`p-3 border rounded-md text-center text-sm text-foreground/90 flex items-center justify-center ${inSuddenDeath ? 'bg-destructive/10 border-destructive' : gameOver && gameMessage.toLowerCase().includes("lose") ? 'bg-destructive/10 border-destructive' : gameOver && gameMessage.toLowerCase().includes("win") ? 'bg-primary/10 border-primary' : 'bg-muted border-border'}`}>
            {inSuddenDeath ? <AlertTriangle className="h-4 w-4 mr-2 shrink-0 text-destructive" /> : 
             gameOver && gameMessage.toLowerCase().includes("lose") ? <XCircle className="h-4 w-4 mr-2 shrink-0 text-destructive" /> : 
             gameOver && gameMessage.toLowerCase().includes("win") ? <CheckCircle className="h-4 w-4 mr-2 shrink-0 text-green-500" /> : 
             <Info className="h-4 w-4 mr-2 shrink-0 text-primary" />}
            <span>{gameMessage}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ControlsPanel;

