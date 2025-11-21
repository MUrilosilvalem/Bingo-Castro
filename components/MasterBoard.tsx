import React from 'react';

interface MasterBoardProps {
  drawnNumbers: Set<number>;
  lastDrawn: number | null;
}

const MasterBoard: React.FC<MasterBoardProps> = ({ drawnNumbers, lastDrawn }) => {
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
                    ? 'bg-amber-400 text-white scale-110 shadow-lg ring-2 ring-amber-200 z-10 font-bold' 
                    : isDrawn 
                      ? 'bg-slate-800 text-white' 
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

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
      <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Mesa de Controle</h3>
          <span className="bg-slate-100 text-slate-600 text-xs font-bold px-2 py-1 rounded-md border border-slate-200">
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
  );
};

export default MasterBoard;