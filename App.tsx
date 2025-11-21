import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BingoCard, GameStatus } from './types';
import { generateCard, updateCardStats } from './utils/bingoLogic';
import MasterBoard from './components/MasterBoard';
import StatsPanel from './components/StatsPanel';
import { PrintableCard } from './components/PrintableCard';
import { Play, RotateCcw, Plus, UserPlus, Trophy, Printer, Users, ArrowLeft, Check, Keyboard, Dices } from 'lucide-react';

const App: React.FC = () => {
  const [status, setStatus] = useState<GameStatus>('SETUP');
  const [viewMode, setViewMode] = useState<'GAME' | 'PRINT'>('GAME');
  const [drawnNumbers, setDrawnNumbers] = useState<Set<number>>(new Set());
  const [lastDrawn, setLastDrawn] = useState<number | null>(null);
  const [cards, setCards] = useState<BingoCard[]>([]);
  
  // Setup State
  const [newPlayerName, setNewPlayerName] = useState('');
  const [batchQuantity, setBatchQuantity] = useState<number>(10);
  const [batchPrefix, setBatchPrefix] = useState<string>('Cartela');
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Draw Mode State (Auto vs Manual)
  const [drawMode, setDrawMode] = useState<'AUTO' | 'MANUAL'>('AUTO');
  const [manualInput, setManualInput] = useState<string>('');
  const [manualError, setManualError] = useState<string | null>(null);

  // Derived state to check if game is over
  const hasWinner = cards.some(c => c.isWinner);

  // --- Actions ---

  const handleAddPlayer = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!newPlayerName.trim()) return;
    
    const newCard = generateCard(newPlayerName.trim());
    setCards(prev => [...prev, newCard]);
    setNewPlayerName('');
    nameInputRef.current?.focus();
  };

  const handleBatchGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    const quantity = Math.max(1, Math.min(100, batchQuantity)); // Limit to 100 at a time
    
    const newCards: BingoCard[] = [];
    for (let i = 0; i < quantity; i++) {
        const idNum = cards.length + i + 1;
        newCards.push(generateCard(`${batchPrefix} #${idNum}`));
    }
    setCards(prev => [...prev, ...newCards]);
  };

  const handleDrawNumber = useCallback(() => {
    if (drawnNumbers.size >= 75 || hasWinner) return;

    // Pick a number that hasn't been drawn
    let candidate = Math.floor(Math.random() * 75) + 1;
    while (drawnNumbers.has(candidate)) {
      candidate = Math.floor(Math.random() * 75) + 1;
    }

    processNewNumber(candidate);
  }, [drawnNumbers, hasWinner]);

  const handleManualSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      const num = parseInt(manualInput);
      
      if (isNaN(num) || num < 1 || num > 75) {
          setManualError('Digite entre 1 e 75');
          return;
      }
      if (drawnNumbers.has(num)) {
          setManualError('Número já sorteado!');
          return;
      }

      setManualError(null);
      setManualInput('');
      processNewNumber(num);
  };

  const processNewNumber = (num: number) => {
      setLastDrawn(num);
      setDrawnNumbers(prev => {
          const newSet = new Set(prev);
          newSet.add(num);
          return newSet;
      });
      setStatus('PLAYING');
  };

  const handleReset = () => {
    if (window.confirm("Tem certeza que deseja reiniciar o jogo? Todas as marcações serão perdidas.")) {
      setStatus('SETUP');
      setDrawnNumbers(new Set());
      setLastDrawn(null);
      // Reset cards stats but keep players
      setCards(prev => prev.map(c => ({...c, missingCount: 24, isWinner: false, grid: c.grid.map(row => row.map(cell => ({...cell, isMarked: cell.number === 'FREE'}))) })));
    }
  };

  const handleClearPlayers = () => {
      if (window.confirm("Isso apagará todas as cartelas. Continuar?")) {
        setCards([]);
        handleReset();
      }
  };

  // --- Effects ---

  // Update card stats whenever a number is drawn
  useEffect(() => {
    if (status === 'SETUP') return;

    setCards(currentCards => 
      currentCards.map(card => updateCardStats(card, drawnNumbers))
    );
  }, [drawnNumbers, status]);

  // Auto-play sound effect or speech (simple browser speech synthesis)
  useEffect(() => {
    if (lastDrawn) {
        if ('speechSynthesis' in window) {
            const utterance = new SpeechSynthesisUtterance(lastDrawn.toString());
            utterance.lang = 'pt-BR';
            window.speechSynthesis.speak(utterance);
        }
    }
  }, [lastDrawn]);


  // --- Render Helpers ---

  const renderCurrentBall = () => {
    if (!lastDrawn) {
      return (
        <div className="w-40 h-40 md:w-48 md:h-48 rounded-full border-4 border-slate-200 border-dashed flex items-center justify-center bg-slate-50 text-slate-300">
           <span className="text-xl font-medium">---</span>
        </div>
      );
    }

    let color = 'bg-slate-700';
    let text = 'text-white';
    
    if (lastDrawn <= 15) color = 'bg-blue-600';
    else if (lastDrawn <= 30) color = 'bg-red-600';
    else if (lastDrawn <= 45) color = 'bg-emerald-600';
    else if (lastDrawn <= 60) color = 'bg-orange-600';
    else color = 'bg-purple-600';

    return (
      <div className="flex flex-col items-center animate-in zoom-in duration-300">
        <div className={`w-40 h-40 md:w-48 md:h-48 rounded-full shadow-2xl flex items-center justify-center ${color} ${text} border-8 border-white ring-4 ring-slate-100`}>
          <span className="text-7xl md:text-8xl font-black tracking-tighter">{lastDrawn}</span>
        </div>
        <div className="mt-4 text-2xl font-bold text-slate-700 uppercase tracking-widest">
            {lastDrawn <= 15 ? 'B' : lastDrawn <= 30 ? 'I' : lastDrawn <= 45 ? 'N' : lastDrawn <= 60 ? 'G' : 'O'}
        </div>
      </div>
    );
  };

  if (viewMode === 'PRINT') {
      return (
          <div className="min-h-screen bg-white p-8">
              <div className="max-w-6xl mx-auto no-print mb-8 flex justify-between items-center">
                  <h1 className="text-2xl font-bold text-slate-800">Modo de Impressão ({cards.length} cartelas)</h1>
                  <div className="flex gap-4">
                      <button onClick={() => setViewMode('GAME')} className="flex items-center gap-2 px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 border border-slate-300">
                          <ArrowLeft className="w-4 h-4"/> Voltar ao Jogo
                      </button>
                      <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 shadow-sm">
                          <Printer className="w-4 h-4"/> Imprimir
                      </button>
                  </div>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-8 print:grid-cols-2 print:gap-4">
                  {cards.map(card => (
                      <PrintableCard key={card.id} card={card} />
                  ))}
              </div>
          </div>
      )
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 font-sans no-print-ui">
      {/* Navbar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm no-print">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-black">B</div>
            <h1 className="text-xl font-bold text-slate-800 tracking-tight hidden md:block">Bingo Master <span className="text-blue-600">Pro</span></h1>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-slate-100 rounded-full text-sm font-medium text-slate-600">
              <span>Cartelas: {cards.length}</span>
              <span className="w-1 h-1 bg-slate-400 rounded-full"></span>
              <span>Sorteados: {drawnNumbers.size}/75</span>
            </div>
            
            <button 
                onClick={() => setViewMode('PRINT')}
                className="p-2 text-blue-600 hover:bg-blue-50 rounded-full transition-colors flex items-center gap-2 text-sm font-medium px-3 bg-blue-50/50"
                title="Imprimir Cartelas"
            >
                <Printer className="w-5 h-5" />
                <span className="hidden md:inline">Imprimir</span>
            </button>

            <button 
                onClick={handleReset}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
                title="Reiniciar Jogo"
            >
                <RotateCcw className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 no-print">
        
        {/* Left Column: Controls & Board (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
            
            {/* Draw Area */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-8 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500"></div>
                
                {/* Mode Toggle */}
                <div className="absolute top-4 right-4 flex bg-slate-100 rounded-lg p-1 z-20">
                    <button 
                        onClick={() => setDrawMode('AUTO')}
                        className={`px-3 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1 ${drawMode === 'AUTO' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}
                    >
                        <Dices className="w-3 h-3"/> Auto
                    </button>
                    <button 
                         onClick={() => setDrawMode('MANUAL')}
                         className={`px-3 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1 ${drawMode === 'MANUAL' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}
                    >
                        <Keyboard className="w-3 h-3"/> Manual
                    </button>
                </div>

                <div className="flex-1 flex flex-col items-center justify-center">
                    {renderCurrentBall()}
                </div>

                <div className="flex-1 w-full flex flex-col items-center gap-4 z-10">
                    {drawMode === 'AUTO' ? (
                        <button
                            onClick={handleDrawNumber}
                            disabled={hasWinner || drawnNumbers.size >= 75}
                            className={`
                                w-full max-w-xs py-4 rounded-xl font-bold text-xl shadow-lg transition-all transform active:scale-95 flex items-center justify-center gap-3
                                ${hasWinner 
                                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
                                    : 'bg-blue-600 hover:bg-blue-700 text-white hover:shadow-blue-200'}
                            `}
                        >
                            {hasWinner ? (
                                <>Jogo Encerrado</>
                            ) : (
                                <>
                                    <Play className="w-6 h-6 fill-current" />
                                    SORTEAR
                                </>
                            )}
                        </button>
                    ) : (
                        <form onSubmit={handleManualSubmit} className="w-full max-w-xs flex flex-col gap-2">
                            <div className="flex gap-2">
                                <input 
                                    type="number" 
                                    min="1" 
                                    max="75"
                                    value={manualInput}
                                    onChange={(e) => {
                                        setManualInput(e.target.value);
                                        setManualError(null);
                                    }}
                                    placeholder="#"
                                    className="flex-1 text-center text-2xl font-bold py-3 rounded-xl border-2 border-slate-200 focus:border-blue-500 focus:outline-none"
                                    autoFocus
                                />
                                <button 
                                    type="submit"
                                    disabled={!manualInput || hasWinner}
                                    className="bg-blue-600 text-white rounded-xl px-6 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Check className="w-8 h-8" />
                                </button>
                            </div>
                            {manualError && (
                                <p className="text-red-500 text-xs font-semibold text-center">{manualError}</p>
                            )}
                            <p className="text-slate-400 text-xs text-center">Digite o número da bola física</p>
                        </form>
                    )}

                    {hasWinner && (
                         <div className="animate-bounce text-amber-500 font-bold text-lg flex items-center gap-2">
                             <Trophy className="w-6 h-6" /> TEMOS VENCEDOR!
                         </div>
                    )}
                    {drawMode === 'AUTO' && !hasWinner && <p className="text-slate-400 text-sm">Clique ou pressione Espaço</p>}
                </div>
            </div>

            {/* Master Board */}
            <MasterBoard drawnNumbers={drawnNumbers} lastDrawn={lastDrawn} />
        </div>

        {/* Right Column: Sidebar (4 cols) */}
        <div className="lg:col-span-4 flex flex-col gap-6 h-[calc(100vh-100px)] sticky top-24">
            
            <div className="space-y-4 shrink-0">
                {/* Single Player Widget */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                    <h3 className="font-semibold text-slate-700 mb-3 flex items-center gap-2 text-sm">
                        <UserPlus className="w-4 h-4" /> Nova Cartela Individual
                    </h3>
                    <form onSubmit={handleAddPlayer} className="flex gap-2">
                        <input 
                            ref={nameInputRef}
                            type="text" 
                            value={newPlayerName}
                            onChange={(e) => setNewPlayerName(e.target.value)}
                            placeholder="Nome do Jogador"
                            className="flex-1 px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        />
                        <button 
                            type="submit"
                            className="bg-slate-800 text-white p-2 rounded-lg hover:bg-slate-900 transition-colors"
                        >
                            <Plus className="w-4 h-4" />
                        </button>
                    </form>
                </div>

                {/* Batch Widget */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                    <h3 className="font-semibold text-slate-700 mb-3 flex items-center gap-2 text-sm">
                        <Users className="w-4 h-4" /> Gerar Lote de Cartelas
                    </h3>
                    <form onSubmit={handleBatchGenerate} className="flex flex-col gap-3">
                        <div className="flex gap-2">
                            <div className="flex-1">
                                <label className="text-[10px] text-slate-400 uppercase font-bold">Prefixo</label>
                                <input 
                                    type="text" 
                                    value={batchPrefix}
                                    onChange={(e) => setBatchPrefix(e.target.value)}
                                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                />
                            </div>
                            <div className="w-20">
                                <label className="text-[10px] text-slate-400 uppercase font-bold">Qtd</label>
                                <input 
                                    type="number" 
                                    min="1"
                                    max="100"
                                    value={batchQuantity}
                                    onChange={(e) => setBatchQuantity(parseInt(e.target.value))}
                                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                />
                            </div>
                        </div>
                        <button 
                            type="submit"
                            className="w-full bg-slate-100 text-slate-700 border border-slate-200 p-2 rounded-lg hover:bg-slate-200 transition-colors text-sm font-medium"
                        >
                            Gerar {batchQuantity} Cartelas
                        </button>
                    </form>
                </div>
                
                {cards.length > 0 && (
                    <button onClick={handleClearPlayers} className="w-full text-xs text-red-400 hover:text-red-600 underline">
                        Limpar todas as {cards.length} cartelas
                    </button>
                )}
            </div>

            {/* Stats / Ranking */}
            <div className="flex-1 min-h-0">
                <StatsPanel cards={cards} />
            </div>

        </div>

      </main>
    </div>
  );
};

export default App;