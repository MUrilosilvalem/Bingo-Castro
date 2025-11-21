import React, { useMemo } from 'react';
import { BingoCard } from '../types';
import { CardPreview } from './CardPreview';
import { AlertTriangle, Trophy } from 'lucide-react';

interface StatsPanelProps {
  cards: BingoCard[];
}

const StatsPanel: React.FC<StatsPanelProps> = ({ cards }) => {
  
  const sortedCards = useMemo(() => {
    // Sort by missing count ascending (closest to winning first)
    return [...cards].sort((a, b) => {
        if (a.isWinner && !b.isWinner) return -1;
        if (!a.isWinner && b.isWinner) return 1;
        return a.missingCount - b.missingCount;
    });
  }, [cards]);

  const winners = sortedCards.filter(c => c.isWinner);
  const oneAway = sortedCards.filter(c => !c.isWinner && c.missingCount === 1);
  const twoAway = sortedCards.filter(c => !c.isWinner && c.missingCount === 2);
  const threeAway = sortedCards.filter(c => !c.isWinner && c.missingCount === 3);

  const renderSection = (title: string, items: BingoCard[], color: string, icon: React.ReactNode) => {
    if (items.length === 0) return null;
    return (
      <div className="mb-6">
        <div className={`flex items-center gap-2 mb-3 pb-1 border-b ${color}`}>
          {icon}
          <h3 className="font-bold text-sm uppercase">{title} ({items.length})</h3>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {items.map(card => (
            <CardPreview key={card.id} card={card} />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 h-full overflow-y-auto">
      <h2 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-600"><line x1="18" x2="18" y1="20" y2="10"/><line x1="12" x2="12" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="14"/></svg>
        Ranking & Monitor
      </h2>

      {winners.length > 0 ? (
          renderSection('Vencedores!', winners, 'border-amber-500 text-amber-600', <Trophy className="w-5 h-5 text-amber-500"/>)
      ) : (
          <div className="text-center p-4 bg-slate-50 rounded-lg mb-6 border border-slate-100">
              <p className="text-sm text-slate-500">Ainda sem vencedores...</p>
          </div>
      )}

      {renderSection('Falta 1 Número (Boa!)', oneAway, 'border-red-500 text-red-600', <AlertTriangle className="w-4 h-4 text-red-500 animate-pulse"/>)}
      {renderSection('Faltam 2 Números', twoAway, 'border-orange-400 text-orange-500', <div className="w-2 h-2 rounded-full bg-orange-500"/>)}
      {renderSection('Faltam 3 Números', threeAway, 'border-yellow-400 text-yellow-600', <div className="w-2 h-2 rounded-full bg-yellow-400"/>)}
      
      {/* Remaining list if needed, or just stop at 3 for focus */}
      {oneAway.length === 0 && twoAway.length === 0 && threeAway.length === 0 && winners.length === 0 && (
          <p className="text-center text-slate-400 text-sm italic mt-10">O jogo está começando...</p>
      )}
    </div>
  );
};

export default StatsPanel;