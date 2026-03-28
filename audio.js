/* ============================================================
   ULTRAMORSE — audio.js (TX bufferizzato con sawtooth + fade-in)
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
    const ut   = ULTRA.UT;    // durata bit (es. 0.120)
    const freq = ULTRA.FREQ;  // 9000 Hz

    const totalSamples = Math.floor(bitstream.length * ut * sampleRate);

    const buffer = ctx.createBuffer(1, totalSamples, sampleRate);
    const data   = buffer.getChannelData(0);

    let writePos = 0;

    // Fade-in di 10 ms
    const fadeSamples = Math.floor(0.010 * sampleRate);

    for (const bit of bitstream) {
      const bitSamples = Math.floor(ut * sampleRate);

      if (bit === "1") {

        for (let i = 0; i < bitSamples; i++) {
          const t = (writePos + i) / sampleRate;

          // fase in cicli
          const phase = freq * t;
          const frac  = phase - Math.floor(phase);

          // sawtooth centrata [-1, 1]
          let sample = 2 * frac - 1;

          // fade-in
          if (i < fadeSamples) {
            sample *= (i / fadeSamples);
          }

          data[writePos + i] = sample * 0.5; // volume morbido
        }

      } else {
        // bit = 0 → silenzio
        for (let i = 0; i < bitSamples; i++) {
          data[writePos + i] = 0;
        }
      }

      writePos += bitSamples;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start();

    const durationMs = (totalSamples / sampleRate) * 1000;
    return durationMs;
  }

  function stopTransmission() {
    isTransmitting = false;
  }

  /* ============================================================
     MICROFONO + DECODER LIVE (ancora invariato)
     ============================================================ */

  let micStream  = null;
  let analyser   = null;
  let freqData   = null;
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
    const nyquist    = sampleRate / 2;

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
