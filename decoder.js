/* ============================================================
   ULTRAMORSE — decoder.js
   Decoder avanzato: energia → bit → messaggio (live)
   + decodeFromBuffer(buffer, sampleRate) per RX bufferizzato
   ============================================================ */

(function () {

  /* ============================================================
     STATO INTERNO DEL DECODER (LIVE)
     ============================================================ */

  let isDecoding = false;

  // Soglia dinamica
  let noiseFloor = 0;
  let threshold = 0;

  // Buffer bit (ultimi N)
  let bitBuffer = "";

  // Stato macchina
  let state = "IDLE"; // IDLE → SYNC → READING → ENDING

  // Payload raccolto
  let collectedBits = "";

  // UI elements
  const energyBar = document.getElementById("energyBar");
  const bitStreamView = document.getElementById("bitStreamView");
  const decoderStateEl = document.getElementById("decoderState");
  const lastMessageEl = document.getElementById("lastMessage");

  /* ============================================================
     AGGIORNAMENTO UI
     ============================================================ */

  function updateEnergyUI(energy) {
    const pct = Math.min(100, (energy / 255) * 100);
    energyBar.style.width = pct + "%";
  }

  function updateBitstreamUI(bits) {
    bitStreamView.textContent = ULTRA.limitString(bits, 120);
  }

  function updateStateUI(s) {
    decoderStateEl.textContent = s;
  }

  function setLastMessage(msg) {
    lastMessageEl.textContent = msg || "—";
  }

  /* ============================================================
     SOGLIA DINAMICA
     ============================================================ */

  function updateDynamicThreshold(energy) {
    noiseFloor = noiseFloor * 0.85 + energy * 0.15;
    threshold = noiseFloor + 10;
  }

  /* ============================================================
     ENERGIA → BIT
     ============================================================ */

  function energyToBit(energy) {
    return energy > threshold ? "1" : "0";
  }

  /* ============================================================
     RICONOSCIMENTO START / END (LIVE, SOLO EURISTICO)
     ============================================================ */

  function detectStart(buffer) {
    // euristica: burst di 1 → inizio messaggio
    return buffer.includes("1111");
  }

  function detectEnd(buffer) {
    // euristica: run di 0 → fine messaggio
    return buffer.includes("0000");
  }

  /* ============================================================
     DECODIFICA PAYLOAD (LIVE)
     ============================================================ */

  function decodePayload(payloadBits) {
    payloadBits = payloadBits.replace(/[^01]/g, "");

    if (payloadBits.length <= ULTRA.CHECKSUM_BITS) {
      return "[Payload troppo corto]";
    }

    const checksumBits = payloadBits.slice(-ULTRA.CHECKSUM_BITS);
    const dataBits = payloadBits.slice(0, -ULTRA.CHECKSUM_BITS);

    const expected = ULTRA.computeChecksumBits(dataBits);
    if (expected !== checksumBits) {
      return "[Checksum errato]";
    }

    return ULTRA.decodeBitsToMessage(dataBits);
  }

  /* ============================================================
     LOOP PRINCIPALE DI DECODIFICA LIVE
     ============================================================ */

  function processEnergy(energy) {
    if (!isDecoding) return;

    updateEnergyUI(energy);
    updateDynamicThreshold(energy);

    const bit = energyToBit(energy);

    bitBuffer += bit;
    if (bitBuffer.length > 2000) {
      bitBuffer = bitBuffer.slice(-2000);
    }
    updateBitstreamUI(bitBuffer);

    switch (state) {

      case "IDLE":
        updateStateUI("Idle");
        if (detectStart(bitBuffer)) {
          state = "SYNC";
          collectedBits = "";
          bitBuffer = "";
        }
        break;

      case "SYNC":
        updateStateUI("Sync");
        if (!bitBuffer.endsWith("1")) {
          state = "READING";
          bitBuffer = "";
        }
        break;

      case "READING":
        updateStateUI("Reading");
        collectedBits += bit;

        if (detectEnd(collectedBits)) {
          state = "ENDING";
        }
        break;

      case "ENDING":
        updateStateUI("Ending");

        const endIndex = collectedBits.indexOf("0000");
        const payload = endIndex >= 0
          ? collectedBits.slice(0, endIndex)
          : collectedBits;

        const msg = decodePayload(payload);
        setLastMessage(msg);

        state = "IDLE";
        collectedBits = "";
        bitBuffer = "";
        break;
    }
  }

  /* ============================================================
     CONTROLLO DECODER LIVE
     ============================================================ */

  function startDecoder() {
    isDecoding = true;
    state = "IDLE";
    bitBuffer = "";
    collectedBits = "";
    setLastMessage("—");
  }

  function stopDecoder() {
    isDecoding = false;
    state = "IDLE";
  }

  /* ============================================================
     RX BUFFERIZZATO: decodeFromBuffer(buffer, sampleRate)
     (senza START/END, solo payload + checksum)
     ============================================================ */

  function goertzelEnergy(samples, sampleRate, freq) {
    const N = samples.length;
    if (N === 0) return 0;

    const k = Math.round(0.5 + (N * freq) / sampleRate);
    const w = 2 * Math.PI * k / N;
    const cosw = Math.cos(w);
    const sinw = Math.sin(w);
    const coeff = 2 * cosw;

    let q0 = 0, q1 = 0, q2 = 0;

    for (let i = 0; i < N; i++) {
      q0 = coeff * q1 - q2 + samples[i];
      q2 = q1;
      q1 = q0;
    }

    const real = q1 - q2 * cosw;
    const imag = q2 * sinw;
    return real * real + imag * imag;
  }

  function decodeFromBuffer(buffer, sampleRate) {
    const ut   = ULTRA.UT;    // es. 0.120
    const freq = ULTRA.FREQ;  // 400 Hz

    const samplesPerBit = Math.floor(ut * sampleRate);
    if (samplesPerBit <= 0) {
      return { bits: "", payloadBits: "" };
    }

    const totalBits = Math.floor(buffer.length / samplesPerBit);
    if (totalBits <= 0) {
      return { bits: "", payloadBits: "" };
    }

    const energies = new Array(totalBits);
    let minE = Infinity;
    let maxE = -Infinity;

    for (let b = 0; b < totalBits; b++) {
      const start = b * samplesPerBit;
      const end = start + samplesPerBit;
      const slice = buffer.subarray(start, end);
      const e = goertzelEnergy(slice, sampleRate, freq);
      energies[b] = e;
      if (e < minE) minE = e;
      if (e > maxE) maxE = e;
    }

    const threshold = minE + (maxE - minE) * 0.5;

    let bits = "";
    for (let b = 0; b < totalBits; b++) {
      bits += energies[b] > threshold ? "1" : "0";
    }

    // Trim silenzio iniziale/finale
    let trimmed = bits.replace(/^0+/, "").replace(/0+$/, "");

    if (trimmed.length <= ULTRA.CHECKSUM_BITS) {
      return { bits, payloadBits: "" };
    }

    const checksumBits = trimmed.slice(-ULTRA.CHECKSUM_BITS);
    const dataBits = trimmed.slice(0, -ULTRA.CHECKSUM_BITS);

    const expected = ULTRA.computeChecksumBits(dataBits);
    if (expected !== checksumBits) {
      // checksum errato: restituiamo comunque i bit per debug
      return { bits, payloadBits: "" };
    }

    return {
      bits,
      payloadBits: dataBits
    };
  }

  /* ============================================================
     ESPORTAZIONE
     ============================================================ */

  window.ULTRA_DECODER = {
    startDecoder,
    stopDecoder,
    processEnergy,
    decodeFromBuffer
  };

})();
