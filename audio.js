/* ============================================================
   ULTRAMORSE — audio.js (versione bufferizzata e stabile)
   Genera un AudioBuffer completo e lo riproduce senza jitter
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
     TRASMISSIONE: bitstream → AudioBuffer → riproduzione
     ============================================================ */

  let isTransmitting = false;

  async function transmitBits(bitstream) {
    const ctx = await ensureAudioContext();
    isTransmitting = true;

    const sampleRate = ctx.sampleRate;
    const ut = ULTRA.UT; // durata di un bit in secondi
    const freq = ULTRA.FREQ; // es. 1000 Hz per test

    // Numero totale di campioni
    const totalSamples = Math.floor(bitstream.length * ut * sampleRate);

    // Creiamo il buffer audio
    const buffer = ctx.createBuffer(1, totalSamples, sampleRate);
    const data = buffer.getChannelData(0);

    let writePos = 0;

    for (const bit of bitstream) {
      const bitSamples = Math.floor(ut * sampleRate);

      if (bit === "1") {
        // Scriviamo una sinusoide perfetta
        for (let i = 0; i < bitSamples; i++) {
          const t = (writePos + i) / sampleRate;
          data[writePos + i] = Math.sin(2 * Math.PI * freq * t) * 0.9;
        }
      } else {
        // Silenzio
        for (let i = 0; i < bitSamples; i++) {
          data[writePos + i] = 0;
        }
      }

      writePos += bitSamples;
    }

    // Riproduciamo il buffer
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    source.start();

    // Durata totale in ms
    const durationMs = (totalSamples / sampleRate) * 1000;

    return durationMs;
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

