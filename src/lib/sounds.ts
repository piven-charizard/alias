// Sound effects using Web Audio API - no external files needed

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

// Unlock audio on first user interaction (required by mobile browsers)
export function unlockAudio() {
  const ctx = getCtx();
  if (ctx.state === "suspended") {
    ctx.resume();
  }
}

function playTone(
  freq: number,
  duration: number,
  type: OscillatorType = "sine",
  volume = 0.3,
  rampDown = true
) {
  const ctx = getCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.value = volume;
  if (rampDown) {
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  }
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + duration);
}

function playNoise(duration: number, volume = 0.1) {
  const ctx = getCtx();
  const bufferSize = ctx.sampleRate * duration;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.value = volume;
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  const filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = 3000;
  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  source.start();
}

// ---- Sound Effects ----

/** Happy ascending arpeggio - correct guess */
export function playCorrect() {
  const notes = [523, 659, 784]; // C5, E5, G5
  notes.forEach((freq, i) => {
    setTimeout(() => {
      playTone(freq, 0.15, "sine", 0.25);
    }, i * 60);
  });
}

/** Descending buzzer - skip */
export function playSkip() {
  playTone(300, 0.25, "square", 0.15);
  setTimeout(() => playTone(200, 0.2, "square", 0.1), 80);
}

/** Tick sound for last 10 seconds */
export function playTick() {
  playTone(800, 0.05, "sine", 0.15);
}

/** Urgent tick for last 5 seconds */
export function playUrgentTick() {
  playTone(1000, 0.08, "square", 0.2);
  setTimeout(() => playTone(1000, 0.08, "square", 0.15), 100);
}

/** Round start - energetic ascending */
export function playRoundStart() {
  const notes = [392, 494, 587, 784]; // G4, B4, D5, G5
  notes.forEach((freq, i) => {
    setTimeout(() => {
      playTone(freq, 0.2, "sine", 0.25);
    }, i * 100);
  });
}

/** Time's up - horn blast */
export function playTimeUp() {
  playTone(220, 0.6, "sawtooth", 0.2);
  playTone(220, 0.6, "square", 0.15);
  setTimeout(() => {
    playTone(165, 0.8, "sawtooth", 0.2);
    playTone(165, 0.8, "square", 0.15);
  }, 200);
}

/** Victory fanfare */
export function playVictory() {
  const notes = [523, 659, 784, 1047]; // C5, E5, G5, C6
  notes.forEach((freq, i) => {
    setTimeout(() => {
      playTone(freq, 0.3, "sine", 0.2);
      playTone(freq * 1.5, 0.3, "sine", 0.1); // harmony
    }, i * 150);
  });
  // Sparkle noise at the end
  setTimeout(() => playNoise(0.3, 0.05), 600);
}

/** Player joined - pop */
export function playPlayerJoin() {
  playTone(880, 0.1, "sine", 0.2);
  setTimeout(() => playTone(1100, 0.1, "sine", 0.15), 50);
}

/** Button click - subtle */
export function playClick() {
  playTone(600, 0.04, "sine", 0.1);
}

/** Game start countdown beep */
export function playCountdown() {
  playTone(660, 0.15, "sine", 0.2);
}
