import { BingoCard, Cell } from '../types';

// Helper to generate unique random numbers within a range
const getRandomNumbers = (count: number, min: number, max: number): number[] => {
  const nums = new Set<number>();
  while (nums.size < count) {
    nums.add(Math.floor(Math.random() * (max - min + 1)) + min);
  }
  return Array.from(nums);
};

export const generateCard = (playerName: string): BingoCard => {
  const id = Math.random().toString(36).substring(2, 9);
  
  // B: 1-15, I: 16-30, N: 31-45, G: 46-60, O: 61-75
  const colB = getRandomNumbers(5, 1, 15);
  const colI = getRandomNumbers(5, 16, 30);
  const colN = getRandomNumbers(4, 31, 45); // Only 4 numbers needed
  const colG = getRandomNumbers(5, 46, 60);
  const colO = getRandomNumbers(5, 61, 75);

  // Construct 5x5 Grid (Row by Row)
  const grid: Cell[][] = [];

  for (let row = 0; row < 5; row++) {
    const rowCells: Cell[] = [];
    
    // B
    rowCells.push({ number: colB[row], isMarked: false });
    // I
    rowCells.push({ number: colI[row], isMarked: false });
    
    // N (Center is free)
    if (row === 2) {
      rowCells.push({ number: 'FREE', isMarked: true });
    } else {
      // Adjust index for N because we only have 4 numbers
      const nIndex = row > 2 ? row - 1 : row;
      rowCells.push({ number: colN[nIndex], isMarked: false });
    }

    // G
    rowCells.push({ number: colG[row], isMarked: false });
    // O
    rowCells.push({ number: colO[row], isMarked: false });

    grid.push(rowCells);
  }

  return {
    id,
    playerName,
    grid,
    missingCount: 24, // Starts with 24 needed (25 - 1 free)
    isWinner: false,
  };
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