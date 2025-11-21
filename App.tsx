import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BingoCard, GameStatus } from './types';
import { generateCard, updateCardStats } from './utils/bingoLogic';
import MasterBoard from './components/MasterBoard';
import StatsPanel from './components/StatsPanel';
import { PrintableCard } from './components/PrintableCard';
import { CardPreview } from './components/CardPreview';
import { 
  Play, RotateCcw, Plus, UserPlus, Trophy, Printer, 
  Users, ArrowLeft, Check, Keyboard, Dices, LayoutGrid, 
  Gamepad2, Trash2, Upload, ImageIcon
} from 'lucide-react';

const App: React.FC = () => {
  const [status, setStatus] = useState<GameStatus>('SETUP');
  const [viewMode, setViewMode] = useState<'GAME' | 'GENERATOR' | 'PRINT'>('GENERATOR');
  const [drawnNumbers, setDrawnNumbers] = useState<Set<number>>(new Set());
  const [lastDrawn, setLastDrawn] = useState<number | null>(null);
  const [cards, setCards] = useState<BingoCard[]>([]);
  
  // Setup State
  const [newPlayerName, setNewPlayerName] = useState('');
  const [batchQuantity, setBatchQuantity] = useState<number>(10);
  const [batchPrefix, setBatchPrefix] = useState<string>('Cartela');
  const [customLogo, setCustomLogo] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Draw Mode State (Auto vs Manual)
  const [drawMode, setDrawMode] = useState<'AUTO' | 'MANUAL'>('AUTO');
  const [manualInput, setManualInput] = useState<string>('');
  const [manualError, setManualError] = useState<string | null>(null);

  // Derived state to check if game is over
  const hasWinner = cards.some(c => c.isWinner);

  // --- Actions ---

  const handleLogoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setCustomLogo(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

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

  const handleDeleteCard = (id: string) => {
    setCards(prev => prev.filter(c => c.id !== id));
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
    if (window.confirm("Tem certeza que deseja reiniciar o sorteio? Todas as marcações serão perdidas.")) {
      setStatus('SETUP');
      setDrawnNumbers(new Set());
      setLastDrawn(null);
      // Reset cards stats but keep players
      setCards(prev => prev.map(c => ({...c, missingCount: 24, isWinner: false, grid: c.grid.map(row => row.map(cell => ({...cell, isMarked: cell.number === 'FREE'}))) })));
    }
  };

  const handleClearPlayers = () => {
      if (window.confirm("Isso apagará DEFINITIVAMENTE todas as cartelas geradas. Continuar?")) {
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

  // Auto-play sound effect
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
    let borderColor = 'border-white';
    
    // Classic Bingo Colors
    if (lastDrawn <= 15) color = 'bg-blue-600';
    else if (lastDrawn <= 30) color = 'bg-red-600';
    else if (lastDrawn <= 45) color = 'bg-emerald-600'; // Green
    else if (lastDrawn <= 60) color = 'bg-orange-600';
    else color = 'bg-purple-600';

    return (
      <div className="flex flex-col items-center animate-in zoom-in duration-300">
        <div className={`w-40 h-40 md:w-48 md:h-48 rounded-full shadow-2xl flex items-center justify-center ${color} ${text} border-8 ${borderColor} ring-4 ring-brand-blue/20`}>
          <span className="text-7xl md:text-8xl font-black tracking-tighter">{lastDrawn}</span>
        </div>
        <div className="mt-4 text-2xl font-bold text-brand-blue uppercase tracking-widest">
            {lastDrawn <= 15 ? 'B' : lastDrawn <= 30 ? 'I' : lastDrawn <= 45 ? 'N' : lastDrawn <= 60 ? 'G' : 'O'}
        </div>
      </div>
    );
  };

  const renderGeneratorView = () => (
    <div className="max-w-7xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Forms Column */}
        <div className="lg:col-span-1 space-y-6">
            
            {/* Logo Upload Section */}
            <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-slate-400">
                <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <ImageIcon className="w-5 h-5 text-slate-600" /> Personalizar Logo
                </h2>
                <div className="space-y-3">
                    <label className="block text-sm text-slate-600">
                        Carregue a imagem da logo para aparecer no topo e nas impressões.
                    </label>
                    <div className="flex items-center gap-3">
                        <label className="cursor-pointer bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg border border-slate-300 flex items-center gap-2 text-sm font-medium transition-colors">
                            <Upload className="w-4 h-4" />
                            Escolher Arquivo
                            <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                        </label>
                        {customLogo && <span className="text-xs text-green-600 font-bold flex items-center gap-1"><Check className="w-3 h-3"/> Carregada</span>}
                    </div>
                </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border-t-4 border-brand-blue">
                <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <UserPlus className="w-5 h-5 text-brand-blue" /> Adicionar Individual
                </h2>
                <form onSubmit={handleAddPlayer} className="flex gap-2">
                    <input 
                        ref={nameInputRef}
                        type="text" 
                        value={newPlayerName}
                        onChange={(e) => setNewPlayerName(e.target.value)}
                        placeholder="Nome do Jogador"
                        className="flex-1 px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue"
                    />
                    <button 
                        type="submit"
                        className="bg-brand-blue text-white px-4 py-2 rounded-lg hover:bg-brand-blue/90 transition-colors"
                    >
                        <Plus className="w-5 h-5" />
                    </button>
                </form>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border-t-4 border-brand-lime">
                <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <Users className="w-5 h-5 text-brand-lime" /> Gerar Lote
                </h2>
                <form onSubmit={handleBatchGenerate} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-600 mb-1">Prefixo do Nome</label>
                        <input 
                            type="text" 
                            value={batchPrefix}
                            onChange={(e) => setBatchPrefix(e.target.value)}
                            className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-600 mb-1">Quantidade</label>
                        <input 
                            type="number" 
                            min="1" 
                            max="100"
                            value={batchQuantity}
                            onChange={(e) => setBatchQuantity(parseInt(e.target.value))}
                            className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue"
                        />
                    </div>
                    <button 
                        type="submit"
                        className="w-full bg-brand-blue/5 text-brand-blue border border-brand-blue/20 py-3 rounded-lg hover:bg-brand-blue/10 transition-colors font-medium flex items-center justify-center gap-2"
                    >
                        <Users className="w-4 h-4" /> Gerar {batchQuantity} Cartelas
                    </button>
                </form>
            </div>
        </div>

        {/* List Column */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col h-[calc(100vh-150px)]">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-xl">
                <h2 className="font-bold text-slate-700">Cartelas Geradas ({cards.length})</h2>
                {cards.length > 0 && (
                    <button onClick={handleClearPlayers} className="text-sm text-red-500 hover:text-red-700 flex items-center gap-1 px-3 py-1 rounded hover:bg-red-50 transition-colors">
                        <Trash2 className="w-4 h-4" /> Limpar Tudo
                    </button>
                )}
            </div>
            <div className="flex-1 overflow-y-auto p-4 bg-slate-100/50">
                {cards.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400">
                        <LayoutGrid className="w-16 h-16 mb-4 opacity-20" />
                        <p>Nenhuma cartela gerada ainda.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {cards.map(card => (
                            <div key={card.id} className="relative group">
                                <CardPreview card={card} />
                                <button 
                                    onClick={() => handleDeleteCard(card.id)}
                                    className="absolute top-2 right-2 bg-white text-red-500 p-1.5 rounded-md shadow opacity-0 group-hover:opacity-100 transition-opacity border border-slate-200 hover:bg-red-50"
                                    title="Excluir cartela"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    </div>
  );

  const renderGameView = () => (
    <div className="max-w-[1600px] mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-100px)]">
        {/* Left Column: Controls & Board */}
        <div className="lg:col-span-7 flex flex-col gap-6 overflow-y-auto">
            
            {/* Draw Area */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-8 relative overflow-hidden shrink-0">
                {/* Decorative Gradient based on Brand Colors */}
                <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-brand-blue via-brand-lime to-brand-blue"></div>
                
                {/* Mode Toggle */}
                <div className="absolute top-4 right-4 flex bg-slate-100 rounded-lg p-1 z-20">
                    <button 
                        onClick={() => setDrawMode('AUTO')}
                        className={`px-3 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1 ${drawMode === 'AUTO' ? 'bg-white shadow text-brand-blue' : 'text-slate-500'}`}
                    >
                        <Dices className="w-3 h-3"/> Auto
                    </button>
                    <button 
                         onClick={() => setDrawMode('MANUAL')}
                         className={`px-3 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1 ${drawMode === 'MANUAL' ? 'bg-white shadow text-brand-blue' : 'text-slate-500'}`}
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
                                    : 'bg-brand-blue hover:bg-brand-blue/90 text-white shadow-brand-blue/30'}
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
                                    className="flex-1 text-center text-2xl font-bold py-3 rounded-xl border-2 border-slate-200 focus:border-brand-blue focus:outline-none"
                                    autoFocus
                                />
                                <button 
                                    type="submit"
                                    disabled={!manualInput || hasWinner}
                                    className="bg-brand-blue text-white rounded-xl px-6 hover:bg-brand-blue/90 disabled:opacity-50 disabled:cursor-not-allowed"
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
                         <div className="animate-bounce text-brand-lime font-bold text-lg flex items-center gap-2">
                             <Trophy className="w-6 h-6" /> TEMOS VENCEDOR!
                         </div>
                    )}
                </div>
            </div>

            {/* Master Board */}
            <MasterBoard drawnNumbers={drawnNumbers} lastDrawn={lastDrawn} />
        </div>

        {/* Right Column: Stats / Ranking (Expanded) */}
        <div className="lg:col-span-5 flex flex-col h-full min-h-0">
             {cards.length === 0 ? (
                 <div className="bg-white rounded-xl p-8 text-center border border-slate-200 shadow-sm flex flex-col items-center justify-center h-full">
                     <LayoutGrid className="w-16 h-16 text-slate-300 mb-4" />
                     <h3 className="text-xl font-bold text-slate-700 mb-2">Nenhuma cartela no jogo</h3>
                     <p className="text-slate-500 mb-6">Vá para o Gerador para criar cartelas antes de começar.</p>
                     <button 
                        onClick={() => setViewMode('GENERATOR')}
                        className="bg-brand-blue text-white px-6 py-2 rounded-lg hover:bg-brand-blue/90 transition-colors font-medium"
                     >
                         Ir para Gerador
                     </button>
                 </div>
             ) : (
                <StatsPanel cards={cards} />
             )}
        </div>
    </div>
  );

  if (viewMode === 'PRINT') {
      return (
          <div className="min-h-screen bg-white p-8">
              <div className="max-w-6xl mx-auto no-print mb-8 flex justify-between items-center">
                  <h1 className="text-2xl font-bold text-slate-800">Modo de Impressão ({cards.length} cartelas)</h1>
                  <div className="flex gap-4">
                      <button onClick={() => setViewMode('GENERATOR')} className="flex items-center gap-2 px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 border border-slate-300">
                          <ArrowLeft className="w-4 h-4"/> Voltar
                      </button>
                      <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-blue text-white hover:bg-brand-blue/90 shadow-sm">
                          <Printer className="w-4 h-4"/> Imprimir
                      </button>
                  </div>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-8 print:grid-cols-2 print:gap-4">
                  {cards.map(card => (
                      <PrintableCard key={card.id} card={card} logoSrc={customLogo} />
                  ))}
              </div>
          </div>
      )
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 font-sans no-print-ui">
      {/* Navbar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm no-print">
        <div className="max-w-7xl mx-auto px-4 h-24 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Logo Section */}
            <div className="h-20 relative flex items-center">
                <img src={customLogo || "logo.png"} alt="Castro Laboratório" className="h-full w-auto object-contain" onError={(e) => {
                    if (!customLogo) {
                        e.currentTarget.style.display = 'none';
                        e.currentTarget.parentElement!.querySelector('.fallback-logo')!.classList.remove('hidden');
                    }
                }} />
                <div className="fallback-logo hidden flex items-center gap-2">
                    <div className="w-20 h-20 bg-brand-blue rounded-lg flex items-center justify-center text-white font-black text-4xl">C</div>
                    <div className="flex flex-col leading-tight">
                        <span className="font-bold text-brand-blue text-3xl tracking-tight">CASTRO</span>
                        <span className="text-sm text-slate-500 uppercase tracking-wider">Laboratório Clínico</span>
                    </div>
                </div>
            </div>
          </div>
          
          {/* Tabs */}
          <div className="flex items-center bg-slate-100 p-1 rounded-lg mx-4">
              <button 
                onClick={() => setViewMode('GENERATOR')}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${viewMode === 'GENERATOR' ? 'bg-white shadow text-brand-blue' : 'text-slate-600 hover:text-slate-900'}`}
              >
                  <LayoutGrid className="w-4 h-4" /> <span className="hidden sm:inline">Gerador</span>
              </button>
              <button 
                onClick={() => setViewMode('GAME')}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${viewMode === 'GAME' ? 'bg-white shadow text-brand-blue' : 'text-slate-600 hover:text-slate-900'}`}
              >
                  <Gamepad2 className="w-4 h-4" /> <span className="hidden sm:inline">Jogo</span>
              </button>
              <button 
                onClick={() => setViewMode('PRINT')}
                className="px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 text-slate-600 hover:text-slate-900"
              >
                  <Printer className="w-4 h-4" /> <span className="hidden sm:inline">Imprimir</span>
              </button>
          </div>

          <div className="flex items-center gap-2">
             <button 
                onClick={handleReset}
                className="p-2 text-slate-400 hover:text-brand-blue hover:bg-blue-50 rounded-full transition-colors"
                title="Reiniciar Sorteio"
            >
                <RotateCcw className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full bg-slate-50 no-print">
        {viewMode === 'GENERATOR' && renderGeneratorView()}
        {viewMode === 'GAME' && renderGameView()}
      </main>
    </div>
  );
};

export default App;