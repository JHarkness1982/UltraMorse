/* ============================================================
   ULTRAMORSE — decoder.js
   Decoder avanzato: energia → bit → messaggio
   ============================================================ */

(function () {

  /* ============================================================
     STATO INTERNO DEL DECODER
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
    // Rumore di fondo lento
    noiseFloor = noiseFloor * 0.98 + energy * 0.02;

    // Soglia = rumore + offset
    threshold = noiseFloor + 12; // offset empirico
  }

  /* ============================================================
     ENERGIA → BIT (con smoothing)
     ============================================================ */

  let lastBit = "0";
  let stability = 0;

  function energyToBit(energy) {
    const rawBit = energy > threshold ? "1" : "0";

    // Smoothing: richiede 2 UT stabili per cambiare bit
    if (rawBit === lastBit) {
      stability++;
    } else {
      stability = 0;
    }

    if (stability >= 1) {
      lastBit = rawBit;
    }

    return lastBit;
  }

  /* ============================================================
     RICONOSCIMENTO START / END
     ============================================================ */

  function detectStart(buffer) {
    return buffer.includes(ULTRA.START_BITS);
  }

  function detectEnd(buffer) {
    return buffer.includes(ULTRA.END_BITS);
  }

  /* ============================================================
     DECODIFICA PAYLOAD
     ============================================================ */

  function decodePayload(payloadBits) {
    // Rimuovi eventuali spazi o caratteri strani
    payloadBits = payloadBits.replace(/[^01]/g, "");

    // Rimuovi checksum
    const checksumBits = payloadBits.slice(-ULTRA.CHECKSUM_BITS);
    const dataBits = payloadBits.slice(0, -ULTRA.CHECKSUM_BITS);

    // Verifica checksum
    const expected = ULTRA.computeChecksumBits(dataBits);
    if (expected !== checksumBits) {
      return "[Checksum errato]";
    }

    // Ora dobbiamo ricostruire le lettere.
    // Ogni lettera è una sequenza di bit Morse (0/1) senza separatori.
    // Ma nel protocollo attuale NON abbiamo ancora i separatori temporali.
    // Per ora, assumiamo che ogni lettera sia separata da "000" (3 UT).
    // Questo è un placeholder finché non implementiamo la ricostruzione UT completa.

    const letters = dataBits.split("000"); // separatore lettere (provvisorio)
    let result = "";

    for (const letterBits of letters) {
      if (!letterBits) continue;

      const char = ULTRA.BINARY_TO_CHAR[letterBits];
      result += char || "?";
    }

    return result;
  }

  /* ============================================================
     LOOP PRINCIPALE DI DECODIFICA
     ============================================================ */

  function processEnergy(energy) {
    if (!isDecoding) return;

    updateEnergyUI(energy);
    updateDynamicThreshold(energy);

    const bit = energyToBit(energy);

    bitBuffer += bit;
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
        // Aspetta la fine dello START
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

        // Rimuovi END
        const endIndex = collectedBits.indexOf(ULTRA.END_BITS);
        const payload = collectedBits.slice(0, endIndex);

        const msg = decodePayload(payload);
        setLastMessage(msg);

        // Reset
        state = "IDLE";
        collectedBits = "";
        bitBuffer = "";
        break;
    }
  }

  /* ============================================================
     CONTROLLO DECODER
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
     ESPORTAZIONE
     ============================================================ */

  window.ULTRA_DECODER = {
    startDecoder,
    stopDecoder,
    processEnergy
  };

})();
