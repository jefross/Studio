
import type React from 'react';
import type { WordCardData, CardType } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { ShieldCheck, Skull, CircleHelp } from 'lucide-react';

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

  const renderIcon = () => {
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
      {/* Human Key Hint - more prominent */}
      {revealedState === 'hidden' && keyCardEntry && (
        <div
          title={`Your key: ${keyCardEntry.human}`}
          className={cn(
            "absolute top-1 left-1 w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full border-2",
            keyCardEntry.human === 'GREEN' && 'bg-green-500 border-green-700',
            keyCardEntry.human === 'ASSASSIN' && 'bg-red-500 border-red-700',
            keyCardEntry.human === 'BYSTANDER' && 'bg-gray-400 border-gray-500',
            !keyCardEntry.human && 'border-transparent bg-transparent' // Fallback
          )}
        />
      )}

      <CardContent className="p-1 flex flex-col items-center justify-center w-full h-full">
        {revealedState !== 'hidden' && renderIcon()}
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
