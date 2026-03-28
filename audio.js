/* ============================================================
   ULTRAMORSE — audio.js
   Gestione audio OUT (trasmissione) e IN (microfono)
   ============================================================ */

(function () {

  let audioCtx = null;

  /* ============================================================
     AUDIO CONTEXT
     ============================================================ */

  async function ensureAudioContext() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === "suspended") {
      await audioCtx.resume();
    }
    return audioCtx;
  }

  /* ============================================================
     TRASMISSIONE BITSTREAM → ULTRASUONO
     ============================================================ */

  let isTransmitting = false;

  async function transmitBits(bitstream) {
    const ctx = await ensureAudioContext();
    isTransmitting = true;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.value = ULTRA.FREQ;

    gain.gain.value = 0.0;

    osc.connect(gain).connect(ctx.destination);

    const startTime = ctx.currentTime + 0.05;
    osc.start(startTime);

    let t = startTime;
    const ut = ULTRA.UT;

    for (const b of bitstream) {
      if (!isTransmitting) break;

      if (b === "1") {
        gain.gain.setValueAtTime(1.0, t);
      } else {
        gain.gain.setValueAtTime(0.0, t);
      }

      t += ut;
    }

    gain.gain.setValueAtTime(0.0, t);
    osc.stop(t + 0.05);

    isTransmitting = false;

    return (t - startTime) * 1000; // durata in ms
  }

  function stopTransmission() {
    isTransmitting = false;
  }

  /* ============================================================
     MICROFONO → ANALIZZATORE FFT
     ============================================================ */

  let micStream = null;
  let analyser = null;
  let freqData = null;
  let isListening = false;

  async function startMic() {
    const ctx = await ensureAudioContext();

    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        },
        video: false
      });
    } catch (err) {
      console.error("Microfono negato:", err);
      throw new Error("Accesso al microfono negato");
    }

    const source = ctx.createMediaStreamSource(micStream);

    analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;

    freqData = new Uint8Array(analyser.frequencyBinCount);

    source.connect(analyser);

    isListening = true;
  }

  function stopMic() {
    isListening = false;

    if (micStream) {
      micStream.getTracks().forEach(t => t.stop());
      micStream = null;
    }
  }

  /* ============================================================
     CAMPIONAMENTO ENERGIA ULTRASONICA
     ============================================================ */

  function sampleUltrasonicEnergy() {
    if (!isListening || !analyser) return 0;

    analyser.getByteFrequencyData(freqData);

    const ctx = audioCtx;
    if (!ctx) return 0;

    const nyquist = ctx.sampleRate / 2;
    const target = ULTRA.FREQ;

    const index = Math.round(target / nyquist * freqData.length);
    const amp = freqData[index] || 0;

    return amp;
  }

  /* ============================================================
     LOOP DI CAMPIONAMENTO PER DECODER
     ============================================================ */

  let listenInterval = null;

  function startListening(callback) {
    // callback(energy) → chiamato ogni UT
    if (!isListening) return;

    if (listenInterval) clearInterval(listenInterval);

    listenInterval = setInterval(() => {
      const energy = sampleUltrasonicEnergy();
      callback(energy);
    }, ULTRA.UT * 1000);
  }

  function stopListeningLoop() {
    if (listenInterval) {
      clearInterval(listenInterval);
      listenInterval = null;
    }
  }

  /* ============================================================
     ESPORTAZIONE
     ============================================================ */

  window.ULTRA_AUDIO = {
    ensureAudioContext,
    transmitBits,
    stopTransmission,
    startMic,
    stopMic,
    startListening,
    stopListeningLoop,
    sampleUltrasonicEnergy
  };

})();
