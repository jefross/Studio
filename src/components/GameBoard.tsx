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
    <div className="w-full max-w-3xl mx-auto">
      <div className="grid grid-cols-5 gap-2 sm:gap-3 p-4 bg-secondary/50 rounded-lg shadow-inner">
        {cards.map((card) => (
          <div key={card.id} className="w-full">
            <WordCard
              cardData={card}
              onCardClick={onCardClick}
              isClickable={isClickableForHuman && card.revealedState === 'hidden'}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default GameBoard;
