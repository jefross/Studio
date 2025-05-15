
import type React from 'react';
import type { WordCardData, CardType } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { ShieldCheck, Skull, CircleHelp, Eye } from 'lucide-react'; // Added Eye for human key hint

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

  const getHumanKeyHintColor = (type: CardType | undefined): string => {
    if (!type) return 'border-transparent';
    switch (type) {
      case 'GREEN':
        return 'border-green-500';
      case 'ASSASSIN':
        return 'border-red-700';
      case 'BYSTANDER':
        return 'border-gray-400';
      default:
        return 'border-transparent';
    }
  };

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
      {/* Human Key Hint - always visible in a corner if card is hidden */}
      {revealedState === 'hidden' && keyCardEntry && (
        <div
          title={`Your key: ${keyCardEntry.human}`}
          className={cn(
            "absolute top-1 left-1 w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full border-2 opacity-70",
            getHumanKeyHintColor(keyCardEntry.human)
          )}
          style={{ backgroundColor: keyCardEntry.human === 'GREEN' ? 'rgba(34, 197, 94, 0.5)' : keyCardEntry.human === 'ASSASSIN' ? 'rgba(239, 68, 68, 0.5)' : 'rgba(156, 163, 175, 0.5)' }}
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
