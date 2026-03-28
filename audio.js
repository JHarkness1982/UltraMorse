/* ============================================================
   ULTRAMORSE — audio.js (TX bufferizzato con sine + fade-in)
   Versione corretta con fase continua (perfetta a 48000 Hz)
   + recordBuffer(durationMs) per RX bufferizzato
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

    const sampleRate = ctx.sampleRate; // 48000 Hz
    const ut   = ULTRA.UT;             // es. 0.120
    const freq = ULTRA.FREQ;           // 400 Hz

    const totalSamples = Math.floor(bitstream.length * ut * sampleRate);

    const buffer = ctx.createBuffer(1, totalSamples, sampleRate);
    const data   = buffer.getChannelData(0);

    let writePos = 0;

    // Fade-in di 10 ms
    const fadeSamples = Math.floor(0.010 * sampleRate);

    // fase continua
    let phase = 0;
    const phaseIncrement = 2 * Math.PI * freq / sampleRate;

    for (const bit of bitstream) {
      const bitSamples = Math.floor(ut * sampleRate);

      if (bit === "1") {

        for (let i = 0; i < bitSamples; i++) {

          // sinusoide con fase continua
          let sample = Math.sin(phase);
          phase += phaseIncrement;

          // fade-in
          if (i < fadeSamples) {
            sample *= (i / fadeSamples);
          }

          data[writePos + i] = sample * 0.6;
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
    if (!isListening || !analyser) return;

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
     RX BUFFERIZZATO: recordBuffer(durationMs)
     ============================================================ */

  async function recordBuffer(durationMs) {
    const ctx = await ensureAudioContext();
    const sampleRate = ctx.sampleRate;

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      },
      video: false
    });

    const source = ctx.createMediaStreamSource(stream);

    const bufferSize = 4096;
    const recorder = ctx.createScriptProcessor(bufferSize, 1, 1);

    const chunks = [];
    let recording = true;

    recorder.onaudioprocess = function (e) {
      if (!recording) return;
      const input = e.inputBuffer.getChannelData(0);
      const copy = new Float32Array(input.length);
      copy.set(input);
      chunks.push(copy);
    };

    source.connect(recorder);
    recorder.connect(ctx.destination);

    return new Promise(resolve => {
      setTimeout(() => {
        recording = false;

        recorder.disconnect();
        source.disconnect();
        stream.getTracks().forEach(t => t.stop());

        let totalLength = 0;
        for (const c of chunks) totalLength += c.length;

        const result = new Float32Array(totalLength);
        let offset = 0;
        for (const c of chunks) {
          result.set(c, offset);
          offset += c.length;
        }

        resolve(result);
      }, durationMs);
    });
  }

  window.ULTRA_AUDIO = {
    ensureAudioContext,
    transmitBits,
    stopTransmission,
    startMic,
    stopMic,
    startListening,
    stopListeningLoop,
    sampleUltrasonicEnergy,
    recordBuffer
  };

})();
