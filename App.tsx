
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  COLS, ROWS, TETROMINOS, RANDOM_TETROMINOS, INITIAL_TICK, MIN_TICK 
} from './constants';
import { GameState, ActivePiece, Position } from './types';
import { 
  createEmptyGrid, checkCollision, rotatePiece, getGhostPosition 
} from './utils/gameLogic';
import { getAICommentary } from './services/geminiService';

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(() => {
    const firstType = RANDOM_TETROMINOS();
    return {
      grid: createEmptyGrid(),
      activePiece: {
        type: firstType,
        pos: { x: Math.floor(COLS / 2) - 2, y: 0 },
        shape: TETROMINOS[firstType].shape,
      },
      nextPieceType: RANDOM_TETROMINOS(),
      score: 0,
      lines: 0,
      gameOver: false,
      isPaused: false,
      level: 1,
      clearingCells: new Set(),
      fillingCells: new Set(),
      isAnimating: false
    };
  });

  const [aiMessage, setAiMessage] = useState<string>("준비되셨나요? 게임을 시작해봅시다!");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const tickRate = Math.max(MIN_TICK, INITIAL_TICK - (gameState.level - 1) * 100);
  const gameLoopRef = useRef<number | null>(null);

  const fetchAICommentary = async (score: number, lines: number, isGameOver: boolean, diagonals: number = 0) => {
    setIsAiLoading(true);
    const msg = await getAICommentary(score, lines, isGameOver, diagonals);
    setAiMessage(msg);
    setIsAiLoading(false);
  };

  const getNewPiece = (type: any): ActivePiece => ({
    type: type,
    pos: { x: Math.floor(COLS / 2) - 2, y: 0 },
    shape: TETROMINOS[type].shape,
  });

  const processLineClearingChain = useCallback(async (currentGrid: (string | null)[][], comboCount: number = 0) => {
    const cellsToClear = new Set<string>();
    const diagonalBlocks: {y: number, x: number, type: string}[] = [];
    const targetHoles: {y: number, x: number}[] = [];
    let horizontalLines: number[] = [];
    let diagonalLineCount = 0;

    // 1. 수평 줄 체크
    for (let y = 0; y < ROWS; y++) {
      if (currentGrid[y].every(cell => cell !== null)) {
        horizontalLines.push(y);
        for (let x = 0; x < COLS; x++) cellsToClear.add(`${y},${x}`);
      }
    }

    // 2. 대각선 줄 체크 및 삼각형 영역 빈공간 탐색
    // \ 방향
    for (let startY = 0; startY <= ROWS - COLS; startY++) {
      let isFull = true;
      let path = [];
      for (let i = 0; i < COLS; i++) {
        if (currentGrid[startY + i][i] === null) { isFull = false; break; }
        path.push({y: startY + i, x: i, type: currentGrid[startY + i][i] as string});
      }
      if (isFull) {
        diagonalLineCount++;
        path.forEach(p => {
          cellsToClear.add(`${p.y},${p.x}`);
          diagonalBlocks.push(p);
        });
        // 아래 삼각형 영역 빈칸 찾기
        for (let x = 0; x < COLS; x++) {
          for (let y = startY + x + 1; y < ROWS; y++) {
            if (currentGrid[y][x] === null) targetHoles.push({y, x});
          }
        }
      }
    }
    // / 방향
    for (let startY = 0; startY <= ROWS - COLS; startY++) {
      let isFull = true;
      let path = [];
      for (let i = 0; i < COLS; i++) {
        const x = COLS - 1 - i;
        if (currentGrid[startY + i][x] === null) { isFull = false; break; }
        path.push({y: startY + i, x: x, type: currentGrid[startY + i][x] as string});
      }
      if (isFull) {
        diagonalLineCount++;
        path.forEach(p => {
          cellsToClear.add(`${p.y},${p.x}`);
          diagonalBlocks.push(p);
        });
        // 아래 삼각형 영역 빈칸 찾기
        for (let i = 0; i < COLS; i++) {
          const x = COLS - 1 - i;
          for (let y = startY + i + 1; y < ROWS; y++) {
            if (currentGrid[y][x] === null) targetHoles.push({y, x});
          }
        }
      }
    }

    if (cellsToClear.size > 0) {
      setGameState(prev => ({ ...prev, grid: currentGrid, clearingCells: cellsToClear, isAnimating: true }));
      await new Promise(r => setTimeout(r, 400));

      // 3. 대각선 블록으로 빈 공간 채우기 (Recycling)
      let tempGrid = currentGrid.map(row => [...row]);
      const actualFilling = new Set<string>();
      
      // 우선 모든 클리어 셀 제거
      cellsToClear.forEach(coord => {
        const [y, x] = coord.split(',').map(Number);
        tempGrid[y][x] = null;
      });

      // 대각선 블록들을 빈 구멍에 배치
      const sortedHoles = [...targetHoles].sort((a, b) => b.y - a.y); // 아래쪽 구멍부터 채우기
      const blocksToUse = [...diagonalBlocks];
      
      const moveLimit = Math.min(blocksToUse.length, sortedHoles.length);
      for (let i = 0; i < moveLimit; i++) {
        const hole = sortedHoles[i];
        const block = blocksToUse[i];
        tempGrid[hole.y][hole.x] = block.type;
        actualFilling.add(`${hole.y},${hole.x}`);
      }

      if (actualFilling.size > 0) {
        setGameState(prev => ({ ...prev, grid: tempGrid.map(r => [...r]), fillingCells: actualFilling }));
        await new Promise(r => setTimeout(r, 300));
      }

      // 4. 상대적 중력 적용 (Relative Gravity)
      // 최종적으로 비어있게 된(삭제되었으나 채워지지 않은) 칸을 기준으로 낙하
      let finalGrid = createEmptyGrid();
      for (let x = 0; x < COLS; x++) {
        for (let y = ROWS - 1; y >= 0; y--) {
          const cellValue = tempGrid[y][x];
          if (cellValue !== null) {
            // 이 블록 아래에 있는 '순수하게 비어버린' 칸의 수 계산
            // '순수하게 비어버린 칸' = cellsToClear에 있었으나 actualFilling에 의해 채워지지 않은 칸
            let effectivelyEmptyBelow = 0;
            for (let checkY = y + 1; checkY < ROWS; checkY++) {
              if (cellsToClear.has(`${checkY},${x}`) && !actualFilling.has(`${checkY},${x}`)) {
                effectivelyEmptyBelow++;
              }
            }
            const newY = y + effectivelyEmptyBelow;
            if (newY < ROWS) finalGrid[newY][x] = cellValue;
          }
        }
      }

      const hScore = horizontalLines.length * 150;
      const dScore = diagonalLineCount * 400;
      const addedScore = (hScore + dScore + (comboCount * 50)) * gameState.level;

      setGameState(prev => ({
        ...prev,
        grid: finalGrid,
        score: prev.score + addedScore,
        lines: prev.lines + horizontalLines.length + diagonalLineCount,
        level: Math.floor((prev.lines + horizontalLines.length + diagonalLineCount) / 10) + 1,
        clearingCells: new Set(),
        fillingCells: new Set()
      }));

      await new Promise(r => setTimeout(r, 100));
      processLineClearingChain(finalGrid, comboCount + 1);

    } else {
      setGameState(prev => {
        const nextType = prev.nextPieceType;
        const newActive = getNewPiece(nextType);
        if (checkCollision(newActive, currentGrid)) {
          fetchAICommentary(prev.score, prev.lines, true);
          return { ...prev, grid: currentGrid, isAnimating: false, gameOver: true };
        } else {
          if (comboCount > 1 || diagonalLineCount > 0) fetchAICommentary(prev.score, prev.lines, false, diagonalLineCount);
          return {
            ...prev,
            grid: currentGrid,
            isAnimating: false,
            activePiece: newActive,
            nextPieceType: RANDOM_TETROMINOS()
          };
        }
      });
    }
  }, [gameState.level, fetchAICommentary]);

  const lockPieceAndSpawn = useCallback((state: GameState) => {
    const workingGrid = state.grid.map(row => [...row]);
    state.activePiece.shape.forEach((row, y) => {
      row.forEach((value, x) => {
        if (value) {
          const gridY = state.activePiece.pos.y + y;
          const gridX = state.activePiece.pos.x + x;
          if (gridY >= 0 && gridY < ROWS && gridX >= 0 && gridX < COLS) {
            workingGrid[gridY][gridX] = state.activePiece.type;
          }
        }
      });
    });
    processLineClearingChain(workingGrid, 0);
  }, [processLineClearingChain]);

  const moveDown = useCallback(() => {
    setGameState(prev => {
      if (prev.gameOver || prev.isPaused || prev.isAnimating) return prev;
      if (!checkCollision(prev.activePiece, prev.grid, { x: 0, y: 1 })) {
        return {
          ...prev,
          activePiece: {
            ...prev.activePiece,
            pos: { ...prev.activePiece.pos, y: prev.activePiece.pos.y + 1 }
          }
        };
      } else {
        setTimeout(() => lockPieceAndSpawn(prev), 0);
        return prev;
      }
    });
  }, [lockPieceAndSpawn]);

  const hardDrop = useCallback(() => {
    setGameState(prev => {
      if (prev.gameOver || prev.isPaused || prev.isAnimating) return prev;
      const ghost = getGhostPosition(prev.activePiece, prev.grid);
      const droppedPiece = { ...prev.activePiece, pos: ghost };
      setTimeout(() => lockPieceAndSpawn({ ...prev, activePiece: droppedPiece }), 0);
      return { ...prev, activePiece: droppedPiece };
    });
  }, [lockPieceAndSpawn]);

  const moveSide = (dir: number) => {
    setGameState(prev => {
      if (prev.gameOver || prev.isPaused || prev.isAnimating) return prev;
      if (!checkCollision(prev.activePiece, prev.grid, { x: dir, y: 0 })) {
        return {
          ...prev,
          activePiece: {
            ...prev.activePiece,
            pos: { ...prev.activePiece.pos, x: prev.activePiece.pos.x + dir }
          }
        };
      }
      return prev;
    });
  };

  const rotate = () => {
    setGameState(prev => {
      if (prev.gameOver || prev.isPaused || prev.isAnimating) return prev;
      const newShape = rotatePiece(prev.activePiece.shape);
      const rotatedPiece = { ...prev.activePiece, shape: newShape };
      let offset = 0;
      if (checkCollision(rotatedPiece, prev.grid)) {
        offset = 1;
        if (checkCollision({ ...rotatedPiece, pos: { ...rotatedPiece.pos, x: rotatedPiece.pos.x + offset } }, prev.grid)) {
          offset = -1;
          if (checkCollision({ ...rotatedPiece, pos: { ...rotatedPiece.pos, x: rotatedPiece.pos.x + offset } }, prev.grid)) {
            return prev;
          }
        }
      }
      return { 
        ...prev, 
        activePiece: { ...rotatedPiece, pos: { ...rotatedPiece.pos, x: rotatedPiece.pos.x + offset } } 
      };
    });
  };

  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if (gameState.gameOver || gameState.isAnimating) return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      switch (e.code) {
        case 'ArrowLeft': moveSide(-1); break;
        case 'ArrowRight': moveSide(1); break;
        case 'ArrowDown': moveDown(); break;
        case 'ArrowUp': rotate(); break;
        case 'Space': hardDrop(); break;
        case 'KeyP': setGameState(prev => ({ ...prev, isPaused: !prev.isPaused })); break;
      }
    };
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [gameState.gameOver, gameState.isAnimating, moveDown, hardDrop]);

  useEffect(() => {
    if (gameState.gameOver || gameState.isPaused || gameState.isAnimating) {
      if (gameLoopRef.current) clearInterval(gameLoopRef.current);
      return;
    }
    gameLoopRef.current = window.setInterval(moveDown, tickRate);
    return () => { if (gameLoopRef.current) clearInterval(gameLoopRef.current); };
  }, [moveDown, tickRate, gameState.gameOver, gameState.isPaused, gameState.isAnimating]);

  const restartGame = () => {
    const firstType = RANDOM_TETROMINOS();
    setGameState({
      grid: createEmptyGrid(),
      activePiece: getNewPiece(firstType),
      nextPieceType: RANDOM_TETROMINOS(),
      score: 0,
      lines: 0,
      gameOver: false,
      isPaused: false,
      level: 1,
      clearingCells: new Set(),
      fillingCells: new Set(),
      isAnimating: false
    });
    setAiMessage("새 게임 시작! 대각선 파편으로 빈 공간을 채우세요!");
  };

  const renderNextPiece = () => {
    const type = gameState.nextPieceType;
    const piece = TETROMINOS[type];
    const size = piece.shape.length;
    const offset = size === 4 ? 0 : size === 3 ? 0.5 : 1;

    return piece.shape.map((row, y) => 
      row.map((val, x) => {
        if (!val) return null;
        return (
          <div 
            key={`next-${y}-${x}`} 
            style={{ 
              gridRowStart: Math.floor(y + offset) + 1, 
              gridColumnStart: Math.floor(x + offset) + 1 
            }}
            className={`w-full h-full rounded-sm ${piece.color} block-shadow`} 
          />
        );
      })
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col md:flex-row items-center justify-center p-4 gap-8">
      {/* Side HUD */}
      <div className="flex flex-col gap-4 order-2 md:order-1 w-full max-w-[200px]">
        <div className="bg-slate-900/80 border border-slate-700 p-4 rounded-xl backdrop-blur-md neon-border">
          <h2 className="text-xs font-orbitron uppercase tracking-widest text-cyan-400 mb-2 text-center">Next</h2>
          <div className="grid grid-cols-4 grid-rows-4 gap-1 w-20 h-20 mx-auto relative">
            {renderNextPiece()}
          </div>
        </div>
        
        <div className="bg-slate-900/80 border border-slate-700 p-4 rounded-xl backdrop-blur-md">
          <div className="mb-4">
            <p className="text-[10px] font-orbitron text-slate-400 uppercase">Level</p>
            <p className="text-2xl font-orbitron text-white">{gameState.level}</p>
          </div>
          <div>
            <p className="text-[10px] font-orbitron text-slate-400 uppercase">Lines</p>
            <p className="text-2xl font-orbitron text-white">{gameState.lines}</p>
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-700 p-4 rounded-xl backdrop-blur-md hidden md:block">
          <h3 className="text-[10px] font-orbitron text-slate-400 uppercase mb-2">Triangle Logic</h3>
          <p className="text-[11px] text-cyan-300 leading-tight">
            Diagonal fragments fill holes in the triangle below! Then everything drops precisely. 📐
          </p>
        </div>
      </div>

      {/* Main Board */}
      <div className="relative order-1 md:order-2">
        <div className="bg-slate-900 border-4 border-slate-800 rounded-lg p-1 shadow-2xl relative overflow-hidden">
          <div className="tetris-grid w-[280px] h-[560px] md:w-[320px] md:h-[640px]">
            {Array.from({ length: ROWS }).map((_, y) => 
              Array.from({ length: COLS }).map((_, x) => (
                <div 
                  key={`bg-${y}-${x}`} 
                  style={{ gridRowStart: y + 1, gridColumnStart: x + 1 }}
                  className="w-full h-full border border-white/5 bg-slate-950/50" 
                />
              ))
            )}
            
            {!gameState.gameOver && !gameState.isPaused && !gameState.isAnimating && 
              (() => {
                const gp = getGhostPosition(gameState.activePiece, gameState.grid);
                return gameState.activePiece.shape.map((row, y) => row.map((val, x) => (
                  val ? <div key={`ghost-${y}-${x}`} style={{ gridRowStart: gp.y + y + 1, gridColumnStart: gp.x + x + 1 }} className="w-full h-full border border-white/20 bg-white/5 rounded-sm z-0" /> : null
                )));
              })()
            }

            {gameState.grid.map((row, y) => row.map((type, x) => {
              if (!type) return null;
              const isClearing = gameState.clearingCells?.has(`${y},${x}`);
              const isFilling = gameState.fillingCells?.has(`${y},${x}`);
              return (
                <div 
                  key={`locked-${y}-${x}`} 
                  style={{ gridRowStart: y + 1, gridColumnStart: x + 1 }} 
                  className={`w-full h-full rounded-sm block-shadow ${isClearing ? 'clearing-flash' : isFilling ? 'filling-pop ' + TETROMINOS[type as any].color : TETROMINOS[type as any].color + ' ' + TETROMINOS[type as any].glow} z-10`} 
                />
              );
            }))}

            {!gameState.gameOver && !gameState.isPaused && !gameState.isAnimating &&
              gameState.activePiece.shape.map((row, y) => row.map((val, x) => {
                const gridY = gameState.activePiece.pos.y + y;
                const gridX = gameState.activePiece.pos.x + x;
                return (val && gridY >= 0) ? (
                  <div key={`active-${y}-${x}`} style={{ gridRowStart: gridY + 1, gridColumnStart: gridX + 1 }} className={`w-full h-full rounded-sm block-shadow ${TETROMINOS[gameState.activePiece.type].color} ${TETROMINOS[gameState.activePiece.type].glow} z-20`} />
                ) : null;
              }))
            }
          </div>

          {gameState.gameOver && (
            <div className="absolute inset-0 bg-slate-950/80 flex flex-col items-center justify-center z-50 backdrop-blur-sm">
              <h2 className="text-4xl font-orbitron text-red-500 mb-2 text-center">GAME<br/>OVER</h2>
              <p className="text-xl font-orbitron mb-6">SCORE: {gameState.score.toLocaleString()}</p>
              <button onClick={restartGame} className="bg-red-600 hover:bg-red-500 px-8 py-3 rounded-full font-bold transform hover:scale-105 transition-all">TRY AGAIN</button>
            </div>
          )}

          {gameState.isPaused && (
            <div className="absolute inset-0 bg-slate-950/60 flex flex-col items-center justify-center z-50 backdrop-blur-sm">
              <h2 className="text-4xl font-orbitron text-cyan-400 animate-pulse-slow">PAUSED</h2>
              <button onClick={() => setGameState(prev => ({ ...prev, isPaused: false }))} className="mt-6 bg-cyan-600 hover:bg-cyan-500 px-8 py-2 rounded-full font-bold">RESUME</button>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-4 order-3 w-full max-w-[280px]">
        <div className="bg-slate-900/80 border border-slate-700 p-6 rounded-xl backdrop-blur-md">
          <p className="text-[10px] font-orbitron text-slate-400 uppercase tracking-widest mb-1">Score</p>
          <p className="text-4xl font-orbitron text-cyan-400 tabular-nums">{gameState.score.toLocaleString()}</p>
        </div>
        
        <div className="bg-gradient-to-br from-indigo-900/50 to-slate-900 border border-indigo-500/30 p-4 rounded-xl relative overflow-hidden">
          <div className="flex items-center gap-2 mb-3">
            <div className={`w-2 h-2 rounded-full ${isAiLoading ? 'bg-yellow-400 animate-ping' : 'bg-green-400'}`}></div>
            <p className="text-[10px] font-orbitron text-indigo-300 uppercase tracking-widest">Neon-Bot Commentary</p>
          </div>
          <div className="min-h-[60px] text-sm leading-relaxed text-slate-200 italic font-medium">"{aiMessage}"</div>
        </div>

        <div className="md:hidden grid grid-cols-3 gap-2 mt-4">
          <button onPointerDown={(e) => { e.preventDefault(); moveSide(-1); }} className="aspect-square bg-slate-800 active:bg-slate-700 rounded-lg flex items-center justify-center text-xl">←</button>
          <button onPointerDown={(e) => { e.preventDefault(); rotate(); }} className="aspect-square bg-slate-800 active:bg-slate-700 rounded-lg flex items-center justify-center text-xl">↻</button>
          <button onPointerDown={(e) => { e.preventDefault(); moveSide(1); }} className="aspect-square bg-slate-800 active:bg-slate-700 rounded-lg flex items-center justify-center text-xl">→</button>
          <button onPointerDown={(e) => { e.preventDefault(); moveDown(); }} className="aspect-square bg-slate-800 active:bg-slate-700 rounded-lg flex items-center justify-center text-xl">↓</button>
          <button onPointerDown={(e) => { e.preventDefault(); hardDrop(); }} className="col-span-2 bg-cyan-900 active:bg-cyan-800 rounded-lg flex items-center justify-center text-lg font-bold">HARD DROP</button>
        </div>
      </div>
    </div>
  );
};

export default App;
