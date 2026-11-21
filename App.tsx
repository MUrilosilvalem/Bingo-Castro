import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { BingoCard, DrawMode, GameStatus, PastGameRecord, ViewMode } from './types';
import { generateBatchCards, generateCard, pickNextAutoDrawNumber, updateCardStats } from './utils/bingoLogic';
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
  const [logoError, setLogoError] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [mobileGameTab, setMobileGameTab] = useState<'BOARD' | 'RANKING'>('BOARD');
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    tone: 'danger' | 'primary';
    onConfirm: () => Promise<void>;
  } | null>(null);
  const [isConfirming, setIsConfirming] = useState<boolean>(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const shouldSpeakRef = useRef<boolean>(false);
  const drawingLockRef = useRef<boolean>(false);

  // Draw Mode State (Auto vs Manual)
  const [drawMode, setDrawMode] = useState<DrawMode>('AUTO');
  const [manualInput, setManualInput] = useState<string>('');
  const [manualError, setManualError] = useState<string | null>(null);

  const drawnNumbers = useMemo(() => new Set<number>(drawHistory), [drawHistory]);
  const lastDrawn = drawHistory.length > 0 ? drawHistory[drawHistory.length - 1] : null;

  // Derived state to check if game is over
  const winnerCount = useMemo(() => cards.filter(c => c.isWinner).length, [cards]);
  const oneAwayCount = useMemo(() => cards.filter(c => !c.isWinner && c.missingCount === 1).length, [cards]);
  const hasWinner = winnerCount > 0;

  // --- Actions ---

  const normalizeLogoDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Falha ao ler arquivo de imagem.'));
      reader.onload = () => {
        const rawDataUrl = reader.result as string;
        const isAllowedRaster =
          /^data:image\/(png|jpeg|jpg|gif|webp|bmp);base64,/.test(rawDataUrl);

        if (isAllowedRaster && rawDataUrl.length <= 1_200_000) {
          resolve(rawDataUrl);
          return;
        }

        const img = new Image();
        img.onerror = () => reject(new Error('Formato de imagem não suportado.'));
        img.onload = () => {
          const maxDim = 800;
          const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
          const width = Math.max(1, Math.round((img.width || 400) * scale));
          const height = Math.max(1, Math.round((img.height || 200) * scale));
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Não foi possível processar a imagem.'));
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          const pngUrl = canvas.toDataURL('image/png');
          if (pngUrl.length <= 4_500_000) {
            resolve(pngUrl);
          } else {
            resolve(canvas.toDataURL('image/jpeg', 0.85));
          }
        };
        img.src = rawDataUrl;
      };
      reader.readAsDataURL(file);
    });

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setActionError(null);
    try {
      const dataUrl = await normalizeLogoDataUrl(file);
      await api.updateSettings({ customLogo: dataUrl });
      setLogoError(false);
      setCustomLogo(dataUrl);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Não foi possível salvar a logo.');
    }
  };

  const handleRemoveLogo = async () => {
    setActionError(null);
    try {
      await api.updateSettings({ customLogo: null });
      setLogoError(false);
      setCustomLogo(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erro ao remover logo.');
    }
  };

  const handleAddPlayer = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!newPlayerName.trim()) return;
    setActionError(null);

    const rawCard = generateCard(newPlayerName.trim(), cards);
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
    
    const names: string[] = [];
    for (let i = 0; i < quantity; i++) {
        const idNum = cards.length + i + 1;
        names.push(`${batchPrefix} #${idNum}`);
    }
    const generated = generateBatchCards(names, cards);
    const newCards =
      drawnNumbers.size > 0
        ? generated.map(card => updateCardStats(card, drawnNumbers))
        : generated;

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
      if (drawingLockRef.current || hasWinner) return;
      drawingLockRef.current = true;
      setIsDrawing(true);
      shouldSpeakRef.current = true;
      setManualError(null);
      try {
        const res = await api.addDraw(num);
        const nextSet = new Set<number>(res.drawHistory);
        setDrawHistory(res.drawHistory);
        setStatus(res.status);
        setCards(currentCards => currentCards.map(card => updateCardStats(card, nextSet)));
      } catch (err) {
        shouldSpeakRef.current = false;
        setManualError(err instanceof Error ? err.message : 'Erro ao salvar número sorteado.');
      } finally {
        drawingLockRef.current = false;
        setIsDrawing(false);
      }
  }, [hasWinner]);

  const handleDrawNumber = useCallback(() => {
    if (drawingLockRef.current || drawnNumbers.size >= 75 || hasWinner) return;

    const candidate = pickNextAutoDrawNumber(cards, drawnNumbers);
    if (candidate === null) return;

    void processNewNumber(candidate);
  }, [cards, drawnNumbers, hasWinner, processNewNumber]);

  const handleManualSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (drawingLockRef.current || hasWinner) return;
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

  const handleReset = () => {
    if (cards.length === 0 && drawnNumbers.size === 0) return;

    setConfirmDialog({
      title: 'Reiniciar Sorteio',
      message:
        'As cartelas atuais serão mantidas, o sorteio atual será arquivado no histórico e as marcações serão zeradas.',
      confirmLabel: 'Reiniciar Sorteio',
      tone: 'primary',
      onConfirm: async () => {
        const fresh = await api.resetDraws();
        setStatus(fresh.session.status);
        setDrawHistory(fresh.drawHistory);
        setCards(fresh.cards);
        setPastGames(fresh.pastGames);
        setMobileGameTab('BOARD');
      },
    });
  };

  const handleClearPlayers = () => {
    if (cards.length === 0 && drawnNumbers.size === 0) return;

    setConfirmDialog({
      title: 'Novo Jogo (Limpar Tudo)',
      message:
        'Isso apagará definitivamente todas as cartelas atuais e zerará a partida para começar do zero.',
      confirmLabel: 'Começar Novo Jogo',
      tone: 'danger',
      onConfirm: async () => {
        const fresh = await api.clearAll();
        setStatus(fresh.session.status);
        setDrawHistory(fresh.drawHistory);
        setCards(fresh.cards);
        setPastGames(fresh.pastGames);
        setMobileGameTab('BOARD');
        setViewMode('GENERATOR');
      },
    });
  };

  const handleClearPastGames = () => {
    setConfirmDialog({
      title: 'Limpar Histórico',
      message: 'Deseja apagar o registro de todas as partidas anteriores?',
      confirmLabel: 'Apagar Histórico',
      tone: 'danger',
      onConfirm: async () => {
        await api.clearPastGames();
        setPastGames([]);
      },
    });
  };

  const handleExecuteConfirm = async () => {
    if (!confirmDialog || isConfirming) return;
    setIsConfirming(true);
    setActionError(null);
    try {
      await confirmDialog.onConfirm();
      setConfirmDialog(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Não foi possível concluir a ação.');
      setConfirmDialog(null);
    } finally {
      setIsConfirming(false);
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
        <div className="w-32 h-32 sm:w-40 sm:h-40 md:w-48 md:h-48 rounded-full border-4 border-slate-200 border-dashed flex items-center justify-center bg-slate-50 text-slate-300">
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
        <div className={`w-32 h-32 sm:w-40 sm:h-40 md:w-48 md:h-48 rounded-full shadow-2xl flex items-center justify-center ${color} ${text} border-[6px] sm:border-8 ${borderColor} ring-4 ring-brand-blue/20`}>
          <span className="text-6xl sm:text-7xl md:text-8xl font-black tracking-tighter tabular-nums">{lastDrawn}</span>
        </div>
        <div className="mt-2.5 sm:mt-4 text-xl sm:text-2xl font-bold text-brand-blue uppercase tracking-widest">
            {lastDrawn <= 15 ? 'B' : lastDrawn <= 30 ? 'I' : lastDrawn <= 45 ? 'N' : lastDrawn <= 60 ? 'G' : 'O'}
        </div>
      </div>
    );
  };

  const renderGeneratorView = () => (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-8">
        {/* Forms Column */}
        <div className="lg:col-span-1 space-y-5 sm:space-y-6">
            
            {/* Logo Upload Section */}
            <div className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-slate-200">
                <h2 className="text-base sm:text-lg font-bold text-slate-800 mb-3 flex items-center gap-2">
                    <ImageIcon className="w-5 h-5 text-slate-600" /> Personalizar Logo
                </h2>
                <div className="space-y-3">
                    <p className="text-sm text-slate-600">
                        Carregue a imagem da logo para aparecer no topo e nas impressões.
                    </p>
                    <div className="flex items-center gap-3 flex-wrap">
                        <label className="cursor-pointer min-h-[44px] bg-slate-100 hover:bg-slate-200 active:bg-slate-200 text-slate-700 px-4 py-2 rounded-xl border border-slate-300 flex items-center gap-2 text-sm font-medium transition-colors">
                            <Upload className="w-4 h-4" />
                            Escolher Arquivo
                            <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                        </label>
                        {customLogo && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-green-600 font-bold flex items-center gap-1"><Check className="w-3.5 h-3.5"/> Carregada</span>
                            <button
                              type="button"
                              onClick={handleRemoveLogo}
                              className="min-h-[36px] text-xs text-slate-500 hover:text-red-600 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors"
                              title="Remover logo personalizada"
                            >
                              <X className="w-3.5 h-3.5" /> Remover
                            </button>
                          </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Game Management Section */}
            <div className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-slate-200 border-t-4 border-t-purple-500">
                <h2 className="text-base sm:text-lg font-bold text-slate-800 mb-3 sm:mb-4 flex items-center gap-2">
                    <Settings className="w-5 h-5 text-purple-500" /> Gestão da Partida
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3">
                     <button
                        onClick={handleReset}
                        disabled={drawnNumbers.size === 0}
                        className="w-full min-h-[44px] flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 active:bg-slate-200 transition-colors text-sm font-medium border border-slate-200 disabled:opacity-50"
                        title="Mantém as cartelas, apaga o sorteio"
                    >
                        <RotateCcw className="w-4 h-4" /> Reiniciar Sorteio
                    </button>
                    <button
                        onClick={handleClearPlayers}
                        disabled={cards.length === 0}
                        className="w-full min-h-[44px] flex items-center justify-center gap-2 px-4 py-2.5 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 active:bg-red-100 transition-colors text-sm font-medium border border-red-100 disabled:opacity-50"
                        title="Apaga tudo e começa do zero"
                    >
                        <Trash2 className="w-4 h-4" /> Novo Jogo (Limpar Tudo)
                    </button>
                </div>
            </div>

            <div className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-slate-200 border-t-4 border-t-brand-blue">
                <h2 className="text-base sm:text-lg font-bold text-slate-800 mb-3 sm:mb-4 flex items-center gap-2">
                    <UserPlus className="w-5 h-5 text-brand-blue" /> Adicionar Individual
                </h2>
                <form onSubmit={handleAddPlayer} className="flex gap-2">
                    <input 
                        ref={nameInputRef}
                        type="text" 
                        value={newPlayerName}
                        onChange={(e) => setNewPlayerName(e.target.value)}
                        placeholder="Nome do Jogador"
                        className="flex-1 min-w-0 min-h-[44px] text-base px-3.5 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-blue"
                    />
                    <button 
                        type="submit"
                        className="min-w-[48px] min-h-[44px] bg-brand-blue text-white px-4 py-2 rounded-xl hover:bg-brand-blue/90 active:scale-95 transition-all flex items-center justify-center"
                        aria-label="Adicionar jogador"
                    >
                        <Plus className="w-5 h-5" />
                    </button>
                </form>
            </div>

            <div className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-slate-200 border-t-4 border-t-brand-lime">
                <h2 className="text-base sm:text-lg font-bold text-slate-800 mb-3 sm:mb-4 flex items-center gap-2">
                    <Users className="w-5 h-5 text-brand-lime" /> Gerar Lote
                </h2>
                <form onSubmit={handleBatchGenerate} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3">
                      <div>
                          <label className="block text-sm font-medium text-slate-600 mb-1">Prefixo do Nome</label>
                          <input 
                              type="text" 
                              value={batchPrefix}
                              onChange={(e) => setBatchPrefix(e.target.value)}
                              className="w-full min-h-[44px] text-base px-3.5 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-blue"
                          />
                      </div>
                      <div>
                          <label className="block text-sm font-medium text-slate-600 mb-1">Quantidade</label>
                          <input 
                              type="number" 
                              inputMode="numeric"
                              min="1" 
                              max="100"
                              value={batchQuantity}
                              onChange={(e) => setBatchQuantity(Math.max(1, Math.min(100, parseInt(e.target.value, 10) || 1)))}
                              className="w-full min-h-[44px] text-base px-3.5 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-blue"
                          />
                      </div>
                    </div>
                    <button 
                        type="submit"
                        className="w-full min-h-[48px] bg-brand-blue/5 text-brand-blue border border-brand-blue/20 py-3 rounded-xl hover:bg-brand-blue/10 active:bg-brand-blue/15 transition-colors font-semibold flex items-center justify-center gap-2"
                    >
                        <Users className="w-4 h-4" /> Gerar {batchQuantity} Cartelas
                    </button>
                </form>
            </div>

            {pastGames.length > 0 && (
              <div className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-slate-200 border-t-4 border-t-slate-500">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-base sm:text-lg font-bold text-slate-800 flex items-center gap-2">
                    <History className="w-5 h-5 text-slate-600" /> Partidas Anteriores
                  </h2>
                  <button
                    type="button"
                    onClick={handleClearPastGames}
                    className="min-h-[36px] px-2 text-xs text-slate-500 hover:text-red-600 transition-colors"
                    title="Limpar histórico de partidas"
                  >
                    Limpar
                  </button>
                </div>
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {pastGames.map((game) => (
                    <div
                      key={game.id}
                      className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-1 text-slate-500">
                        <span>{new Date(game.finishedAt).toLocaleString('pt-BR')}</span>
                        <span className="font-semibold tabular-nums">{game.drawnNumbers.length} bolas · {game.totalCards} cartelas</span>
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
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col lg:h-[calc(100vh-116px)] min-h-[320px]">
            <div className="p-4 border-b border-slate-100 flex flex-wrap justify-between items-center gap-2 bg-slate-50 rounded-t-2xl">
                <h2 className="font-bold text-slate-700 tabular-nums">Cartelas Geradas ({cards.length})</h2>
                <div className="text-xs text-slate-400 flex items-center gap-1">
                   {cards.length > 0 && (
                       <span>Pronto para imprimir ou jogar</span>
                   )}
                </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3.5 sm:p-4 bg-slate-100/50 rounded-b-2xl">
                {cards.length === 0 ? (
                    <div className="h-full min-h-[220px] flex flex-col items-center justify-center text-slate-400 text-center px-4">
                        <LayoutGrid className="w-14 h-14 mb-3 opacity-20" />
                        <p className="text-sm sm:text-base">Nenhuma cartela gerada ainda.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3.5 sm:gap-4">
                        {cards.map(card => (
                            <div key={card.id} className="relative group">
                                <CardPreview card={card} />
                                <button 
                                    onClick={() => handleDeleteCard(card.id)}
                                    className="absolute top-2.5 right-2.5 min-w-[36px] min-h-[36px] flex items-center justify-center bg-white text-red-500 p-1.5 rounded-lg shadow opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity border border-slate-200 hover:bg-red-50 active:bg-red-50"
                                    title="Excluir cartela"
                                    aria-label={`Excluir ${card.playerName}`}
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
    <div className="max-w-[1600px] mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 lg:h-[calc(100vh-116px)]">
        {/* Left Column: Controls & Board */}
        <div className="lg:col-span-7 flex flex-col gap-4 sm:gap-6 lg:overflow-y-auto">
            
            {/* Draw Area */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 sm:p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-5 sm:gap-8 relative overflow-hidden shrink-0">
                {/* Decorative Gradient based on Brand Colors */}
                <div className="absolute top-0 left-0 w-full h-1.5 sm:h-2 bg-gradient-to-r from-brand-blue via-brand-lime to-brand-blue"></div>
                
                {/* Mode Toggle */}
                <div className="self-end md:self-auto md:absolute md:top-4 md:right-4 flex bg-slate-100 rounded-xl p-1 z-20 mt-1 md:mt-0">
                    <button 
                        onClick={() => handleDrawModeChange('AUTO')}
                        className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 whitespace-nowrap ${drawMode === 'AUTO' ? 'bg-white shadow text-brand-blue' : 'text-slate-500'}`}
                    >
                        <Dices className="w-3.5 h-3.5"/> Auto
                    </button>
                    <button 
                         onClick={() => handleDrawModeChange('MANUAL')}
                         className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 whitespace-nowrap ${drawMode === 'MANUAL' ? 'bg-white shadow text-brand-blue' : 'text-slate-500'}`}
                    >
                        <Keyboard className="w-3.5 h-3.5"/> Manual
                    </button>
                </div>

                <div className="flex-1 flex flex-col items-center justify-center">
                    {renderCurrentBall()}
                </div>

                <div className="flex-1 w-full flex flex-col items-center gap-3 sm:gap-4 z-10">
                    {drawMode === 'AUTO' ? (
                        <button
                            onClick={handleDrawNumber}
                            disabled={hasWinner || isDrawing || drawnNumbers.size >= 75}
                            className={`
                                w-full max-w-xs min-h-[52px] py-3.5 sm:py-4 rounded-xl font-bold text-lg sm:text-xl shadow-lg transition-all transform active:scale-95 flex items-center justify-center gap-3
                                ${hasWinner || isDrawing
                                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
                                    : 'bg-brand-blue hover:bg-brand-blue/90 text-white shadow-brand-blue/30'}
                            `}
                        >
                            {hasWinner ? (
                                <>Jogo Encerrado</>
                            ) : (
                                <>
                                    <Play className="w-5 h-5 sm:w-6 sm:h-6 fill-current" />
                                    {isDrawing ? 'SORTEANDO...' : 'SORTEAR'}
                                </>
                            )}
                        </button>
                    ) : (
                        <form onSubmit={handleManualSubmit} className="w-full max-w-xs flex flex-col gap-2">
                            <div className="flex gap-2">
                                <input 
                                    type="number" 
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    min="1" 
                                    max="75"
                                    value={manualInput}
                                    onChange={(e) => {
                                        setManualInput(e.target.value);
                                        setManualError(null);
                                    }}
                                    placeholder="#"
                                    disabled={hasWinner || isDrawing}
                                    className="flex-1 min-w-0 min-h-[50px] text-center text-2xl font-bold py-2.5 rounded-xl border-2 border-slate-200 focus:border-brand-blue focus:outline-none disabled:bg-slate-50"
                                />
                                <button 
                                    type="submit"
                                    disabled={!manualInput || hasWinner || isDrawing}
                                    className="min-w-[56px] min-h-[50px] bg-brand-blue text-white rounded-xl px-5 hover:bg-brand-blue/90 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                                    aria-label="Confirmar número"
                                >
                                    <Check className="w-7 h-7" />
                                </button>
                            </div>
                            {manualError && (
                                <p className="text-red-500 text-xs font-semibold text-center">{manualError}</p>
                            )}
                            <p className="text-slate-400 text-xs text-center">Digite o número da bola física</p>
                        </form>
                    )}

                    {hasWinner && (
                         <div className="flex flex-col items-center gap-3 w-full max-w-xs">
                           <button
                             type="button"
                             onClick={() => setMobileGameTab('RANKING')}
                             className="animate-bounce text-brand-lime font-bold text-base sm:text-lg flex items-center gap-2 text-center"
                           >
                               <Trophy className="w-6 h-6 shrink-0" />
                               <span>{winnerCount > 1 ? `EMPATE! ${winnerCount} VENCEDORES!` : 'TEMOS VENCEDOR!'}</span>
                           </button>
                           <div className="grid grid-cols-2 gap-2 w-full">
                             <button
                               type="button"
                               onClick={handleReset}
                               className="min-h-[44px] px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-200 text-slate-700 text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors border border-slate-200"
                             >
                               <RotateCcw className="w-4 h-4 shrink-0" />
                               <span>Nova Rodada</span>
                             </button>
                             <button
                               type="button"
                               onClick={handleClearPlayers}
                               className="min-h-[44px] px-3 py-2 rounded-xl bg-brand-blue hover:bg-brand-blue/90 active:scale-95 text-white text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 transition-all"
                             >
                               <Trash2 className="w-4 h-4 shrink-0" />
                               <span>Novo Jogo</span>
                             </button>
                           </div>
                         </div>
                    )}
                </div>
            </div>

            {/* Mobile Segmented Switcher between Board and Ranking */}
            <div className="grid grid-cols-2 gap-1 p-1 bg-slate-200/80 rounded-xl lg:hidden">
              <button
                type="button"
                onClick={() => setMobileGameTab('BOARD')}
                className={`min-h-[44px] px-3 py-2 rounded-lg text-sm font-semibold transition-all tabular-nums ${
                  mobileGameTab === 'BOARD' ? 'bg-white text-brand-blue shadow-sm' : 'text-slate-600'
                }`}
              >
                Mesa ({drawnNumbers.size}/75)
              </button>
              <button
                type="button"
                onClick={() => setMobileGameTab('RANKING')}
                className={`min-h-[44px] px-3 py-2 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-1.5 tabular-nums ${
                  mobileGameTab === 'RANKING' ? 'bg-white text-brand-blue shadow-sm' : 'text-slate-600'
                }`}
              >
                <span>Ranking</span>
                {hasWinner ? (
                  <span className="text-xs font-bold text-emerald-700">· {winnerCount} 🏆</span>
                ) : oneAwayCount > 0 ? (
                  <span className="text-xs font-bold text-red-600">· {oneAwayCount} por 1</span>
                ) : null}
              </button>
            </div>

            {/* Master Board (always visible on desktop, tab-controlled on mobile) */}
            <div className={`${mobileGameTab === 'BOARD' ? 'block' : 'hidden'} lg:block`}>
              <MasterBoard
                drawnNumbers={drawnNumbers}
                lastDrawn={lastDrawn}
                drawHistory={drawHistory}
                onUndoLast={handleUndoLast}
              />
            </div>
        </div>

        {/* Right Column: Stats / Ranking */}
        <div className={`lg:col-span-5 flex flex-col lg:h-full min-h-0 ${mobileGameTab === 'RANKING' ? 'block' : 'hidden'} lg:flex`}>
             {cards.length === 0 ? (
                 <div className="bg-white rounded-2xl p-6 sm:p-8 text-center border border-slate-200 shadow-sm flex flex-col items-center justify-center h-full min-h-[260px]">
                     <LayoutGrid className="w-14 h-14 text-slate-300 mb-3" />
                     <h3 className="text-lg sm:text-xl font-bold text-slate-700 mb-2">Nenhuma cartela no jogo</h3>
                     <p className="text-sm text-slate-500 mb-5">Vá para o Gerador para criar cartelas antes de começar.</p>
                     <button 
                        onClick={() => setViewMode('GENERATOR')}
                        className="min-h-[44px] bg-brand-blue text-white px-6 py-2.5 rounded-xl hover:bg-brand-blue/90 transition-colors font-medium"
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
          <div className="min-h-screen bg-white p-4 sm:p-8">
              <div className="max-w-6xl mx-auto no-print mb-6 sm:mb-8 flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                  <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Modo de Impressão ({cards.length} cartelas)</h1>
                  <div className="flex gap-3">
                      <button onClick={() => setViewMode('GENERATOR')} className="flex-1 sm:flex-none min-h-[44px] flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 border border-slate-300 text-sm font-medium">
                          <ArrowLeft className="w-4 h-4"/> Voltar
                      </button>
                      <button onClick={() => window.print()} className="flex-1 sm:flex-none min-h-[44px] flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-brand-blue text-white hover:bg-brand-blue/90 shadow-sm text-sm font-medium">
                          <Printer className="w-4 h-4"/> Imprimir
                      </button>
                  </div>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 sm:gap-8 print:grid-cols-2 print:gap-4">
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
      <header className="bg-white border-b border-slate-200 md:sticky md:top-0 z-30 shadow-sm no-print">
        <div className="max-w-7xl mx-auto px-4 h-16 md:h-20 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {/* Logo Section */}
            <div className="h-10 md:h-16 relative flex items-center shrink-0">
                {customLogo && !logoError ? (
                  <img
                    key={customLogo}
                    src={customLogo}
                    alt="Logo personalizada"
                    className="h-full w-auto max-w-[160px] md:max-w-[220px] object-contain"
                    onError={() => setLogoError(true)}
                  />
                ) : (
                  <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 md:w-14 md:h-14 bg-brand-blue rounded-lg flex items-center justify-center text-white font-black text-xl md:text-3xl shrink-0">C</div>
                      <div className="flex flex-col leading-tight min-w-0">
                          <span className="font-bold text-brand-blue text-lg md:text-2xl tracking-tight whitespace-nowrap">CASTRO</span>
                          <span className="hidden sm:block text-xs text-slate-500 uppercase tracking-wider whitespace-nowrap">Laboratório Clínico</span>
                      </div>
                  </div>
                )}
            </div>
          </div>
          
          {/* Desktop Tabs */}
          <div className="hidden md:flex items-center bg-slate-100 p-1 rounded-xl mx-4">
              <button 
                onClick={() => setViewMode('GENERATOR')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap ${viewMode === 'GENERATOR' ? 'bg-white shadow text-brand-blue' : 'text-slate-600 hover:text-slate-900'}`}
              >
                  <LayoutGrid className="w-4 h-4" /> Gerador
              </button>
              <button 
                onClick={() => setViewMode('GAME')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap ${viewMode === 'GAME' ? 'bg-white shadow text-brand-blue' : 'text-slate-600 hover:text-slate-900'}`}
              >
                  <Gamepad2 className="w-4 h-4" /> Jogo
              </button>
              <button 
                onClick={() => setViewMode('PRINT')}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap text-slate-600 hover:text-slate-900"
              >
                  <Printer className="w-4 h-4" /> Imprimir
              </button>
          </div>

          <div className="flex items-center gap-2 shrink-0">
             <button 
                onClick={handleReset}
                disabled={drawnNumbers.size === 0}
                className={`min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full transition-colors ${drawnNumbers.size === 0 ? 'text-slate-300' : 'text-slate-500 hover:text-brand-blue hover:bg-blue-50 active:bg-blue-50'}`}
                title="Reiniciar Sorteio"
                aria-label="Reiniciar Sorteio"
            >
                <RotateCcw className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full bg-slate-50 no-print pb-24 md:pb-6">
        {actionError && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-4">
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2.5 rounded-xl text-sm flex items-center justify-between gap-2">
              <span>{actionError}</span>
              <button
                type="button"
                onClick={() => setActionError(null)}
                className="min-w-[36px] min-h-[36px] flex items-center justify-center text-red-500 hover:text-red-700 shrink-0"
                aria-label="Fechar erro"
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

      {/* Mobile Bottom Thumb Navigation Bar */}
      <nav
        aria-label="Navegação principal"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 pb-[env(safe-area-inset-bottom)] no-print"
      >
        <div className="grid grid-cols-3 h-16">
          <button
            type="button"
            onClick={() => setViewMode('GENERATOR')}
            className={`flex flex-col items-center justify-center gap-1 min-h-[44px] transition-colors ${
              viewMode === 'GENERATOR' ? 'text-brand-blue font-semibold' : 'text-slate-500'
            }`}
          >
            <LayoutGrid className="w-5 h-5" />
            <span className="text-[11px] leading-none">Gerador</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('GAME')}
            className={`flex flex-col items-center justify-center gap-1 min-h-[44px] transition-colors ${
              viewMode === 'GAME' ? 'text-brand-blue font-semibold' : 'text-slate-500'
            }`}
          >
            <Gamepad2 className="w-5 h-5" />
            <span className="text-[11px] leading-none">Jogo</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('PRINT')}
            className="flex flex-col items-center justify-center gap-1 min-h-[44px] text-slate-500 active:text-brand-blue transition-colors"
          >
            <Printer className="w-5 h-5" />
            <span className="text-[11px] leading-none">Imprimir</span>
          </button>
        </div>
      </nav>
      {/* Confirmation Modal */}
      {confirmDialog && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 no-print"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
        >
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 p-5 sm:p-6 space-y-4">
            <h3 id="confirm-dialog-title" className="text-lg font-bold text-slate-800">
              {confirmDialog.title}
            </h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              {confirmDialog.message}
            </p>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDialog(null)}
                disabled={isConfirming}
                className="min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 text-sm font-semibold transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleExecuteConfirm}
                disabled={isConfirming}
                className={`min-h-[44px] px-4 py-2.5 rounded-xl text-white text-sm font-semibold transition-colors disabled:opacity-50 ${
                  confirmDialog.tone === 'danger'
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-brand-blue hover:bg-brand-blue/90'
                }`}
              >
                {isConfirming ? 'Processando...' : confirmDialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;