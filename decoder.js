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
    noiseFloor = noiseFloor * 0.85 + energy * 0.15;
    threshold = noiseFloor + 10;
  }

  /* ============================================================
     ENERGIA → BIT (smoothing disattivato)
     ============================================================ */

  function energyToBit(energy) {
    return energy > threshold ? "1" : "0";
  }

  /* ============================================================
     RICONOSCIMENTO START / END
     ============================================================ */

  function detectStart(buffer) {
    return buffer.includes("1111"); // 4 bit di 1 → più reattivo
  }

  function detectEnd(buffer) {
    return buffer.includes("0000"); // 4 bit di 0 → più permissivo
  }

  /* ============================================================
     DECODIFICA PAYLOAD
     ============================================================ */

  function decodePayload(payloadBits) {
    payloadBits = payloadBits.replace(/[^01]/g, "");

    const checksumBits = payloadBits.slice(-ULTRA.CHECKSUM_BITS);
    const dataBits = payloadBits.slice(0, -ULTRA.CHECKSUM_BITS);

    const expected = ULTRA.computeChecksumBits(dataBits);
    if (expected !== checksumBits) {
      return "[Checksum errato]";
    }

    // Placeholder finché non implementiamo la ricostruzione UT
    const letters = dataBits.split("000");
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

        const endIndex = collectedBits.indexOf("0000"); // FIX
        const payload = collectedBits.slice(0, endIndex);

        const msg = decodePayload(payload);
        setLastMessage(msg);

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
