import React from 'react';
import { BingoCard } from '../types';
import { Trophy, AlertCircle } from 'lucide-react';

interface CardPreviewProps {
  card: BingoCard;
}

export const CardPreview: React.FC<CardPreviewProps> = ({ card }) => {
  return (
    <div className={`
      relative p-3 rounded-lg border transition-all duration-300
      ${card.isWinner 
        ? 'bg-amber-50 border-amber-300 shadow-md ring-2 ring-amber-400' 
        : card.missingCount <= 3 
          ? 'bg-red-50 border-red-200' 
          : 'bg-white border-slate-200 hover:border-blue-300'}
    `}>
      <div className="flex justify-between items-start mb-2">
        <div>
          <h4 className="font-bold text-slate-800 truncate w-32" title={card.playerName}>{card.playerName}</h4>
          <p className="text-xs text-slate-500">ID: {card.id}</p>
        </div>
        {card.isWinner && <Trophy className="w-5 h-5 text-amber-500 animate-bounce" />}
        {!card.isWinner && card.missingCount <= 3 && (
            <div className={`
                flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold text-white
                ${card.missingCount === 1 ? 'bg-red-600 animate-pulse' : 'bg-orange-400'}
            `}>
                {card.missingCount}
            </div>
        )}
      </div>

      {/* Mini Grid Visualization */}
      <div className="grid grid-cols-5 gap-0.5">
        {card.grid.flat().map((cell, idx) => (
          <div 
            key={idx} 
            className={`
              w-full h-1.5 rounded-sm 
              ${cell.number === 'FREE' ? 'bg-emerald-300/50' : cell.isMarked ? 'bg-blue-500' : 'bg-slate-100'}
            `}
          />
        ))}
      </div>
      
      {!card.isWinner && (
         <div className="mt-2 text-xs text-right text-slate-400">
           Faltam: <span className="font-medium text-slate-700">{card.missingCount}</span>
         </div>
      )}
    </div>
  );
};