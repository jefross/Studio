
import type React from 'react';
import type { WordCardData, CardType } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { ShieldCheck, Skull, CircleHelp, CheckIcon, AlertTriangleIcon, BotIcon } from 'lucide-react';

interface WordCardProps {
  cardData: WordCardData;
  onCardClick: (id: number) => void;
  isClickable: boolean;
}

const WordCard: React.FC<WordCardProps> = ({ cardData, onCardClick, isClickable }) => {
  const { word, id, revealedState, keyCardEntry } = cardData;

  const getCardClasses = () => {
    switch (revealedState) {
      case 'green':
        return 'bg-primary text-primary-foreground dark:bg-primary/80';
      case 'assassin':
        return 'bg-destructive text-destructive-foreground dark:bg-destructive/80';
      case 'bystander_human_turn':
      case 'bystander_ai_turn':
        return 'bg-yellow-400 dark:bg-yellow-600 text-black';
      case 'hidden':
      default:
        return 'bg-card hover:bg-accent/10 dark:hover:bg-accent/20 transition-colors duration-150 text-card-foreground';
    }
  };

  const renderRevealedIcon = () => {
    const iconClass = "h-6 w-6 sm:h-8 sm:w-8";
    switch (revealedState) {
      case 'green':
        return <ShieldCheck className={cn(iconClass, "text-primary-foreground")} />;
      case 'assassin':
        return <Skull className={cn(iconClass, "text-destructive-foreground")} />;
      case 'bystander_human_turn':
      case 'bystander_ai_turn':
        return <CircleHelp className={cn(iconClass, "text-black")} />;
      default:
        return null;
    }
  };

  const renderHumanKeyHintIcon = () => {
    if (!keyCardEntry || revealedState !== 'hidden') return null;
    const iconSize = "w-3.5 h-3.5 sm:w-4 sm:h-4";
    switch (keyCardEntry.human) {
      case 'GREEN':
        return <CheckIcon className={cn(iconSize, "text-green-600 dark:text-green-500")} title="Your Green Agent" />;
      case 'ASSASSIN':
        return <Skull className={cn(iconSize, "text-red-600 dark:text-red-500")} title="Your Assassin" />;
      case 'BYSTANDER':
      default:
        return null;
    }
  };

  const renderAIKeyHintIcon = () => {
    if (!keyCardEntry || revealedState !== 'hidden') return null;
    const iconSize = "w-3.5 h-3.5 sm:w-4 sm:h-4";
    switch (keyCardEntry.ai) {
      case 'GREEN':
        return <BotIcon className={cn(iconSize, "text-blue-600 dark:text-blue-500")} title="AI's Green Agent" />;
      case 'ASSASSIN':
        return <AlertTriangleIcon className={cn(iconSize, "text-orange-600 dark:text-orange-500")} title="AI's Assassin" />;
      case 'BYSTANDER':
      default:
        return null;
    }
  };

  const showWordText = revealedState === 'hidden' || revealedState === 'bystander_human_turn' || revealedState === 'bystander_ai_turn';

  return (
    <Card
      className={cn(
        'relative flex flex-col items-center justify-center aspect-[4/3] sm:aspect-video p-1 sm:p-2 rounded-lg shadow-md select-none text-center',
        getCardClasses(),
        isClickable ? 'cursor-pointer' : 'cursor-not-allowed opacity-90',
        revealedState !== 'hidden' && 'cursor-default pointer-events-none'
      )}
      onClick={() => revealedState === 'hidden' && isClickable && onCardClick(id)}
      aria-label={word}
      role="button"
      tabIndex={revealedState === 'hidden' && isClickable ? 0 : -1}
      aria-pressed={revealedState !== 'hidden'}
      aria-disabled={!isClickable || revealedState !== 'hidden'}
    >
      {/* Human Key Hint Icon (Top-Left) */}
      {revealedState === 'hidden' && keyCardEntry && (
        <div
          className="absolute top-1 left-1 sm:top-1.5 sm:left-1.5"
          title={keyCardEntry.human === 'GREEN' ? "Your Agent" : keyCardEntry.human === 'ASSASSIN' ? "Your Assassin" : "Bystander (for you)"}
        >
          {renderHumanKeyHintIcon()}
        </div>
      )}

      {/* AI Key Hint Icon (Top-Right) */}
      {revealedState === 'hidden' && keyCardEntry && (
        <div
          className="absolute top-1 right-1 sm:top-1.5 sm:right-1.5"
          title={keyCardEntry.ai === 'GREEN' ? "AI's Agent" : keyCardEntry.ai === 'ASSASSIN' ? "AI's Assassin" : "Bystander (for AI)"}
        >
          {renderAIKeyHintIcon()}
        </div>
      )}

      <CardContent className="p-1 flex flex-col items-center justify-center w-full h-full">
        {revealedState !== 'hidden' && renderRevealedIcon()}
        {showWordText && (
          <span className={cn(
            "font-medium text-xs sm:text-sm md:text-base break-words leading-tight",
          )}>
            {word.toUpperCase()}
          </span>
        )}
      </CardContent>
    </Card>
  );
};

export default WordCard;
