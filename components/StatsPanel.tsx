import React, { useMemo } from 'react';
import { BingoCard } from '../types';
import { CardPreview } from './CardPreview';
import { AlertTriangle, Trophy, Sparkles } from 'lucide-react';

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

  // Limit regular cards display to avoid rendering thousands in list if game is large, 
  // but show all high-priority ones.
  
  const renderSection = (title: string, items: BingoCard[], borderColor: string, bgColor: string, icon: React.ReactNode) => {
    if (items.length === 0) return null;
    return (
      <div className="mb-6 last:mb-0 animate-in slide-in-from-bottom-4 duration-500">
        <div className={`flex items-center gap-2 mb-3 pb-2 border-b-2 ${borderColor} sticky top-0 bg-white z-10 pt-2`}>
          {icon}
          <h3 className="font-black text-lg uppercase tracking-wide">{title} <span className="text-slate-400 ml-1 text-sm font-normal">({items.length})</span></h3>
        </div>
        <div className="flex flex-col gap-3">
          {items.map(card => (
            <CardPreview key={card.id} card={card} showGrid={false} />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-6 h-full overflow-y-auto flex flex-col">
      <div className="flex items-center justify-between mb-4 sm:mb-6 border-b border-slate-100 pb-3 sm:pb-4">
        <h2 className="text-xl sm:text-2xl font-bold text-brand-blue flex items-center gap-2">
            <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-brand-lime" />
            Ranking
        </h2>
        <span className="text-xs sm:text-sm font-medium text-slate-500 tabular-nums">
            {cards.length} cartelas em jogo
        </span>
      </div>

      <div className="flex-1 pr-0.5">
        {winners.length > 0 ? (
            renderSection('Vencedores!', winners, 'border-brand-lime text-brand-blue', 'bg-brand-lime/10', <Trophy className="w-6 h-6 text-brand-lime fill-current"/>)
        ) : (
            <div className="text-center p-6 sm:p-8 bg-slate-50 rounded-xl mb-6 border-2 border-dashed border-slate-200">
                <Trophy className="w-9 h-9 sm:w-10 sm:h-10 text-slate-300 mx-auto mb-2" />
                <p className="text-sm sm:text-base font-medium text-slate-400">Aguardando o primeiro grito de BINGO!</p>
            </div>
        )}

        {renderSection('Por Um Número!', oneAway, 'border-red-500 text-red-700', 'bg-red-50', <AlertTriangle className="w-5 h-5 text-red-600 animate-pulse"/>)}
        {renderSection('Faltam 2 Números', twoAway, 'border-orange-400 text-orange-700', 'bg-orange-50', <div className="w-3 h-3 rounded-full bg-orange-500"/>)}
        {renderSection('Faltam 3 Números', threeAway, 'border-yellow-400 text-yellow-700', 'bg-yellow-50', <div className="w-3 h-3 rounded-full bg-yellow-400"/>)}
        
        {oneAway.length === 0 && twoAway.length === 0 && threeAway.length === 0 && winners.length === 0 && (
             <div className="text-center text-slate-400 mt-8 sm:mt-12 italic text-sm">
                 <p>Sorteie mais números para ver quem está na liderança.</p>
             </div>
        )}
      </div>
    </div>
  );
};

export default StatsPanel;