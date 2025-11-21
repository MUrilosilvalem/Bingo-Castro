import React from 'react';
import { BingoCard } from '../types';

interface PrintableCardProps {
  card: BingoCard;
  logoSrc?: string | null;
}

export const PrintableCard: React.FC<PrintableCardProps> = ({ card, logoSrc }) => {
  return (
    <div className="border-4 border-brand-blue p-4 break-inside-avoid bg-white text-black w-full max-w-[300px] mx-auto rounded-xl relative overflow-hidden">
      
      {/* Header with Logo */}
      <div className="text-center border-b-2 border-brand-blue/20 mb-3 pb-2 flex flex-col items-center">
         <div className="h-16 w-full flex items-center justify-center mb-1">
            <img 
                src={logoSrc || "logo.png"} 
                alt="Castro Laboratório" 
                className="h-full w-full object-contain" 
                onError={(e) => {
                    if (!logoSrc) {
                        e.currentTarget.style.display = 'none';
                        e.currentTarget.parentElement!.querySelector('.fallback-logo-print')!.classList.remove('hidden');
                    }
                }}
            />
            <span className="fallback-logo-print hidden font-black text-2xl text-brand-blue tracking-widest">CASTRO</span>
         </div>
         <div className="w-full flex justify-between text-xs font-semibold text-brand-blue uppercase px-1">
            <span className="truncate max-w-[150px]">{card.playerName}</span>
            <span>#{card.id}</span>
         </div>
      </div>

      <div className="grid grid-cols-5 gap-0 border-2 border-brand-blue">
        {/* Headers */}
        {['B', 'I', 'N', 'G', 'O'].map((char, i) => (
          <div key={char} className={`
            h-9 flex items-center justify-center font-black text-lg border-b-2 border-r-2 border-brand-blue last:border-r-0 text-white
            ${i % 2 === 0 ? 'bg-brand-blue' : 'bg-brand-blue/90'} print:bg-brand-blue print:text-white
            `}>
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
                ${!isLastCol ? 'border-r border-brand-blue' : ''}
                ${!isLastRow ? 'border-b border-brand-blue' : ''}
              `}
            >
              {cell.number === 'FREE' ? (
                <div className="w-full h-full bg-brand-lime/20 flex items-center justify-center print:bg-gray-200">
                     <span className="text-[10px] font-black text-brand-blue rotate-0">FREE</span>
                </div>
              ) : (
                <span className="text-slate-800">{cell.number}</span>
              )}
            </div>
          );
        })}
      </div>
      <div className="text-[9px] text-center mt-2 font-medium text-brand-blue/60">
        Boa Sorte! • Castro Laboratório Clínico
      </div>
    </div>
  );
};