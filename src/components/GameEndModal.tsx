
import type React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button'; // For play again

interface GameEndModalProps {
  isOpen: boolean;
  message: string;
  isWin: boolean;
  onPlayAgain: () => void;
}

const GameEndModal: React.FC<GameEndModalProps> = ({ isOpen, message, isWin, onPlayAgain }) => {
  if (!isOpen) return null;

  return (
    <AlertDialog open={isOpen} onOpenChange={() => {}}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className={isWin ? 'text-green-600' : 'text-destructive'}>
            {isWin ? 'Congratulations!' : 'Game Over'}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-lg">
            {message}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button onClick={onPlayAgain} className="bg-primary hover:bg-primary/90 text-primary-foreground">
            Play Again
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default GameEndModal;
