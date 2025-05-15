
import React from 'react';
import type { Clue, PlayerTurn } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Timer, Lightbulb, User, BotIcon, Info, CheckCircle, CircleDotDashed } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

interface ControlsPanelProps {
  currentTurn: PlayerTurn;
  timerTokens: number;
  activeClue: Clue | null;
  gameMessage: string;
  humanGreensLeft: number;
  aiGreensLeft: number;
  totalGreensFound: number;
  isAIClueLoading: boolean;
  onHumanClueSubmit: (clue: Clue) => void;
  onGetAIClue: () => void;
  onEndTurn: () => void;
  isGuessingPhase: boolean;
  guessesLeftForClue: number;
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
  onHumanClueSubmit,
  onGetAIClue,
  onEndTurn,
  isGuessingPhase,
  guessesLeftForClue,
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

  const whoseTurnText = currentTurn === 'human_clue'
    ? (activeClue ? "AI is Guessing" : "Your Turn to Give Clue")
    : (activeClue ? "Your Turn to Guess" : "AI's Turn to Give Clue");
  const turnIcon = currentTurn === 'human_clue' ? <User className="mr-2 h-5 w-5" /> : <BotIcon className="mr-2 h-5 w-5" />;

  return (
    <Card className="w-full max-w-3xl mx-auto shadow-lg">
      <CardHeader className="pb-2">
        <CardTitle className="text-center text-xl flex items-center justify-center">
          {turnIcon} {whoseTurnText}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 text-center p-3 bg-muted/50 rounded-md">
          <div>
            <Label className="text-sm font-medium text-muted-foreground">Timer Tokens</Label>
            <div className="flex items-center justify-center text-2xl font-bold">
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
                <span>Your Targets: {humanGreensLeft} left</span>
            </div>
            <div className="flex items-center">
                <BotIcon className="mr-1 h-3 w-3" />
                <span>AI Targets: {aiGreensLeft} left</span>
            </div>
        </div>


        {currentTurn === 'human_clue' && !activeClue && !isAIClueLoading && (
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
              />
            </div>
            <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-primary-foreground">
              <Lightbulb className="mr-2 h-4 w-4" /> Submit Your Clue
            </Button>
          </form>
        )}

        {currentTurn === 'ai_clue' && !activeClue && (
          <Button onClick={onGetAIClue} disabled={isAIClueLoading} className="w-full bg-accent hover:bg-accent/90 text-accent-foreground">
            {isAIClueLoading ? (
              <> <CircleDotDashed className="mr-2 h-4 w-4 animate-spin" /> AI is Thinking...</>
            ) : (
              <> <BotIcon className="mr-2 h-4 w-4" /> Get AI Clue </>
            )}
          </Button>
        )}

        {activeClue && (
          <Card className="bg-secondary p-4 rounded-md shadow-sm">
            <CardContent className="p-0 text-center">
              <p className="text-sm text-muted-foreground">
                {currentTurn === 'ai_clue' ? 'AI gave the clue:' : 'Your clue is:'}
              </p>
              <p className="text-2xl font-bold text-primary">
                {activeClue.word.toUpperCase()} <span className="text-accent">{activeClue.count}</span>
              </p>
              {isGuessingPhase && (
                 <p className="text-xs text-muted-foreground mt-1">
                    Guesses available: {guessesLeftForClue} (up to {activeClue.count === 0 ? 1 : activeClue.count + 1} words)
                 </p>
              )}
            </CardContent>
          </Card>
        )}

        {isGuessingPhase && guessesLeftForClue > 0 && (
            <Button onClick={onEndTurn} variant="outline" className="w-full">
             <CheckCircle className="mr-2 h-4 w-4" /> End Guessing Turn Voluntarily
            </Button>
        )}


        {gameMessage && (
          <div className="p-3 bg-muted border border-border rounded-md text-center text-sm text-foreground/90 flex items-center justify-center">
            <Info className="h-4 w-4 mr-2 shrink-0 text-primary" />
            <span>{gameMessage}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ControlsPanel;
