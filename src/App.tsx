/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {useEffect, useRef, useState} from 'react';
import {GOTHIC_WORDS, THEME} from './constants';

type HighScore = {
    souls: number;
    maxCombo: number;
};

const COMBO_RANKS = [
    {count: 0, label: 'Dismal', id: 'D'}, {count: 20, label: 'Crazy', id: 'C'}, {count: 40, label: 'Badass', id: 'B'}, 
    {count: 60, label: 'Apocalyptic', id: 'A'}, {count: 80, label: 'Savage!', id: 'S'}, {count: 100, label: 'Sick Skills!!', id: 'SS'}, {count: 120, label: 'Smokin\' Sexy Style!!', id: 'SSS'}
];

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textCanvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [health, setHealth] = useState(10);
  const [started, setStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [paused, setPaused] = useState(false);
  const [difficulty, setDifficulty] = useState(0);
  const [manusCasting, setManusCasting] = useState(false);
  const [totalKeyPresses, setTotalKeyPresses] = useState(0);
  const [correctKeyPresses, setCorrectKeyPresses] = useState(0);
  const [combo, setCombo] = useState(0); // Combo count
  const [maxCombo, setMaxCombo] = useState(0);
  
  const [secretPassword, setSecretPassword] = useState('');
  const [passwordError, setPasswordError] = useState(false);
  const [showSecretScreen, setShowSecretScreen] = useState(false);
  const [yesChecked, setYesChecked] = useState(false);
  const [noHoverPos, setNoHoverPos] = useState<{x: number, y: number} | null>(null);
  const [secretHearts, setSecretHearts] = useState<{id: number, x: number, y: number, scale: number}[]>([]);
  const [kissPos, setKissPos] = useState<{x: number, y: number} | null>(null);
  const [isBlessed, setIsBlessed] = useState(false);
  const blessedTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [highscores, setHighscores] = useState<HighScore[]>([]);

  useEffect(() => {
      // Load initial on mount just in case
      const stored = localStorage.getItem('abyss_highscores');
      if (stored) setHighscores(JSON.parse(stored));
  }, []);

  useEffect(() => {
      if (gameOver) {
          const stored = localStorage.getItem('abyss_highscores');
          let current: HighScore[] = stored ? JSON.parse(stored) : [];
          if (score > 0) {
              current.push({ souls: score, maxCombo });
              current.sort((a, b) => b.souls - a.souls);
              current = current.slice(0, 5);
              localStorage.setItem('abyss_highscores', JSON.stringify(current));
          }
          setHighscores(current);
      }
  }, [gameOver]);

  const runAway = (e?: React.MouseEvent | React.TouchEvent) => {
      if (e) {
          e.preventDefault();
          e.stopPropagation();
      }
      const maxX = 1024 - 200; // Constrain to the 1024x768 scaleable container
      const maxY = 768 - 100;
      const x = Math.max(50, Math.floor(Math.random() * maxX));
      const y = Math.max(50, Math.floor(Math.random() * maxY));
      setNoHoverPos({ x, y });
  };

  const comboRef = useRef(0); // Ref for game loop access
  const pauseTimeRef = useRef(0);
  const totalPausedDurationRef = useRef(0);
  const lastPauseTimeRef = useRef(0);
  const startTimeRef = useRef<number>(0);

  const [scale, setScale] = useState(1);

  useEffect(() => {
    const handleResize = () => {
      const scaleX = window.innerWidth / 1024;
      const scaleY = window.innerHeight / 768;
      // Use 0.98 to give a tiny bit of breathing room so standard scrollbars don't miscalculate
      setScale(Math.min(scaleX, scaleY) * 0.98); 
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [isMobileFocused, setIsMobileFocused] = useState(false);
  const mobileInputRef = useRef<HTMLInputElement>(null);

  // Sync state to ref and update maxCombo
  useEffect(() => {
    comboRef.current = combo;
    if (combo > maxCombo) setMaxCombo(combo);
  }, [combo]);

  // Track when we pause/resume to adjust startTime
  useEffect(() => {
    if (paused) {
        lastPauseTimeRef.current = Date.now();
    } else if (lastPauseTimeRef.current > 0) {
        totalPausedDurationRef.current += Date.now() - lastPauseTimeRef.current;
        lastPauseTimeRef.current = 0;
    }
  }, [paused]);

  const currentRank = COMBO_RANKS.slice().reverse().find(r => combo >= r.count) || COMBO_RANKS[0];
  const topRank = COMBO_RANKS.slice().reverse().find(r => maxCombo >= r.count) || COMBO_RANKS[0];
  
  const wordsRef = useRef<{text: string, x: number, y: number, speed: number, typed: string, isSpecial: boolean}[]>([]);
  const fireballsRef = useRef<{x: number, y: number, tx: number, ty: number, progress: number, isSpecial: boolean}[]>([]);
  const activeWordRef = useRef<number | null>(null);
  const lastWordsRef = useRef<string[]>([]);
  const totalWordsSpawnedRef = useRef(0);
  const particlesRef = useRef<{x: number, y: number, vx: number, vy: number, life: number, isHeart?: boolean, color?: string}[]>([]);

  const accuracy = totalKeyPresses > 0 ? Math.round((correctKeyPresses / totalKeyPresses) * 100) : 100;

  useEffect(() => {
    if (!started || gameOver || paused) return;
    const canvas = canvasRef.current;
    const textCanvas = textCanvasRef.current;
    if (!canvas || !textCanvas) return;
    const ctx = canvas.getContext('2d');
    const textCtx = textCanvas.getContext('2d');
    if (!ctx || !textCtx) return;

    let animationFrameId: number;
    if (startTimeRef.current === 0) startTimeRef.current = Date.now();
    const PLAYER = { x: 512, y: 700 };

    const handleKeyDown = (e: KeyboardEvent) => {
      const char = e.key.toUpperCase();
      if (!/[A-Z]/.test(char)) return;

      setTotalKeyPresses(prev => prev + 1);

      // Trigger casting animation
      setManusCasting(true);
      setTimeout(() => setManusCasting(false), 200);

      if (activeWordRef.current !== null) {
        const word = wordsRef.current[activeWordRef.current];
        if (word.text[word.typed.length] === char) {
          word.typed += char;
          setCorrectKeyPresses(prev => prev + 1);
          setCombo(prev => prev + 1); // Combo up
          fireballsRef.current.push({ x: PLAYER.x, y: PLAYER.y, tx: word.x, ty: word.y, progress: 0, isSpecial: word.isSpecial });
          if (word.typed === word.text) {
                    // Massive explosion if it was a special word
                    if (word.isSpecial) {
                        for(let i=0; i<100; i++) {
                            const angle = Math.random() * Math.PI * 2;
                            const speed = Math.random() * 8 + 2;
                            particlesRef.current.push({
                                x: word.x, 
                                y: word.y, 
                                vx: Math.cos(angle) * speed, 
                                vy: Math.sin(angle) * speed, 
                                life: 40,
                                color: "#ff80cc",
                                isHeart: true
                            });
                        }
                        setHealth(10);
                        setIsBlessed(true);
                        if (blessedTimeoutRef.current) clearTimeout(blessedTimeoutRef.current);
                        blessedTimeoutRef.current = setTimeout(() => setIsBlessed(false), 10000);
                    }

            wordsRef.current.splice(activeWordRef.current, 1);
            activeWordRef.current = null;
            setScore(prev => prev + word.text.length * 10);
            setCombo(prev => prev + 5); // Bonus combo
          }
        } else {
             setCombo(0); // Reset combo
        }
      } else {
        const index = wordsRef.current.findIndex(w => w.text.startsWith(char));
        if (index !== -1) {
          wordsRef.current[index].typed = char;
          setCorrectKeyPresses(prev => prev + 1);
          setCombo(prev => prev + 1); // Combo up
          activeWordRef.current = index;
          fireballsRef.current.push({ x: PLAYER.x, y: PLAYER.y, tx: wordsRef.current[index].x, ty: wordsRef.current[index].y, progress: 0, isSpecial: wordsRef.current[index].isSpecial });
        } else {
            setCombo(0); // Reset on miss
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    const gameLoop = () => {
      if (gameOver || paused) return;
      const elapsed = (Date.now() - startTimeRef.current - totalPausedDurationRef.current) / 1000;
      const currentDifficulty = Math.min(elapsed / 210, 5); // Reach max difficulty in 3.5 mins
      
      // Update difficulty state less frequently for better performance
      if (Math.round(currentDifficulty * 10) !== difficulty) {
        setDifficulty(Math.round(currentDifficulty * 10));
      }

      const spawnChance = 0.017 + (currentDifficulty * 0.007); // Adjusted for 3.5m
      const speedModifier = 1 + (currentDifficulty * 0.4); // Adjusted for 3.5m

      ctx.fillStyle = "#050505";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      textCtx.clearRect(0, 0, textCanvas.width, textCanvas.height);

      if (Math.random() < spawnChance) {
        const minLength = Math.min(Math.floor(3 + currentDifficulty * 1.5), 12);
        const availableWords = GOTHIC_WORDS.filter(word => 
          word.length >= minLength && 
          !wordsRef.current.some(existing => existing.text[0] === word[0]) &&
          !lastWordsRef.current.includes(word)
        );

        if (availableWords.length > 0) {
          totalWordsSpawnedRef.current++;
          let newText = availableWords[Math.floor(Math.random() * availableWords.length)];
          let isSpecial = false;

          if (totalWordsSpawnedRef.current === 5 || (totalWordsSpawnedRef.current > 5 && Math.random() < 0.1)) {
            newText = 'JESSYKA';
            isSpecial = true;
          }

          const newX = Math.random() * (canvas.width - 200);
          if (!wordsRef.current.some(existing => Math.abs(existing.x - newX) < 150 && Math.abs(existing.y - (-50)) < 100)) {
            wordsRef.current.push({ text: newText, x: newX, y: -50, speed: (0.15 + Math.random() * 0.3) * speedModifier, typed: '', isSpecial });
            lastWordsRef.current.push(newText);
            if (lastWordsRef.current.length > 20) lastWordsRef.current.shift();
          }
        }
      }

      fireballsRef.current.forEach((fb, i) => {
        fb.progress += fb.isSpecial ? 0.02 : 0.04; // Slower for special
        fb.x = PLAYER.x + (fb.tx - PLAYER.x) * fb.progress;
        fb.y = PLAYER.y + (fb.ty - PLAYER.y) * fb.progress;
        
        // Dynamic fireball appearance
        const currentRank = COMBO_RANKS.slice().reverse().find(r => comboRef.current >= r.count) || COMBO_RANKS[0];
        const isSpear = ['S', 'SS', 'SSS'].includes(currentRank.id);
        const isSSS = currentRank.id === 'SSS';
        
        // Define colors and spear scaling
        const fireballColor = fb.isSpecial ? "#ff80cc" : `hsl(${20 + comboRef.current}, 100%, 50%)`;
        const sssColorPrimary = "#00ddff";
        const sssColorSecondary = "#ffffff";
        const spearMultiplier = isSSS ? 1.0 : (currentRank.id === 'SS' ? 0.7 : 0.4);
        
        // Dramatically scaling size (much slower now)
        const baseSize = isSpear ? (10 * spearMultiplier) : 5;
        const scale = 1 + (comboRef.current / 150); 
        const fireballSize = baseSize * scale;

        ctx.shadowBlur = isSpear ? 40 : 10 + (comboRef.current / 5); 
        ctx.shadowColor = fb.isSpecial ? "#ff0099" : (isSpear ? (isSSS ? "#00ffff" : "#0055ff") : "#ff4500");
        ctx.fillStyle = fb.isSpecial ? "#ff80cc" : (isSpear ? (isSSS ? sssColorPrimary :'#55bbff') : fireballColor);
        
        ctx.beginPath();
        if (fb.isSpecial) {
           const size = fireballSize * 6;
           // Slimmer heart shape
           ctx.moveTo(fb.x, fb.y + size / 4);
           ctx.bezierCurveTo(fb.x, fb.y, fb.x - size / 3, fb.y - size / 4, fb.x - size / 3, fb.y + size / 4);
           ctx.bezierCurveTo(fb.x - size / 3, fb.y + size / 2, fb.x, fb.y + size * 0.8, fb.x, fb.y + size);
           ctx.bezierCurveTo(fb.x, fb.y + size * 0.8, fb.x + size / 3, fb.y + size / 2, fb.x + size / 3, fb.y + size / 4);
           ctx.bezierCurveTo(fb.x + size / 3, fb.y - size / 4, fb.x, fb.y, fb.x, fb.y + size / 4);
        } else if (isSpear) {
            // Draw SSS spear/missile shape
            const angle = Math.atan2(fb.ty - fb.y, fb.tx - fb.x);
            const length = fireballSize * 3;
            ctx.moveTo(fb.x + Math.cos(angle) * length, fb.y + Math.sin(angle) * length);
            ctx.lineTo(fb.x + Math.cos(angle + Math.PI * 0.8) * length * 0.3, fb.y + Math.sin(angle + Math.PI * 0.8) * length * 0.3);
            ctx.lineTo(fb.x - Math.cos(angle) * length * 0.5, fb.y - Math.sin(angle) * length * 0.5);
            ctx.lineTo(fb.x + Math.cos(angle - Math.PI * 0.8) * length * 0.3, fb.y + Math.sin(angle - Math.PI * 0.8) * length * 0.3);
            ctx.closePath();
        } else {
            ctx.arc(fb.x, fb.y, fireballSize, 0, Math.PI * 2);
        }
        ctx.fill();
        ctx.shadowBlur = 0;
        
        // Spawn particles based on type
        const particleCount = fb.isSpecial ? 3 : (isSpear ? 6 : Math.floor(comboRef.current/25) + 1);
        for(let k=0; k < particleCount; k++) {
            particlesRef.current.push({
                x: fb.x, 
                y: fb.y, 
                vx: (Math.random()-0.5) * (isSpear ? 6 : 3), 
                vy: (Math.random()-0.5) * (isSpear ? 6 : 3), 
                life: isSpear ? 15 : 8,
                color: fb.isSpecial ? "#ff80cc" : (isSpear ? (Math.random() > 0.5 ? (isSSS ? sssColorPrimary : '#55bbff') : sssColorSecondary) : fireballColor),
                isHeart: fb.isSpecial
            });
        }

        if (fb.progress >= 1) {
            fireballsRef.current.splice(i, 1);
            // Huge explosion at higher combos (scaled down division)
            const explosionSize = 10 + Math.floor(comboRef.current / 50);
            for(let j=0; j < explosionSize * 5; j++) {
                particlesRef.current.push({
                    x: fb.tx, 
                    y: fb.ty, 
                    vx: Math.random()*8-4, 
                    vy: Math.random()*8-4, 
                    life: 20,
                    color: fb.isSpecial ? "#ff80cc" : fireballColor,
                    isHeart: fb.isSpecial
                });
            }
            
            const wordIndex = wordsRef.current.findIndex(w => Math.abs(w.x - fb.tx) < 70);
            if(wordIndex !== -1) {
                const word = wordsRef.current[wordIndex];
                const resistance = Math.min(word.typed.length / word.text.length, 0.9);
                // Reduce impact pushback
                word.y -= (5 * (1 - resistance) * scale);
            }
        }
      });
      
      particlesRef.current.forEach((p, i) => { 
        p.x += p.vx; p.y += p.vy; p.life -= 1; 
        ctx.fillStyle = p.color || "orange"; 
        if (p.isHeart) {                
            const size = 3; // Smaller hearts
            ctx.beginPath();
            ctx.moveTo(p.x, p.y + size / 4);
            ctx.bezierCurveTo(p.x, p.y, p.x - size / 2, p.y, p.x - size / 2, p.y + size / 2);
            ctx.bezierCurveTo(p.x - size / 2, p.y + size * 0.75, p.x, p.y + size, p.x, p.y + size);
            ctx.bezierCurveTo(p.x, p.y + size, p.x + size / 2, p.y + size * 0.75, p.x + size / 2, p.y + size / 2);
            ctx.bezierCurveTo(p.x + size / 2, p.y, p.x, p.y, p.x, p.y + size / 4);
            ctx.fill();
        } else {                
            ctx.fillRect(p.x, p.y, 3, 3);
        }
        if(p.life <= 0) particlesRef.current.splice(i, 1); 
      });

      // Update Words
      for (let index = wordsRef.current.length - 1; index >= 0; index--) {
        const word = wordsRef.current[index];
        // Homing logic: move towards PLAYER.x, PLAYER.y
        const dx = PLAYER.x - word.x;
        const dy = PLAYER.y - word.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        // Move towards player
        word.x += (dx / dist) * word.speed * 2;
        word.y += (dy / dist) * word.speed * 2;
        
        // Render word letter by letter to fix alignment with non-monospaced fonts
        let currentX = word.x;
        textCtx.font = `24px "Cinzel"`;
        for (let i = 0; i < word.text.length; i++) {
            const char = word.text[i];
            const isTyped = i < word.typed.length;
            
            textCtx.fillStyle = isTyped ? (word.isSpecial ? "#ff80cc" : "#ff4500") : "#d1c7b7";
            textCtx.fillText(char, currentX, word.y);
            currentX += textCtx.measureText(char).width;
        }

        // Damage on contact with player
        if (dist < 50) {
          wordsRef.current.splice(index, 1);
          
          if (activeWordRef.current !== null) {
              if (activeWordRef.current === index) {
                  activeWordRef.current = null;
              } else if (activeWordRef.current > index) {
                  activeWordRef.current--;
              }
          }

          setHealth(prev => {
            const nextHealth = Math.max(0, prev - 4); // 4x damage
            if (nextHealth === 0) setGameOver(true);
            return nextHealth;
          });
        }
      }
      animationFrameId = requestAnimationFrame(gameLoop);
    };
    gameLoop();
    return () => { cancelAnimationFrame(animationFrameId); window.removeEventListener('keydown', handleKeyDown); };
  }, [started, gameOver, paused]);

  return (
    <div 
        className="w-full h-[100dvh] bg-black flex items-center justify-center font-serif text-[#d1c7b7] overflow-hidden"
        onClick={() => {
            if (started && !gameOver && !paused && mobileInputRef.current) {
                mobileInputRef.current.focus();
                setIsMobileFocused(true);
            }
        }}
    >
      {/* Hidden input for mobile keyboard triggering */}
      <input 
        ref={mobileInputRef}
        type="text"
        className="absolute top-[-100px] left-0 opacity-0"
        value=""
        onBlur={() => setIsMobileFocused(false)}
        onChange={(e) => {
            const val = e.target.value;
            if (val.length > 0) {
                const char = val[val.length - 1];
                window.dispatchEvent(new KeyboardEvent('keydown', { key: char }));
            }
        }}
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck="false"
      />

      <div className="relative shrink-0 w-[1024px] h-[768px] bg-[radial-gradient(circle_at_center,#1a1a1a_0%,#050505_100%)] border-4 border-[#1c1c1c] shadow-2xl overflow-hidden" 
           style={{border: '4px solid #1c1c1c', transform: `scale(${scale})`, transformOrigin: 'center center'}}>
        <canvas ref={canvasRef} width={1024} height={768} className="absolute top-0 left-0 z-10" />
        <canvas ref={textCanvasRef} width={1024} height={768} className="absolute top-0 left-0 z-40 pointer-events-none" />
        
        <img 
          src={manusCasting ? "/casting2.png" : "/idle1.png"} 
          alt="Manus"
          className="absolute bottom-4 left-[512px] -translate-x-1/2 w-32 h-32 object-contain transition-all duration-100 z-20"
        />

        {!started && (
          <div className="absolute top-0 left-0 w-full h-full bg-black/95 flex flex-col items-center justify-center z-50 p-8 text-center">
            <h1 className="font-[Cinzel] text-5xl text-amber-700 mb-8 tracking-[0.3em] drop-shadow-[0_0_15px_rgba(180,83,9,0.4)]">CURSED ECHOES</h1>
            
            <div className="max-w-md bg-amber-950/20 border border-amber-900/40 p-6 rounded mb-12 backdrop-blur-sm shadow-[0_0_30px_rgba(0,0,0,0.5)]">
              <h2 className="font-[Cinzel] text-amber-600 text-xl mb-4 tracking-widest uppercase border-b border-amber-900/30 pb-2">How to Play</h2>
              <ul className="text-amber-100/70 text-sm space-y-3 font-serif tracking-wide text-left list-none">
                <li className="flex items-start gap-2">
                  <span className="text-amber-600 mt-1">◈</span>
                  <span>Type the echoes appearing from the darkness to banish them with fire.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-600 mt-1">◈</span>
                  <span>Do not let the echoes reach your position, or your life will wither.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-600 mt-1">◈</span>
                  <span>Maintain your combo to ascend through the ranks of the Abyss.</span>
                </li>
              </ul>
            </div>

            <button 
                onClick={() => setStarted(true)} 
                className="group relative px-16 py-6 overflow-hidden border border-amber-900 bg-black text-amber-600 font-[Cinzel] text-2xl tracking-[0.3em] transition-all hover:text-amber-400 hover:border-amber-500 shadow-[0_0_20px_rgba(127,29,29,0.3)]"
            >
                <div className="absolute inset-0 w-0 bg-amber-900/20 transition-all duration-300 ease-out group-hover:w-full"></div>
                <span className="relative z-10 animate-pulse">CHALLENGE THE ABYSS</span>
            </button>
            <p className="mt-8 text-amber-900/40 font-serif text-xs tracking-widest uppercase">The darkness waits for no one</p>
          </div>
        )}

        {gameOver && !showSecretScreen && (
          <div className="absolute top-0 left-0 w-full h-full bg-black/95 z-50 flex flex-col items-center justify-center fade-in backdrop-blur-sm">
            <div className="font-[Cinzel] text-[100px] text-[#8b0000] font-bold tracking-[0.15em] drop-shadow-[0_0_20px_rgba(139,0,0,0.5)] zoom-in">YOU DIED</div>
            <div className="mt-8 text-2xl opacity-60 font-[Cinzel] slide-in" style={{ animationDelay: '300ms' }}>Souls Harvested: {score}</div>
            <div className="mt-2 text-2xl opacity-60 font-[Cinzel] slide-in flex items-center" style={{ animationDelay: '500ms' }}>
              Max Combo: {maxCombo}
              <img src={`/${topRank.id}-removebg-preview.png`} alt={topRank.label} className="h-10 object-contain mx-2" />
            </div>
            <div className="mt-2 text-2xl opacity-60 font-[Cinzel] slide-in" style={{ animationDelay: '700ms' }}>Accuracy: {accuracy}%</div>
            
            <div className="mt-12 flex flex-col items-center fade-in" style={{ animationDelay: '1000ms' }}>
                <p className="text-lg text-[#ff4444] font-bold mb-4 font-[Cinzel] tracking-[0.5em] uppercase drop-shadow-[0_0_15px_rgba(255,0,0,0.8)] animate-pulse">Secret Password</p>
                <form onSubmit={(e) => {
                    e.preventDefault();
                    if (secretPassword.toUpperCase() === 'ILOVEMYGF') {
                        setShowSecretScreen(true);
                    } else {
                        setPasswordError(true);
                        setTimeout(() => setPasswordError(false), 500);
                        setSecretPassword('');
                    }
                }} className="flex">
                    <input 
                        type="password" 
                        value={secretPassword}
                        onChange={(e) => setSecretPassword(e.target.value)}
                        className={`bg-[#0a0000] border ${passwordError ? 'border-red-500 shadow-[0_0_20px_rgba(255,0,0,0.6)]' : 'border-[#ff4444]/60 shadow-[0_0_20px_rgba(255,0,0,0.3)]'} text-red-100 font-serif text-center px-6 py-3 outline-none focus:border-[#ff4444] focus:shadow-[0_0_25px_rgba(255,0,0,0.5)] transition-all tracking-[0.4em] placeholder:text-[#ff4444]/30 w-64 ${passwordError ? 'animate-[shake_0.5s_ease-in-out]' : ''}`}
                        placeholder="..."
                    />
                </form>
            </div>

            <button onClick={() => location.reload()} className="mt-12 px-8 py-2 border border-amber-900/40 hover:bg-amber-900/10 transition-colors uppercase text-lg tracking-widest font-[Cinzel] fade-in" style={{ animationDelay: '1500ms' }}>Try Again</button>

            <div className="absolute right-8 bottom-8 flex flex-col items-center z-[60] fade-in w-48" style={{ animationDelay: '1200ms' }}>
                <h2 className="text-[#8b0000] font-[Cinzel] tracking-widest text-[1rem] leading-none mb-3 border-b border-[#8b0000]/50 pb-1 drop-shadow-[0_0_10px_rgba(139,0,0,0.8)] uppercase">Hall of Records</h2>
                {highscores.length === 0 ? (
                    <div className="text-amber-700/50 font-[Cinzel] italic text-xs">No legendary souls yet...</div>
                ) : highscores.map((hs, i) => (
                    <div key={i} className="flex flex-col w-full mb-2 bg-black/60 px-3 py-2 rounded-sm border border-amber-900/40 hover:bg-amber-900/10 transition-colors shadow-lg">
                        <div className="flex justify-between items-end mb-1">
                            <span className="text-amber-700/80 font-[Cinzel] text-xs tracking-widest">Rank {i + 1}</span>
                            <span className="text-[#8b0000] font-[Cinzel] text-xl drop-shadow-[0_0_8px_rgba(139,0,0,0.6)] font-bold">{hs.souls.toString().padStart(6, '0')}</span>
                        </div>
                        <div className="flex justify-between border-t border-amber-900/30 pt-1 mt-1">
                            <span className="text-[#a19787] font-[Cinzel] text-[9px] uppercase tracking-widest">Max Combo</span>
                            <span className="text-amber-500 font-[Cinzel] text-xs font-bold">{hs.maxCombo}</span>
                        </div>
                    </div>
                ))}
            </div>
          </div>
        )}

        {showSecretScreen && !yesChecked && (
            <div className="absolute top-0 left-0 w-full h-full bg-[#050002] z-[100] flex flex-col items-center justify-center fade-in">
                <button 
                    onClick={() => setShowSecretScreen(false)} 
                    className="absolute top-8 left-8 z-[120] text-[#ff80cc]/60 hover:text-[#ff80cc] font-[Cinzel] tracking-widest transition-all drop-shadow-[0_0_10px_rgba(255,128,204,0.3)] hover:drop-shadow-[0_0_15px_rgba(255,128,204,0.8)]"
                >
                    ← BACK
                </button>

                <img 
                    src="/Jessyka.gif" 
                    alt="Jessyka" 
                    className="w-auto h-[350px] object-cover rounded-2xl mb-8"
                />
                
                <h1 className="text-4xl md:text-5xl text-[#ff80cc] font-[Cinzel] font-bold tracking-widest drop-shadow-[0_0_20px_rgba(255,128,204,0.9)] animate-pulse text-center mb-12">
                    Får jag chans på dig? &lt;3
                </h1>

                <div className="flex gap-16 w-full justify-center">
                    <label className="flex items-center gap-2 cursor-pointer group">
                        <div className="relative flex items-center justify-center">
                            <input 
                                type="checkbox" 
                                checked={yesChecked}
                                onChange={(e) => {
                                    setYesChecked(e.target.checked);
                                }}
                                className="peer appearance-none w-4 h-4 border border-[#ff80cc]/50 rounded-[2px] bg-black/50 checked:bg-[#ff80cc] checked:border-[#ff80cc] transition-all cursor-pointer shadow-[0_0_10px_rgba(255,128,204,0.2)]"
                            />
                            <svg className="absolute w-2.5 h-2.5 text-[#050002] pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="4"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                        </div>
                        <span className="text-xl text-[#ff80cc]/70 font-[Cinzel] tracking-widest group-hover:text-[#ff80cc] group-hover:drop-shadow-[0_0_15px_rgba(255,128,204,0.8)] transition-all">JA OMG</span>
                    </label>

                    <label 
                        className={`flex items-center gap-2 cursor-pointer group ${noHoverPos ? 'absolute' : ''} transition-all duration-100 z-[110]`}
                        style={noHoverPos ? { left: `${noHoverPos.x}px`, top: `${noHoverPos.y}px` } : {}}
                        onMouseEnter={runAway}
                        onClick={runAway}
                        onTouchStart={runAway}
                    >
                        <div className="relative flex items-center justify-center pointer-events-none">
                            <input 
                                type="checkbox" 
                                checked={false}
                                onChange={() => {}}
                                className="peer appearance-none w-4 h-4 border border-[#ff80cc]/50 rounded-[2px] bg-black/50 transition-all shadow-[0_0_10px_rgba(255,128,204,0.2)]"
                                tabIndex={-1}
                            />
                            <svg className="absolute w-2.5 h-2.5 text-[#050002] opacity-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="4"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        </div>
                        <span className="text-xl text-[#ff80cc]/70 font-[Cinzel] tracking-widest group-hover:text-[#ff80cc] group-hover:drop-shadow-[0_0_15px_rgba(255,128,204,0.8)] transition-all pointer-events-none">NEJ USCHH</span>
                    </label>
                </div>
            </div>
        )}

        {showSecretScreen && yesChecked && (
            <div className="absolute top-0 left-0 w-full h-full bg-[#050002] z-[100] flex flex-col items-center justify-center fade-in">
                <button 
                    onClick={() => { setYesChecked(false); setNoHoverPos(null); }} 
                    className="absolute top-8 left-8 z-[120] text-[#ff80cc]/60 hover:text-[#ff80cc] font-[Cinzel] tracking-widest transition-all drop-shadow-[0_0_10px_rgba(255,128,204,0.3)] hover:drop-shadow-[0_0_15px_rgba(255,128,204,0.8)]"
                >
                    ← BACK
                </button>

                <h1 className="text-4xl md:text-5xl text-[#ff80cc] font-[Cinzel] font-bold tracking-widest drop-shadow-[0_0_20px_rgba(255,128,204,0.9)] animate-pulse text-center mb-8">
                    CLICK ME!!!!
                </h1>
                
                <img 
                    src="/placeholder.jpg" 
                    alt="Placeholder" 
                    className="w-auto h-[350px] object-cover rounded-2xl mb-8 hover:shadow-[0_0_30px_rgba(255,128,204,0.6)] transition-all active:scale-95 cursor-none"
                    onMouseEnter={(e) => setKissPos({ x: e.clientX, y: e.clientY })}
                    onMouseMove={(e) => setKissPos({ x: e.clientX, y: e.clientY })}
                    onMouseLeave={() => setKissPos(null)}
                    onClick={(e) => {
                        const audio = new Audio('/smooch.mp3');
                        audio.play().catch(err => console.log('Audio playback failed:', err));

                        // Spawn hearts
                        const rect = e.currentTarget.getBoundingClientRect();
                        const xBase = e.clientX - rect.left;
                        const yBase = e.clientY - rect.top;
                        
                        // we'll get the real absolute coordinates by removing rect offsets or just use client bounds
                        // Since we have absolute scaling, it's safer to use event.clientX/Y from the wrapper, but let's just do random screen positions
                        
                        const numHearts = 15;
                        const newHearts = Array.from({length: numHearts}).map((_, i) => ({
                            id: Date.now() + i + Math.random(),
                            x: Math.random() * 1024,
                            y: Math.random() * 768,
                            scale: Math.random() * 0.8 + 0.5
                        }));
                        
                        setSecretHearts(prev => [...prev, ...newHearts]);
                        
                        setTimeout(() => {
                            setSecretHearts(prev => prev.filter(h => !newHearts.find(n => n.id === h.id)));
                        }, 2000);
                    }}
                />
                
                <h1 className="text-4xl md:text-5xl text-[#ff80cc] font-[Cinzel] font-bold tracking-widest drop-shadow-[0_0_20px_rgba(255,128,204,0.9)] animate-pulse text-center">
                    Jag älskar dig baby &lt;333
                </h1>

                {secretHearts.map(heart => (
                    <div 
                        key={heart.id} 
                        className="absolute pointer-events-none z-[120] animate-float-heart"
                        style={{ left: heart.x, top: heart.y, '--scale': heart.scale } as any}
                    >
                        <span className="text-6xl drop-shadow-[0_0_10px_rgba(255,128,204,0.8)]">❤️</span>
                    </div>
                ))}
            </div>
        )}

        {started && !gameOver && (
          <>
            <button onClick={() => setPaused(!paused)} className="absolute top-8 right-8 z-50 px-4 py-2 border border-amber-900 text-amber-600 font-[Cinzel] hover:bg-amber-900/20">{paused ? "RESUME" : "PAUSE"}</button>
            <div className="absolute top-8 left-8 flex flex-col gap-2 z-30">
                {isBlessed && (
                    <div className="text-xl text-[#ff80cc] font-[Cinzel] font-bold tracking-widest animate-pulse drop-shadow-[0_0_15px_rgba(255,128,204,0.8)] mb-1">
                        BLESSED BY GODESS
                    </div>
                )}
                <div className={`h-4 w-[300px] border transition-all duration-300 ${isBlessed ? 'bg-[#1a000d] border-[#ff80cc] shadow-[0_0_20px_rgba(255,128,204,0.8)]' : 'bg-[#1a0a0a] border-[#3d1a1a]'}`}>
                    <div className={`h-full transition-all duration-300 ${isBlessed ? 'bg-linear-to-r from-[#ff0080] to-[#ff80cc]' : 'bg-linear-to-r from-[#8b0000] to-[#ff0000]'}`} style={{width: `${(health / 10) * 100}%`}}></div>
                </div>
                <div className="text-xl opacity-60 font-[Cinzel]">Souls: {score.toString().padStart(6, '0')}</div>
                <div className="text-xl opacity-60 font-[Cinzel]">Difficulty: {difficulty}</div>
                <div className="text-sm opacity-60 font-[Cinzel]">Accuracy: {accuracy}%</div>
                {/* Combo Display */}
                <div className="flex flex-col items-start gap-1 mt-2">
                    <img 
                        src={`/${currentRank.id}-removebg-preview.png`}
                        alt={currentRank.label}
                        className={`h-18 object-contain ${currentRank.id === 'SSS' ? 'animate-shake' : ''}`}
                    />
                    <div className="text-xl opacity-60 font-[Cinzel]">x{combo}</div>
                </div>
            </div>
          </>
        )}

        {started && !gameOver && !paused && !isMobileFocused && (
            <div className="absolute top-[80%] left-1/2 -translate-x-1/2 z-[60] bg-black/60 px-6 py-2 border border-amber-900/40 animate-pulse pointer-events-none md:hidden">
                <span className="font-[Cinzel] tracking-[0.2em] text-amber-600/80 uppercase">Tap screen to type</span>
            </div>
        )}
      </div>

      {kissPos && (
          <img 
              src="/kiss-removebg-preview.png"
              alt="Kiss Cursor"
              className="fixed pointer-events-none z-[9999] w-24 h-24 object-contain -translate-x-1/2 -translate-y-1/2"
              style={{ left: kissPos.x, top: kissPos.y }}
          />
      )}
    </div>
  );
}
