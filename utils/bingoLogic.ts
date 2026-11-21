import type { BingoCard, Cell } from '../types.ts';

interface CardSignature {
  lo: number; // bits 0..29 -> numbers 1..30
  mid: number; // bits 0..29 -> numbers 31..60
  hi: number; // bits 0..14 -> numbers 61..75
  cols: [number, number, number, number, number]; // per-column 15-bit masks
}

const popcnt32 = (n: number): number => {
  let x = n;
  x = x - ((x >>> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
};

const createCardId = (): string => {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 8);
  }
  return Math.random().toString(36).substring(2, 10);
};

const extractNumbersFromCard = (card: BingoCard): number[] => {
  const nums: number[] = [];
  for (const row of card.grid) {
    for (const cell of row) {
      if (typeof cell.number === 'number') {
        nums.push(cell.number);
      }
    }
  }
  return nums;
};

const buildSignature = (
  colB: number[],
  colI: number[],
  colN: number[],
  colG: number[],
  colO: number[]
): CardSignature => {
  let lo = 0;
  let mid = 0;
  let hi = 0;
  let bMask = 0;
  let iMask = 0;
  let nMask = 0;
  let gMask = 0;
  let oMask = 0;

  for (const n of colB) {
    lo |= 1 << (n - 1);
    bMask |= 1 << (n - 1);
  }
  for (const n of colI) {
    lo |= 1 << (n - 1);
    iMask |= 1 << (n - 16);
  }
  for (const n of colN) {
    mid |= 1 << (n - 31);
    nMask |= 1 << (n - 31);
  }
  for (const n of colG) {
    mid |= 1 << (n - 31);
    gMask |= 1 << (n - 46);
  }
  for (const n of colO) {
    hi |= 1 << (n - 61);
    oMask |= 1 << (n - 61);
  }

  return { lo, mid, hi, cols: [bMask, iMask, nMask, gMask, oMask] };
};

const signatureFromCard = (card: BingoCard): CardSignature => {
  const colB: number[] = [];
  const colI: number[] = [];
  const colN: number[] = [];
  const colG: number[] = [];
  const colO: number[] = [];

  for (const row of card.grid) {
    if (typeof row[0]?.number === 'number') colB.push(row[0].number);
    if (typeof row[1]?.number === 'number') colI.push(row[1].number);
    if (typeof row[2]?.number === 'number') colN.push(row[2].number);
    if (typeof row[3]?.number === 'number') colG.push(row[3].number);
    if (typeof row[4]?.number === 'number') colO.push(row[4].number);
  }

  return buildSignature(colB, colI, colN, colG, colO);
};

// Pick `count` unique numbers in [min, max] biased toward least-used numbers across existing cards
const pickBalancedNumbers = (
  count: number,
  min: number,
  max: number,
  freq: Uint16Array
): number[] => {
  const pool: number[] = [];
  for (let n = min; n <= max; n++) {
    pool.push(n);
  }

  // Shuffle first for unbiased tie-breaking
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = pool[i];
    pool[i] = pool[j];
    pool[j] = tmp;
  }

  // Sort by frequency ascending with small random jitter so candidates explore diverse combos
  pool.sort((a, b) => freq[a] - freq[b] || Math.random() - 0.5);

  const candidateBand = Math.min(pool.length, count + 3);
  const selected = pool.slice(0, candidateBand);
  for (let i = selected.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = selected[i];
    selected[i] = selected[j];
    selected[j] = tmp;
  }

  return selected.slice(0, count);
};

const buildCardFromColumns = (
  playerName: string,
  colB: number[],
  colI: number[],
  colN: number[],
  colG: number[],
  colO: number[]
): BingoCard => {
  const id = createCardId();
  const grid: Cell[][] = [];

  for (let row = 0; row < 5; row++) {
    const rowCells: Cell[] = [];
    rowCells.push({ number: colB[row], isMarked: false });
    rowCells.push({ number: colI[row], isMarked: false });

    if (row === 2) {
      rowCells.push({ number: 'FREE', isMarked: true });
    } else {
      const nIndex = row > 2 ? row - 1 : row;
      rowCells.push({ number: colN[nIndex], isMarked: false });
    }

    rowCells.push({ number: colG[row], isMarked: false });
    rowCells.push({ number: colO[row], isMarked: false });
    grid.push(rowCells);
  }

  return {
    id,
    playerName,
    grid,
    missingCount: 24,
    isWinner: false,
  };
};

interface GenerationContext {
  freq: Uint16Array;
  signatures: CardSignature[];
}

const createGenerationContext = (existingCards: BingoCard[]): GenerationContext => {
  const freq = new Uint16Array(76);
  const signatures: CardSignature[] = [];

  for (const card of existingCards) {
    for (const n of extractNumbersFromCard(card)) {
      if (n >= 1 && n <= 75) freq[n]++;
    }
    signatures.push(signatureFromCard(card));
  }

  return { freq, signatures };
};

const generateCardWithContext = (playerName: string, ctx: GenerationContext): BingoCard => {
  const { freq, signatures } = ctx;
  const attempts = signatures.length === 0 ? 1 : signatures.length <= 50 ? 220 : 80;

  let bestCols: [number[], number[], number[], number[], number[]] | null = null;
  let bestSig: CardSignature | null = null;
  let bestScore = Infinity;

  for (let attempt = 0; attempt < attempts; attempt++) {
    const colB = pickBalancedNumbers(5, 1, 15, freq);
    const colI = pickBalancedNumbers(5, 16, 30, freq);
    const colN = pickBalancedNumbers(4, 31, 45, freq);
    const colG = pickBalancedNumbers(5, 46, 60, freq);
    const colO = pickBalancedNumbers(5, 61, 75, freq);

    const sig = buildSignature(colB, colI, colN, colG, colO);

    let maxOv = 0;
    let maxColOv = 0;
    let sumSq = 0;
    let duplicatePenalty = 0;

    for (let i = 0; i < signatures.length; i++) {
      const prev = signatures[i];
      const ov =
        popcnt32(sig.lo & prev.lo) +
        popcnt32(sig.mid & prev.mid) +
        popcnt32(sig.hi & prev.hi);

      if (ov === 24) {
        duplicatePenalty += 100_000_000;
      }
      if (ov > maxOv) maxOv = ov;
      sumSq += ov * ov;

      for (let c = 0; c < 5; c++) {
        const colOv = popcnt32(sig.cols[c] & prev.cols[c]);
        const colTarget = c === 2 ? 4 : 5;
        if (colOv === colTarget) {
          duplicatePenalty += 1_000_000;
        }
        if (colOv > maxColOv) maxColOv = colOv;
      }
    }

    const score =
      duplicatePenalty +
      maxOv * 100_000 +
      maxColOv * 5_000 +
      sumSq;

    if (score < bestScore) {
      bestScore = score;
      bestCols = [colB, colI, colN, colG, colO];
      bestSig = sig;
    }
  }

  const [colB, colI, colN, colG, colO] = bestCols!;
  for (const n of [...colB, ...colI, ...colN, ...colG, ...colO]) {
    freq[n]++;
  }
  signatures.push(bestSig!);

  return buildCardFromColumns(playerName, colB, colI, colN, colG, colO);
};

export const generateCard = (
  playerName: string,
  existingCards: BingoCard[] = []
): BingoCard => {
  const ctx = createGenerationContext(existingCards);
  return generateCardWithContext(playerName, ctx);
};

export const generateBatchCards = (
  playerNames: string[],
  existingCards: BingoCard[] = []
): BingoCard[] => {
  const ctx = createGenerationContext(existingCards);
  return playerNames.map((name) => generateCardWithContext(name, ctx));
};

export const updateCardStats = (card: BingoCard, drawnNumbers: Set<number>): BingoCard => {
  let markedCount = 0;
  let hasFree = false;

  const newGrid = card.grid.map(row => 
    row.map(cell => {
      if (cell.number === 'FREE') {
        hasFree = true;
        return { ...cell, isMarked: true };
      }
      const isMarked = drawnNumbers.has(cell.number as number);
      if (isMarked) markedCount++;
      return { ...cell, isMarked };
    })
  );

  const totalNeeded = 24; // Standard US bingo full card
  const missingCount = totalNeeded - markedCount;

  return {
    ...card,
    grid: newGrid,
    missingCount,
    isWinner: missingCount === 0
  };
};