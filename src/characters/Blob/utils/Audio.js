export let audioCtx;

export function initAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
}

export function playGunshot() {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    // Sub thump for the punch
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(400, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(30, audioCtx.currentTime + 0.08);
    
    // Noise buffer
    const bufferSize = Math.floor(audioCtx.sampleRate * 0.2);
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) { data[i] = Math.random() * 2 - 1; }
    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;
    
    // Filter to roll off high frequencies naturally
    const noiseFilter = audioCtx.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.setValueAtTime(8000, audioCtx.currentTime);
    noiseFilter.frequency.exponentialRampToValueAtTime(400, audioCtx.currentTime + 0.15);
    
    const noiseGain = audioCtx.createGain();
    noiseGain.gain.setValueAtTime(0.6, audioCtx.currentTime);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12);
    
    // Synth volume envelope
    gainNode.gain.setValueAtTime(0.7, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
    
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(audioCtx.destination);
    
    osc.start(audioCtx.currentTime);
    noise.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.1);
    noise.stop(audioCtx.currentTime + 0.15);
}

export function playExplosion() {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    // Low frequency boom
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(120, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(10, audioCtx.currentTime + 1.0);
    
    // Noise buffer for the crackle
    const bufferSize = Math.floor(audioCtx.sampleRate * 2.0);
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) { data[i] = Math.random() * 2 - 1; }
    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;
    
    // Filter to shape the boom
    const noiseFilter = audioCtx.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.setValueAtTime(1000, audioCtx.currentTime);
    noiseFilter.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 1.5);
    
    const noiseGain = audioCtx.createGain();
    noiseGain.gain.setValueAtTime(1.5, audioCtx.currentTime);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 1.5);
    
    // Synth volume envelope
    gainNode.gain.setValueAtTime(1.0, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 1.0);
    
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(audioCtx.destination);
    
    osc.start(audioCtx.currentTime);
    noise.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 1.0);
    noise.stop(audioCtx.currentTime + 1.5);
}
