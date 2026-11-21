import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { BingoCard, DrawMode, GameStatus, PastGameRecord, ViewMode } from './types';
import { generateCard, updateCardStats } from './utils/bingoLogic';
import { api } from './utils/api';
import { loadBingoState, loadCustomLogo } from './utils/storage';
import MasterBoard from './components/MasterBoard';
import StatsPanel from './components/StatsPanel';
import { PrintableCard } from './components/PrintableCard';
import { CardPreview } from './components/CardPreview';
import { 
  Play, RotateCcw, Plus, UserPlus, Trophy, Printer, 
  Users, ArrowLeft, Check, Keyboard, Dices, LayoutGrid, 
  Gamepad2, Trash2, Upload, ImageIcon, Settings, X, History
} from 'lucide-react';

const VIEW_MODE_KEY = 'bingo_master_view_mode_v1';

const getInitialViewMode = (): ViewMode => {
  try {
    const saved = window.localStorage.getItem(VIEW_MODE_KEY);
    if (saved === 'GAME' || saved === 'GENERATOR' || saved === 'PRINT') return saved;
  } catch {
    // ignore
  }
  return 'GENERATOR';
};

const App: React.FC = () => {
  const [isLoaded, setIsLoaded] = useState<boolean>(false);
  const [status, setStatus] = useState<GameStatus>('SETUP');
  const [viewMode, setViewMode] = useState<ViewMode>(getInitialViewMode);
  const [drawHistory, setDrawHistory] = useState<number[]>([]);
  const [cards, setCards] = useState<BingoCard[]>([]);
  const [pastGames, setPastGames] = useState<PastGameRecord[]>([]);
  
  // Setup State
  const [newPlayerName, setNewPlayerName] = useState('');
  const [batchQuantity, setBatchQuantity] = useState<number>(10);
  const [batchPrefix, setBatchPrefix] = useState<string>('Cartela');
  const [customLogo, setCustomLogo] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const shouldSpeakRef = useRef<boolean>(false);

  // Draw Mode State (Auto vs Manual)
  const [drawMode, setDrawMode] = useState<DrawMode>('AUTO');
  const [manualInput, setManualInput] = useState<string>('');
  const [manualError, setManualError] = useState<string | null>(null);

  const drawnNumbers = useMemo(() => new Set<number>(drawHistory), [drawHistory]);
  const lastDrawn = drawHistory.length > 0 ? drawHistory[drawHistory.length - 1] : null;

  // Derived state to check if game is over
  const hasWinner = cards.some(c => c.isWinner);

  // --- Actions ---

  const handleLogoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = async () => {
      const dataUrl = reader.result as string;
      setActionError(null);
      try {
        await api.updateSettings({ customLogo: dataUrl });
        setCustomLogo(dataUrl);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Não foi possível salvar a logo.');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = async () => {
    setActionError(null);
    try {
      await api.updateSettings({ customLogo: null });
      setCustomLogo(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erro ao remover logo.');
    }
  };

  const handleAddPlayer = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!newPlayerName.trim()) return;
    setActionError(null);

    const rawCard = generateCard(newPlayerName.trim());
    const optimisticCard = drawnNumbers.size > 0 ? updateCardStats(rawCard, drawnNumbers) : rawCard;
    setNewPlayerName('');
    nameInputRef.current?.focus();

    try {
      const res = await api.addCard(optimisticCard);
      setCards(prev => [...prev, ...res.cards]);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erro ao salvar cartela.');
    }
  };

  const handleBatchGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    const quantity = Math.max(1, Math.min(100, batchQuantity));
    
    const newCards: BingoCard[] = [];
    for (let i = 0; i < quantity; i++) {
        const idNum = cards.length + i + 1;
        const rawCard = generateCard(`${batchPrefix} #${idNum}`);
        newCards.push(drawnNumbers.size > 0 ? updateCardStats(rawCard, drawnNumbers) : rawCard);
    }

    try {
      const res = await api.addCardsBatch(newCards);
      setCards(prev => [...prev, ...res.cards]);
      await api.updateSettings({ batchPrefix, batchQuantity: quantity });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erro ao gerar lote de cartelas.');
    }
  };

  const handleDeleteCard = async (id: string) => {
    setActionError(null);
    try {
      await api.deleteCard(id);
      setCards(prev => prev.filter(c => c.id !== id));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erro ao excluir cartela.');
    }
  };

  const processNewNumber = useCallback(async (num: number) => {
      shouldSpeakRef.current = true;
      setManualError(null);
      try {
        const res = await api.addDraw(num);
        setDrawHistory(res.drawHistory);
        setStatus(res.status);
      } catch (err) {
        shouldSpeakRef.current = false;
        setManualError(err instanceof Error ? err.message : 'Erro ao salvar número sorteado.');
      }
  }, []);

  const handleDrawNumber = useCallback(() => {
    if (drawnNumbers.size >= 75 || hasWinner) return;

    // Pick a number that hasn't been drawn
    let candidate = Math.floor(Math.random() * 75) + 1;
    while (drawnNumbers.has(candidate)) {
      candidate = Math.floor(Math.random() * 75) + 1;
    }

    void processNewNumber(candidate);
  }, [drawnNumbers, hasWinner, processNewNumber]);

  const handleManualSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      const num = parseInt(manualInput, 10);
      
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
      void processNewNumber(num);
  };

  const handleUndoLast = useCallback(async () => {
    if (drawHistory.length === 0) return;
    try {
      const res = await api.undoLastDraw();
      setDrawHistory(res.drawHistory);
      setStatus(res.status);
      if (res.drawHistory.length === 0) {
        setCards(prev =>
          prev.map(c => ({
            ...c,
            missingCount: 24,
            isWinner: false,
            grid: c.grid.map(row => row.map(cell => ({ ...cell, isMarked: cell.number === 'FREE' }))),
          }))
        );
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erro ao desfazer número.');
    }
  }, [drawHistory.length]);

  const handleReset = async () => {
    if (cards.length === 0 && drawnNumbers.size === 0) return;
    
    if (window.confirm("Tem certeza que deseja reiniciar o sorteio? As cartelas serão MANTIDAS, o sorteio atual será arquivado no histórico e as marcações serão zeradas.")) {
      try {
        const fresh = await api.resetDraws();
        setStatus(fresh.session.status);
        setDrawHistory(fresh.drawHistory);
        setCards(fresh.cards);
        setPastGames(fresh.pastGames);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Erro ao reiniciar sorteio.');
      }
    }
  };

  const handleClearPlayers = async () => {
      if (window.confirm("Isso apagará DEFINITIVAMENTE todas as cartelas atuais e zerará a partida. Continuar?")) {
        try {
          const fresh = await api.clearAll();
          setStatus(fresh.session.status);
          setDrawHistory(fresh.drawHistory);
          setCards(fresh.cards);
          setPastGames(fresh.pastGames);
        } catch (err) {
          setActionError(err instanceof Error ? err.message : 'Erro ao limpar partida.');
        }
      }
  };

  const handleClearPastGames = async () => {
    if (window.confirm("Deseja apagar o registro das partidas anteriores?")) {
      try {
        await api.clearPastGames();
        setPastGames([]);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Erro ao limpar histórico.');
      }
    }
  };

  const handleDrawModeChange = async (mode: DrawMode) => {
    setDrawMode(mode);
    try {
      await api.updateSettings({ drawMode: mode });
    } catch {
      // non-fatal
    }
  };

  // --- Effects ---

  // Initial load from database (with one-time migration of legacy localStorage data if DB is empty)
  useEffect(() => {
    let active = true;

    const init = async () => {
      try {
        let payload = await api.getGame();

        const isDbEmpty =
          payload.cards.length === 0 &&
          payload.drawHistory.length === 0 &&
          payload.pastGames.length === 0 &&
          !payload.session.customLogo;

        if (isDbEmpty) {
          const legacy = loadBingoState();
          const legacyLogo = loadCustomLogo();
          if (legacy.cards.length > 0 || legacy.drawHistory.length > 0 || legacyLogo) {
            if (legacy.cards.length > 0) {
              await api.addCardsBatch(legacy.cards);
            }
            for (const num of legacy.drawHistory) {
              await api.addDraw(num);
            }
            await api.updateSettings({
              drawMode: legacy.drawMode,
              batchPrefix: legacy.batchPrefix,
              batchQuantity: legacy.batchQuantity,
              customLogo: legacyLogo,
            });
            window.localStorage.removeItem('bingo_master_state_v1');
            window.localStorage.removeItem('bingo_master_logo_v1');
            payload = await api.getGame();
          }
        }

        if (!active) return;
        setStatus(payload.session.status);
        setDrawMode(payload.session.drawMode);
        setBatchPrefix(payload.session.batchPrefix);
        setBatchQuantity(payload.session.batchQuantity);
        setCustomLogo(payload.session.customLogo);
        setDrawHistory(payload.drawHistory);
        setCards(payload.cards);
        setPastGames(payload.pastGames);
      } catch (err) {
        if (!active) return;
        setActionError(err instanceof Error ? err.message : 'Erro ao conectar ao banco de dados.');
      } finally {
        if (active) setIsLoaded(true);
      }
    };

    void init();
    return () => {
      active = false;
    };
  }, []);

  // Keep active view tab across page reloads
  useEffect(() => {
    try {
      window.localStorage.setItem(VIEW_MODE_KEY, viewMode);
    } catch {
      // ignore
    }
  }, [viewMode]);

  // Update card stats whenever a number is drawn
  useEffect(() => {
    if (status === 'SETUP') return;

    setCards(currentCards => 
      currentCards.map(card => updateCardStats(card, drawnNumbers))
    );
  }, [drawnNumbers, status]);

  // Auto-play sound effect only when a new number is actively drawn
  useEffect(() => {
    if (lastDrawn && shouldSpeakRef.current) {
        shouldSpeakRef.current = false;
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
                    <div className="flex items-center gap-3 flex-wrap">
                        <label className="cursor-pointer bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg border border-slate-300 flex items-center gap-2 text-sm font-medium transition-colors">
                            <Upload className="w-4 h-4" />
                            Escolher Arquivo
                            <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                        </label>
                        {customLogo && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-green-600 font-bold flex items-center gap-1"><Check className="w-3 h-3"/> Carregada</span>
                            <button
                              type="button"
                              onClick={handleRemoveLogo}
                              className="text-xs text-slate-500 hover:text-red-600 flex items-center gap-0.5 px-1.5 py-0.5 rounded hover:bg-red-50 transition-colors"
                              title="Remover logo personalizada"
                            >
                              <X className="w-3 h-3" /> Remover
                            </button>
                          </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Game Management Section */}
            <div className="bg-white p-6 rounded-xl shadow-sm border-t-4 border-purple-500">
                <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <Settings className="w-5 h-5 text-purple-500" /> Gestão da Partida
                </h2>
                <div className="space-y-3">
                     <button
                        onClick={handleReset}
                        disabled={drawnNumbers.size === 0}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors font-medium border border-slate-200 disabled:opacity-50"
                        title="Mantém as cartelas, apaga o sorteio"
                    >
                        <RotateCcw className="w-4 h-4" /> Reiniciar Sorteio
                    </button>
                    <button
                        onClick={handleClearPlayers}
                        disabled={cards.length === 0}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors font-medium border border-red-100 disabled:opacity-50"
                        title="Apaga tudo e começa do zero"
                    >
                        <Trash2 className="w-4 h-4" /> Novo Jogo (Limpar Tudo)
                    </button>
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
                            onChange={(e) => setBatchQuantity(Math.max(1, Math.min(100, parseInt(e.target.value, 10) || 1)))}
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

            {pastGames.length > 0 && (
              <div className="bg-white p-6 rounded-xl shadow-sm border-t-4 border-slate-500">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <History className="w-5 h-5 text-slate-600" /> Partidas Anteriores
                  </h2>
                  <button
                    type="button"
                    onClick={handleClearPastGames}
                    className="text-xs text-slate-400 hover:text-red-600 transition-colors"
                    title="Limpar histórico de partidas"
                  >
                    Limpar
                  </button>
                </div>
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {pastGames.map((game) => (
                    <div
                      key={game.id}
                      className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between text-slate-500">
                        <span>{new Date(game.finishedAt).toLocaleString('pt-BR')}</span>
                        <span className="font-semibold">{game.drawnNumbers.length} bolas • {game.totalCards} cartelas</span>
                      </div>
                      {game.winners.length > 0 ? (
                        <div className="font-semibold text-brand-blue flex items-center gap-1 flex-wrap">
                          <Trophy className="w-3.5 h-3.5 text-brand-lime shrink-0" />
                          <span>Vencedor(es): {game.winners.map((w) => w.playerName).join(', ')}</span>
                        </div>
                      ) : (
                        <div className="text-slate-400 italic">Encerrada sem vencedor</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
        </div>

        {/* List Column */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col h-[calc(100vh-100px)]">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-xl">
                <h2 className="font-bold text-slate-700">Cartelas Geradas ({cards.length})</h2>
                <div className="text-xs text-slate-400 flex items-center gap-1">
                   {cards.length > 0 && (
                       <span>Pronto para imprimir ou jogar</span>
                   )}
                </div>
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
                        onClick={() => handleDrawModeChange('AUTO')}
                        className={`px-3 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1 ${drawMode === 'AUTO' ? 'bg-white shadow text-brand-blue' : 'text-slate-500'}`}
                    >
                        <Dices className="w-3 h-3"/> Auto
                    </button>
                    <button 
                         onClick={() => handleDrawModeChange('MANUAL')}
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
            <MasterBoard
              drawnNumbers={drawnNumbers}
              lastDrawn={lastDrawn}
              drawHistory={drawHistory}
              onUndoLast={handleUndoLast}
            />
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
                disabled={drawnNumbers.size === 0}
                className={`p-2 rounded-full transition-colors ${drawnNumbers.size === 0 ? 'text-slate-200' : 'text-slate-400 hover:text-brand-blue hover:bg-blue-50'}`}
                title="Reiniciar Sorteio"
            >
                <RotateCcw className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full bg-slate-50 no-print">
        {actionError && (
          <div className="max-w-7xl mx-auto px-6 pt-4">
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2.5 rounded-lg text-sm flex items-center justify-between">
              <span>{actionError}</span>
              <button
                type="button"
                onClick={() => setActionError(null)}
                className="text-red-500 hover:text-red-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
        {!isLoaded ? (
          <div className="max-w-7xl mx-auto p-12 text-center text-slate-400">
            Carregando dados salvos...
          </div>
        ) : (
          <>
            {viewMode === 'GENERATOR' && renderGeneratorView()}
            {viewMode === 'GAME' && renderGameView()}
          </>
        )}
      </main>
    </div>
  );
};

export default App;