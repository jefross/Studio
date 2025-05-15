
import type React from 'react';
import type { WordCardData } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { ShieldCheck, Skull, UserX, Bot, CircleHelp } from 'lucide-react'; // Added CircleHelp for Bystanders

interface WordCardProps {
  cardData: WordCardData;
  onCardClick: (id: number) => void;
  isClickable: boolean;
}

const WordCard: React.FC<WordCardProps> = ({ cardData, onCardClick, isClickable }) => {
  const { word, id, revealedState } = cardData; // keyCardEntry removed from destructuring as it's not directly used for rendering classes here.

  const getCardClasses = () => {
    switch (revealedState) {
      case 'green':
        return 'bg-primary text-primary-foreground dark:bg-primary/80';
      case 'assassin':
        return 'bg-destructive text-destructive-foreground dark:bg-destructive/80';
      case 'bystander_human_turn':
      case 'bystander_ai_turn':
        // Using a neutral color for bystanders, distinct from hidden and other states.
        // Consider a tan/beige or a light gray.
        // For now, let's use secondary which is a light gray, and ensure text is readable.
        return 'bg-yellow-400 dark:bg-yellow-600 text-black'; // Kept yellow for now as it's visually distinct
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
        return <CircleHelp className={cn(iconClass, "text-black")} />; // Generic bystander icon
      case 'bystander_ai_turn':
        return <CircleHelp className={cn(iconClass, "text-black")} />; // Generic bystander icon
      default:
        return null;
    }
  };

  // Text should only be visible if the card is hidden, or if it's a bystander.
  // For revealed green/assassin, the icon takes precedence.
  const showWordText = revealedState === 'hidden' || revealedState === 'bystander_human_turn' || revealedState === 'bystander_ai_turn';

  return (
    <Card
      className={cn(
        'flex flex-col items-center justify-center aspect-[4/3] sm:aspect-video p-1 sm:p-2 rounded-lg shadow-md select-none text-center',
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
      <CardContent className="p-1 flex flex-col items-center justify-center w-full h-full">
        {revealedState !== 'hidden' && renderIcon()}
        {showWordText && (
          <span className={cn(
            "font-medium text-xs sm:text-sm md:text-base break-words leading-tight",
            // Text color is primarily handled by getCardClasses, but can add specifics if needed
            // e.g., revealedState === 'bystander_human_turn' && 'text-neutral-800 dark:text-neutral-300',
          )}>
            {word.toUpperCase()}
          </span>
        )}
         {/* Debug info - can be removed or kept for development 
        <div className="text-xs opacity-50 mt-1 absolute bottom-0 right-0 p-0.5 leading-none">
          <span className={cn(keyCardEntry.human === 'GREEN' && 'text-green-700', keyCardEntry.human === 'ASSASSIN' && 'text-red-700')}>H</span>
          <span className={cn(keyCardEntry.ai === 'GREEN' && 'text-green-700', keyCardEntry.ai === 'ASSASSIN' && 'text-red-700')}>A</span>
        </div>
        */}
      </CardContent>
    </Card>
  );
};

export default WordCard;

