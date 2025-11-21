import React, { useMemo } from 'react';
import { BingoCard } from '../types';
import { Trophy } from 'lucide-react';

interface CardPreviewProps {
  card: BingoCard;
  showGrid?: boolean;
}

export const CardPreview: React.FC<CardPreviewProps> = ({ card, showGrid = true }) => {
  
  const missingNumbers = useMemo(() => {
    if (card.isWinner) return [];
    // Find all numbers that are NOT marked
    return card.grid.flat()
      .filter(cell => cell.number !== 'FREE' && !cell.isMarked)
      .map(cell => cell.number);
  }, [card]);

  return (
    <div className={`
      relative rounded-xl border-2 transition-all duration-300 shadow-sm overflow-hidden
      ${card.isWinner 
        ? 'bg-amber-50 border-amber-400 shadow-amber-100 ring-2 ring-amber-200 scale-[1.02]' 
        : card.missingCount === 1
            ? 'bg-red-50 border-red-300 shadow-red-100'
        : card.missingCount <= 3 
          ? 'bg-white border-slate-200' 
          : 'bg-white border-slate-100 text-slate-400'}
      ${showGrid ? 'p-4' : 'p-4 flex items-center justify-between gap-4'} 
    `}>
      
      {/* Header Section */}
      <div className={`${showGrid ? 'flex justify-between items-center mb-3' : 'flex-1 min-w-0'}`}>
        <div className="overflow-hidden">
          <h4 className={`font-bold truncate ${showGrid ? 'text-lg' : 'text-2xl'} ${card.isWinner ? 'text-amber-800' : 'text-slate-800'}`} title={card.playerName}>
              {card.playerName}
          </h4>
          <p className="text-xs font-mono text-slate-500">ID: {card.id}</p>
        </div>
        
        {/* If Grid is shown, the badge is in the header. If not, we handle it differently below */}
        {showGrid && (
            card.isWinner ? (
                <div className="bg-amber-100 text-amber-700 p-1.5 rounded-full animate-bounce">
                    <Trophy className="w-6 h-6" />
                </div>
            ) : (
                <div className={`
                    flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold text-white shrink-0 shadow-sm
                    ${card.missingCount === 1 ? 'bg-red-600 animate-pulse ring-2 ring-red-200' : 
                      card.missingCount === 2 ? 'bg-orange-500' : 
                      card.missingCount === 3 ? 'bg-yellow-500' : 'bg-slate-300'}
                `}>
                    {card.missingCount}
                </div>
            )
        )}
      </div>

      {/* Grid Visualization (Optional) */}
      {showGrid && (
        <>
            <div className="grid grid-cols-5 gap-1">
                {card.grid.flat().map((cell, idx) => (
                <div 
                    key={idx} 
                    className={`
                    w-full aspect-square rounded-[2px] 
                    ${cell.number === 'FREE' ? 'bg-emerald-200/50' : 
                        cell.isMarked 
                            ? card.isWinner ? 'bg-amber-500' : 'bg-blue-500' 
                            : 'bg-slate-200'}
                    `}
                />
                ))}
            </div>
            {!card.isWinner && (
                <div className="mt-3 text-xs text-right font-medium text-slate-400">
                Falta: <span className={`text-base font-bold ${card.missingCount === 1 ? 'text-red-600' : 'text-slate-700'}`}>{card.missingCount}</span>
                </div>
            )}
        </>
      )}

      {/* No Grid Mode - Expanded Info */}
      {!showGrid && (
          <div className="flex items-center gap-4 shrink-0">
              {!card.isWinner ? (
                  <div className="flex flex-col items-end">
                      {/* Show specific missing numbers if count is small */}
                      {missingNumbers.length > 0 && missingNumbers.length <= 5 && (
                          <div className="flex gap-1 mb-1">
                              {missingNumbers.map(num => (
                                  <span key={num} className="inline-flex items-center justify-center w-8 h-8 bg-white border-2 border-slate-200 rounded-full text-sm font-bold text-slate-700 shadow-sm">
                                      {num}
                                  </span>
                              ))}
                          </div>
                      )}
                      <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Faltam</span>
                          <span className={`text-3xl font-black ${card.missingCount === 1 ? 'text-red-600' : card.missingCount <= 3 ? 'text-orange-500' : 'text-slate-400'}`}>
                              {card.missingCount}
                          </span>
                      </div>
                  </div>
              ) : (
                  <div className="flex items-center gap-2 bg-amber-100 px-4 py-2 rounded-lg border border-amber-200">
                      <Trophy className="w-6 h-6 text-amber-600" />
                      <span className="font-black text-amber-800 uppercase tracking-widest">Bingo!</span>
                  </div>
              )}
          </div>
      )}
    </div>
  );
};