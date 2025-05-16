import type React from 'react';
import type { WordCardData, CardType } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { ShieldCheck, Skull, CircleHelp, CheckIcon } from 'lucide-react';

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
        return 'bg-primary text-primary-foreground'; 
      case 'assassin':
        return 'bg-destructive text-destructive-foreground';
      case 'bystander_human_turn':
      case 'bystander_ai_turn':
        return 'bg-bystander text-bystander-foreground'; 
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
        return <CircleHelp className={cn(iconClass, "text-bystander-foreground")} />;
      default:
        return null;
    }
  };

  const renderHumanKeyHintIcon = () => {
    if (!keyCardEntry || revealedState !== 'hidden') return null;
    const iconSize = "w-5 h-5 sm:w-6 sm:h-6";
    switch (keyCardEntry.human) {
      case 'GREEN':
        return (
          <div className="rounded-full bg-primary/15 p-0.5 flex items-center justify-center">
            <CheckIcon className={cn(iconSize, "text-[hsl(var(--primary))] stroke-[3]")} />
          </div>
        );
      case 'ASSASSIN':
        return <Skull className={cn(iconSize, "text-[hsl(var(--destructive))] opacity-75")} />;
      case 'BYSTANDER':
      default:
        return null;
    }
  };

  // AI Key Hint Icon rendering is removed as per user request

  const showWordText = revealedState === 'hidden' || revealedState === 'bystander_human_turn' || revealedState === 'bystander_ai_turn';

  return (
    <Card
      className={cn(
        'relative flex flex-col items-center justify-center p-1 sm:p-2 rounded-lg shadow-md select-none text-center',
        'w-full h-[40px] sm:h-[60px] md:h-[80px]', // Reduced height by 20px at each breakpoint
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
          className="absolute top-0.5 left-0.5 sm:top-1 sm:left-1"
          title={keyCardEntry.human === 'GREEN' ? "Your Agent" : keyCardEntry.human === 'ASSASSIN' ? "Your Assassin" : "Bystander (for you)"}
        >
          {renderHumanKeyHintIcon()}
        </div>
      )}

      {/* AI Key Hint Icon (Top-Right) - REMOVED */}

      <CardContent className="p-1 flex flex-col items-center justify-center w-full h-full overflow-hidden">
        {revealedState !== 'hidden' && renderRevealedIcon()}
        {showWordText && (
          <span className={cn(
            "font-medium text-xs sm:text-sm md:text-base leading-tight max-w-full",
            "line-clamp-2 text-center" // Ensure text doesn't overflow by limiting to 2 lines
          )}>
            {word.toUpperCase()}
          </span>
        )}
      </CardContent>
    </Card>
  );
};

export default WordCard;

