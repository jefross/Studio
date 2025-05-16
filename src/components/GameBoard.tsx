import type React from 'react';
import type { WordCardData } from '@/types';
import WordCard from './WordCard';

interface GameBoardProps {
  cards: WordCardData[];
  onCardClick: (id: number) => void;
  isClickableForHuman: boolean; // True if it's the human player's turn to click/guess
}

const GameBoard: React.FC<GameBoardProps> = ({ cards, onCardClick, isClickableForHuman }) => {
  return (
    <div className="w-full bg-muted/10 rounded-xl p-4 shadow-sm">
      <div 
        className="grid grid-cols-5 gap-1.5 xs:gap-2 sm:gap-3 md:gap-4"
      >
        {cards.map((card, index) => (
          <div 
            key={card.id} 
            className="w-full aspect-[2/1.4] transition-all duration-200 hover:scale-105"
            style={{ 
              animationDelay: `${index * 20}ms`,
              animationDuration: '0.5s',
              animationFillMode: 'both',
              animationName: 'fadeIn'
            }}
          >
            <WordCard
              cardData={card}
              onCardClick={onCardClick}
              isClickable={isClickableForHuman && card.revealedState === 'hidden'}
            />
          </div>
        ))}
      </div>
      
      {/* Board status indicators */}
      <div className="flex justify-center mt-4 space-x-2 text-xs">
        <div className="flex items-center">
          <div className="w-3 h-3 rounded-full bg-primary mr-1"></div>
          <span>Agent</span>
        </div>
        <div className="flex items-center">
          <div className="w-3 h-3 rounded-full bg-destructive mr-1"></div>
          <span>Assassin</span>
        </div>
        <div className="flex items-center">
          <div className="w-3 h-3 rounded-full bg-bystander mr-1"></div>
          <span>Bystander</span>
        </div>
      </div>

      <style jsx global>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
      `}</style>
    </div>
  );
};

export default GameBoard;
