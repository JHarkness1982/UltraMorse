/* ============================================================
   ULTRAMORSE — audio.js (versione stabile con beep udibile)
   Trasmissione con loop temporizzato reale + onda sinusoidale
   ============================================================ */

(function () {

  let audioCtx = null;

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
     TRASMISSIONE BITSTREAM (versione stabile)
     ============================================================ */

  let isTransmitting = false;

  async function transmitBits(bitstream) {
    const ctx = await ensureAudioContext();
    isTransmitting = true;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    // Frequenza udibile per test diagnostico
    osc.type = "sine";
    osc.frequency.value = ULTRA.FREQ;  // es. 1000 Hz

    gain.gain.setValueAtTime(0.0, ctx.currentTime);

    osc.connect(gain).connect(ctx.destination);
    osc.start();

    const ut_ms = ULTRA.UT * 1000;
    let i = 0;

    return new Promise(resolve => {
      const interval = setInterval(() => {
        if (!isTransmitting || i >= bitstream.length) {
          gain.gain.setValueAtTime(0.0, ctx.currentTime);
          clearInterval(interval);
          osc.stop(ctx.currentTime + 0.05);
          isTransmitting = false;
          resolve(bitstream.length * ut_ms);
          return;
        }

        const b = bitstream[i++];
        gain.gain.setValueAtTime(b === "1" ? 1.0 : 0.0, ctx.currentTime);

      }, ut_ms);
    });
  }

  function stopTransmission() {
    isTransmitting = false;
  }

  /* ============================================================
     MICROFONO + DECODER (invariati)
     ============================================================ */

  let micStream = null;
  let analyser = null;
  let freqData = null;
  let isListening = false;

  async function startMic() {
    const ctx = await ensureAudioContext();

    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      },
      video: false
    });

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

  function sampleUltrasonicEnergy() {
    if (!isListening || !analyser) return 0;

    analyser.getByteFrequencyData(freqData);

    const ctx = audioCtx;
    if (!ctx) return 0;

    const sampleRate = ctx.sampleRate;
    const nyquist = sampleRate / 2;

    // indice FFT sicuro
    const index = Math.min(
      freqData.length - 1,
      Math.max(0, Math.round(ULTRA.FREQ / nyquist * freqData.length))
    );

    return freqData[index] || 0;
  }

  let listenInterval = null;

  function startListening(callback) {
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
