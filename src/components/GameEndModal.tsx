
import type React from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import Confetti from './Confetti'; // Import the Confetti component
import { CheckCircle, XCircle } from 'lucide-react';


interface GameEndModalProps {
  isOpen: boolean;
  message: string;
  isWin: boolean;
  onPlayAgain: () => void;
}

const GameEndModal: React.FC<GameEndModalProps> = ({ isOpen, message, isWin, onPlayAgain }) => {
  if (!isOpen) return null;

  const titleText = isWin ? "Victory! Well Done, Agents!" : "Game Over";
  const IconComponent = isWin ? CheckCircle : XCircle;
  const iconColor = isWin ? 'text-green-500' : 'text-destructive';

  return (
    <>
      {isWin && <Confetti isVisible={isOpen} />}
      <AlertDialog open={isOpen} onOpenChange={() => { /* Modal managed by parent state */ }}>
        <AlertDialogContent className="text-center">
          <AlertDialogHeader>
            <div className="flex justify-center mb-4">
              <IconComponent className={`h-16 w-16 ${iconColor}`} />
            </div>
            <AlertDialogTitle className={`text-2xl font-bold ${isWin ? 'text-primary' : 'text-destructive'}`}>
              {titleText}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-md text-foreground/80 pt-2">
              {message}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:justify-center pt-4">
            <Button onClick={onPlayAgain} className="bg-primary hover:bg-primary/90 text-primary-foreground px-8 py-3 text-lg">
              Play Again
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default GameEndModal;
