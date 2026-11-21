import React from 'react';
import { History, Undo2 } from 'lucide-react';

interface MasterBoardProps {
  drawnNumbers: Set<number>;
  lastDrawn: number | null;
  drawHistory?: number[];
  onUndoLast?: () => void;
}

const getBallLetterAndColor = (num: number) => {
  if (num <= 15) return { letter: 'B', badge: 'bg-blue-100 text-blue-700 border-blue-200' };
  if (num <= 30) return { letter: 'I', badge: 'bg-red-100 text-red-700 border-red-200' };
  if (num <= 45) return { letter: 'N', badge: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
  if (num <= 60) return { letter: 'G', badge: 'bg-orange-100 text-orange-700 border-orange-200' };
  return { letter: 'O', badge: 'bg-purple-100 text-purple-700 border-purple-200' };
};

const MasterBoard: React.FC<MasterBoardProps> = ({
  drawnNumbers,
  lastDrawn,
  drawHistory = [],
  onUndoLast,
}) => {
  const renderRange = (label: string, start: number, end: number, colorClass: string) => {
    const numbers = [];
    for (let i = start; i <= end; i++) {
      numbers.push(i);
    }

    return (
      <div className="flex flex-row items-center mb-2 border-b border-slate-200 pb-1 last:border-0">
        <div className={`w-8 font-bold text-xl ${colorClass} mr-2 flex-shrink-0`}>{label}</div>
        <div className="flex flex-wrap gap-1">
          {numbers.map((num) => {
            const isDrawn = drawnNumbers.has(num);
            const isLast = num === lastDrawn;
            
            return (
              <div
                key={num}
                className={`
                  w-8 h-8 flex items-center justify-center text-sm font-medium rounded-full transition-all duration-300
                  ${isLast 
                    ? 'bg-brand-lime text-brand-blue scale-110 shadow-lg ring-2 ring-lime-200 z-10 font-bold' 
                    : isDrawn 
                      ? 'bg-brand-blue text-white' 
                      : 'bg-slate-100 text-slate-300'}
                `}
              >
                {num}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const reversedHistory = [...drawHistory].reverse();

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-4">
      <div>
        <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Mesa de Controle</h3>
            <span className="bg-brand-blue text-white text-xs font-bold px-2 py-1 rounded-md shadow-sm">
                {drawnNumbers.size} Sorteados
            </span>
        </div>
        <div className="space-y-1">
          {renderRange('B', 1, 15, 'text-blue-500')}
          {renderRange('I', 16, 30, 'text-red-500')}
          {renderRange('N', 31, 45, 'text-emerald-500')}
          {renderRange('G', 46, 60, 'text-orange-500')}
          {renderRange('O', 61, 75, 'text-purple-500')}
        </div>
      </div>

      {drawHistory.length > 0 && (
        <div className="pt-3 border-t border-slate-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <History className="w-3.5 h-3.5" />
              Histórico em Ordem ({drawHistory.length})
            </span>
            {onUndoLast && (
              <button
                type="button"
                onClick={onUndoLast}
                className="text-xs font-medium text-slate-600 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded-md transition-colors flex items-center gap-1"
                title="Desfazer o último número sorteado"
              >
                <Undo2 className="w-3.5 h-3.5" />
                Desfazer último
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
            {reversedHistory.map((num, idx) => {
              const order = drawHistory.length - idx;
              const isLatest = idx === 0;
              const { letter, badge } = getBallLetterAndColor(num);
              return (
                <span
                  key={num}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold border ${
                    isLatest
                      ? 'bg-brand-lime/25 text-brand-blue border-brand-lime ring-1 ring-brand-lime/50'
                      : badge
                  }`}
                  title={`${order}º número sorteado: ${letter}-${num}`}
                >
                  <span className="opacity-60 font-medium">#{order}</span>
                  <span>{letter}{num}</span>
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default MasterBoard;