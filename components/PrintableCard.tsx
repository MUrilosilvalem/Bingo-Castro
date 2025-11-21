import React from 'react';
import { BingoCard } from '../types';

interface PrintableCardProps {
  card: BingoCard;
}

export const PrintableCard: React.FC<PrintableCardProps> = ({ card }) => {
  return (
    <div className="border-2 border-black p-4 break-inside-avoid bg-white text-black w-full max-w-[300px] mx-auto">
      <div className="text-center border-b-2 border-black mb-2 pb-1">
        <h2 className="text-2xl font-black uppercase tracking-widest">BINGO</h2>
        <div className="flex justify-between text-xs mt-1 font-medium">
          <span className="truncate max-w-[150px]">{card.playerName}</span>
          <span>#{card.id}</span>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-0 border-2 border-black">
        {/* Headers */}
        {['B', 'I', 'N', 'G', 'O'].map((char) => (
          <div key={char} className="h-8 flex items-center justify-center font-black text-lg border-b-2 border-r-2 border-black last:border-r-0 bg-gray-200 print:bg-gray-200">
            {char}
          </div>
        ))}

        {/* Grid */}
        {card.grid.flat().map((cell, idx) => {
          // Calculate borders based on position
          const colIndex = idx % 5;
          const rowIndex = Math.floor(idx / 5);
          const isLastRow = rowIndex === 4;
          const isLastCol = colIndex === 4;

          return (
            <div 
              key={idx} 
              className={`
                h-12 flex items-center justify-center text-xl font-bold
                ${!isLastCol ? 'border-r border-black' : ''}
                ${!isLastRow ? 'border-b border-black' : ''}
              `}
            >
              {cell.number === 'FREE' ? (
                <span className="text-xs font-bold rotate-0">FREE</span>
              ) : (
                cell.number
              )}
            </div>
          );
        })}
      </div>
      <div className="text-[10px] text-center mt-1 text-gray-500">
        Bingo Master Pro
      </div>
    </div>
  );
};