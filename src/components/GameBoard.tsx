
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
    <div className="grid grid-cols-5 gap-2 sm:gap-3 p-4 bg-secondary/50 rounded-lg shadow-inner max-w-3xl mx-auto">
      {cards.map((card) => (
        <WordCard
          key={card.id}
          cardData={card}
          onCardClick={onCardClick}
          isClickable={isClickableForHuman && card.revealedState === 'hidden'}
        />
      ))}
    </div>
  );
};

export default GameBoard;
