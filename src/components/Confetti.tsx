
"use client";

import React, { useEffect, useState, useMemo } from 'react';

const ConfettiPiece: React.FC<{
  id: number;
  initialX: number;
  initialY: number;
  initialRotation: number;
  fallDuration: number;
  swayDuration: number;
  delay: number;
  color: string;
  width: string;
  height: string;
}> = ({
  initialX,
  initialY,
  initialRotation,
  fallDuration,
  swayDuration,
  delay,
  color,
  width,
  height,
}) => {
  const style = {
    backgroundColor: color,
    left: `${initialX}vw`,
    top: `${initialY}vh`,
    transform: `rotate(${initialRotation}deg)`,
    animation: `fall ${fallDuration}s linear ${delay}s forwards, sway ${swayDuration}s ease-in-out ${delay}s infinite alternate`,
    width: width,
    height: height,
    opacity: 1,
    position: 'absolute' as const, // Ensure position is a literal
    borderRadius: '2px', // Slightly rounded confetti
  };

  return <div style={style} />;
};

const Confetti: React.FC<{ count?: number; isVisible: boolean }> = ({ count = 150, isVisible }) => {
  const colors = useMemo(() => ['#FFD700', '#FF4500', '#32CD32', '#1E90FF', '#FF69B4', '#ADFF2F', '#BA55D3'], []); // Festive colors

  const pieces = useMemo(() => {
    if (!isVisible) return [];
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      initialX: Math.random() * 100,
      initialY: Math.random() * -60 - 10, // Start further off-screen
      initialRotation: Math.random() * 360,
      fallDuration: Math.random() * 3 + 4, // 4-7 seconds
      swayDuration: Math.random() * 1.5 + 1, // 1-2.5 seconds
      delay: Math.random() * 2.5, // 0-2.5 seconds delay
      color: colors[Math.floor(Math.random() * colors.length)],
      width: Math.random() > 0.3 ? '8px' : '10px',
      height: Math.random() > 0.3 ? '15px' : '12px',
    }));
  }, [count, colors, isVisible]);

  if (!isVisible) {
    return null;
  }

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[200] overflow-hidden">
      {pieces.map(p => (
        <ConfettiPiece
          key={p.id}
          id={p.id}
          initialX={p.initialX}
          initialY={p.initialY}
          initialRotation={p.initialRotation}
          fallDuration={p.fallDuration}
          swayDuration={p.swayDuration}
          delay={p.delay}
          color={p.color}
          width={p.width}
          height={p.height}
        />
      ))}
    </div>
  );
};

export default Confetti;
