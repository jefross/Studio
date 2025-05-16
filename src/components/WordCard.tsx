import type React from 'react';
import type { WordCardData, CardType } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { ShieldCheck, Skull, CircleHelp, User, BotIcon } from 'lucide-react';

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
        return 'bg-primary/90 text-primary-foreground border-primary/50 shadow-[0_0_5px_1px_rgba(var(--primary),0.35)]'; 
      case 'assassin':
        return 'bg-destructive/90 text-destructive-foreground border-destructive/50 shadow-[0_0_5px_1px_rgba(var(--destructive),0.35)]';
      case 'bystander_human_turn':
      case 'bystander_ai_turn':
        return 'bg-bystander/90 text-bystander-foreground border-bystander/50 shadow-[0_0_5px_1px_rgba(var(--card),0.35)]'; 
      case 'hidden':
      default:
        return 'bg-card hover:bg-accent/10 dark:hover:bg-accent/20 transition-colors duration-150 text-card-foreground border-accent/30 hover:border-accent/60 shadow-sm';
    }
  };

  const renderRevealedIcon = () => {
    const size = "h-5 w-5 sm:h-6 sm:w-6 md:h-7 md:w-7";
    
    switch (revealedState) {
      case 'green':
        return <ShieldCheck className={cn(size, "text-primary-foreground")} />;
      case 'assassin':
        return <Skull className={cn(size, "text-destructive-foreground")} />;
      case 'bystander_human_turn':
        return <User className={cn(size, "text-bystander-foreground")} />;
      case 'bystander_ai_turn':
        return <BotIcon className={cn(size, "text-bystander-foreground")} />;
      default:
        return null;
    }
  };

  const renderHumanKeyHint = () => {
    if (!keyCardEntry || revealedState !== 'hidden') return null;
    
    switch (keyCardEntry.human) {
      case 'GREEN':
        return (
          <div className="absolute top-0.5 left-0.5 sm:top-1 sm:left-1 w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full bg-primary/90 flex items-center justify-center"
            title="Your Agent">
            <User className="h-2 w-2 sm:h-2.5 sm:w-2.5 text-primary-foreground" />
          </div>
        );
      case 'ASSASSIN':
        return (
          <div className="absolute top-0.5 left-0.5 sm:top-1 sm:left-1 w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full bg-destructive/90 flex items-center justify-center"
            title="Your Assassin">
            <User className="h-2 w-2 sm:h-2.5 sm:w-2.5 text-destructive-foreground" />
          </div>
        );
      default:
        return null;
    }
  };

  const showWordText = revealedState === 'hidden' || revealedState === 'bystander_human_turn' || revealedState === 'bystander_ai_turn';

  return (
    <Card
      className={cn(
        'relative flex flex-col items-center justify-center p-1 sm:p-2 rounded-lg border',
        'w-full h-full min-h-[40px] sm:min-h-[65px] md:min-h-[75px]',
        getCardClasses(),
        isClickable ? 'cursor-pointer transform transition-transform duration-150 hover:-translate-y-1 active:translate-y-0' : 'cursor-not-allowed',
        revealedState !== 'hidden' && 'cursor-default'
      )}
      onClick={() => revealedState === 'hidden' && isClickable && onCardClick(id)}
      aria-label={word}
      role="button"
      tabIndex={revealedState === 'hidden' && isClickable ? 0 : -1}
      aria-pressed={revealedState !== 'hidden'}
      aria-disabled={!isClickable || revealedState !== 'hidden'}
    >
      {/* Render the human key hint */}
      {renderHumanKeyHint()}

      <CardContent className="p-0 flex flex-col items-center justify-center w-full h-full text-center">
        {revealedState !== 'hidden' && (
          <div className="mb-0.5">{renderRevealedIcon()}</div>
        )}

        {showWordText && (
          <span className={cn(
            "font-medium text-center leading-tight",
            word.length > 10 ? "text-xs md:text-sm" : "text-sm md:text-base",
            "max-w-full px-1",
            revealedState !== 'hidden' ? 'opacity-90' : ''
          )}>
            {word.toUpperCase()}
          </span>
        )}
      </CardContent>
    </Card>
  );
};

export default WordCard;

