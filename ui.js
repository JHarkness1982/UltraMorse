/* ============================================================
   ULTRAMORSE — ui.js
   Gestione interfaccia, pulsanti, modalità IN/OUT
   ============================================================ */

(function () {

  /* ------------------------------------------------------------
     ELEMENTI UI
     ------------------------------------------------------------ */

  const modeOutBtn = document.getElementById("modeOut");
  const modeInBtn  = document.getElementById("modeIn");

  const liveModeBtn = document.getElementById("liveMode");
  const fileModeBtn = document.getElementById("fileMode");

  const textArea = document.getElementById("textArea");
  const textLabel = document.getElementById("textLabel");

  const btnAction = document.getElementById("btnAction");
  const btnListen = document.getElementById("btnListen");

  const statusEl = document.getElementById("status");

  // Input file invisibile
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "audio/*";

  /* ------------------------------------------------------------
     STATO APP
     ------------------------------------------------------------ */

  let mode = "OUT";   // OUT / IN
  let inputMode = "LIVE"; // LIVE / FILE

  let isTransmitting = false;
  let isListening = false;

  /* ------------------------------------------------------------
     UTILS UI
     ------------------------------------------------------------ */

  function setStatus(msg, isError = false) {
    statusEl.textContent = msg;
    statusEl.classList.toggle("error", isError);
  }

  function toggleActive(btnA, btnB) {
    btnA.classList.add("active");
    btnB.classList.remove("active");
  }

  /* ------------------------------------------------------------
     MODALITÀ OUT / IN
     ------------------------------------------------------------ */

  modeOutBtn.onclick = () => {
    mode = "OUT";
    toggleActive(modeOutBtn, modeInBtn);
    textLabel.textContent = "Testo da trasmettere";
    textArea.disabled = false;

    btnAction.style.display = "block";
    btnListen.style.display = "none";

    // Aggiorna testo pulsante in base alla modalità
    btnAction.textContent = (inputMode === "FILE") ? "Salva file" : "Trasmetti (Live)";

    setStatus("Modalità OUT selezionata.");
  };

  modeInBtn.onclick = () => {
    mode = "IN";
    toggleActive(modeInBtn, modeOutBtn);
    textLabel.textContent = "Decoder (Live / File)";
    textArea.disabled = true;

    btnAction.style.display = "none";
    btnListen.style.display = "block";

    btnListen.textContent = (inputMode === "FILE") ? "Decodifica da file" : "Ascolta (Live)";

    setStatus("Modalità IN selezionata.");
  };

  /* ------------------------------------------------------------
     MODALITÀ LIVE / FILE
     ------------------------------------------------------------ */

  liveModeBtn.onclick = () => {
    inputMode = "LIVE";
    toggleActive(liveModeBtn, fileModeBtn);

    if (mode === "OUT") {
      btnAction.textContent = "Trasmetti (Live)";
    } else {
      btnListen.textContent = "Ascolta (Live)";
    }

    setStatus("Modalità Live attiva.");
  };

  fileModeBtn.onclick = () => {
    inputMode = "FILE";
    toggleActive(fileModeBtn, liveModeBtn);

    if (mode === "OUT") {
      btnAction.textContent = "Salva file";
    } else {
      btnListen.textContent = "Decodifica da file";
    }

    setStatus("Modalità File attiva.");
  };

  /* ------------------------------------------------------------
     TRASMISSIONE (OUT)
     ------------------------------------------------------------ */

  btnAction.onclick = async () => {

    /* ---------- FILE MODE: SALVA WAV ---------- */
    if (mode === "OUT" && inputMode === "FILE") {
      const text = textArea.value.trim();
      if (!text) {
        setStatus("Inserisci un testo da salvare.", true);
        return;
      }

      const bits = ULTRA_ENCODER.buildMessageBits(text);
      if (!bits) {
        setStatus("Errore nella codifica del messaggio.", true);
        return;
      }

      const blob = await ULTRA_AUDIO.renderWav(bits);
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = "ultramorse.wav";
      a.click();

      setStatus("File WAV salvato.");
      return;
    }

    /* ---------- LIVE MODE: TRASMISSIONE ---------- */

    if (isTransmitting) {
      ULTRA_AUDIO.stopTransmission();
      isTransmitting = false;
      btnAction.textContent = "Trasmetti (Live)";
      setStatus("Trasmissione interrotta.");
      return;
    }

    const text = textArea.value.trim();
    if (!text) {
      setStatus("Inserisci un testo da trasmettere.", true);
      return;
    }

    const bits = ULTRA_ENCODER.buildMessageBits(text);
    if (!bits) {
      setStatus("Errore nella codifica del messaggio.", true);
      return;
    }

    await ULTRA_AUDIO.ensureAudioContext();

    isTransmitting = true;
    btnAction.textContent = "Interrompi";

    setStatus("Trasmissione in corso…");

    const duration = await ULTRA_AUDIO.transmitBits(bits);

    isTransmitting = false;
    btnAction.textContent = "Trasmetti (Live)";
    setStatus(`Trasmissione completata (${Math.round(duration)} ms).`);
  };

  /* ------------------------------------------------------------
     ASCOLTO LIVE (IN)
     ------------------------------------------------------------ */

  btnListen.onclick = async () => {

    /* ---------- FILE MODE: DECODIFICA ---------- */
    if (inputMode === "FILE") {
      fileInput.click();
      return;
    }

    /* ---------- LIVE MODE ---------- */
    if (isListening) {
      stopListening();
      return;
    }

    try {
      await ULTRA_AUDIO.startMic();
    } catch (err) {
      setStatus("Accesso al microfono negato.", true);
      return;
    }

    ULTRA_DECODER.startDecoder();

    ULTRA_AUDIO.startListening(energy => {
      ULTRA_DECODER.processEnergy(energy);
    });

    isListening = true;
    btnListen.textContent = "Ferma ascolto";
    setStatus("Ascolto attivo.");
  };

  function stopListening() {
    isListening = false;
    ULTRA_AUDIO.stopListeningLoop();
    ULTRA_AUDIO.stopMic();
    ULTRA_DECODER.stopDecoder();
    btnListen.textContent = "Ascolta (Live)";
    setStatus("Ascolto fermato.");
  }

  /* ------------------------------------------------------------
     FILE MODE — DECODIFICA BUFFERIZZATA
     ------------------------------------------------------------ */

  fileInput.onchange = async () => {
    const file = fileInput.files[0];
    if (!file) return;

    setStatus("Caricamento file…");

    const arrayBuffer = await file.arrayBuffer();
    const ctx = await ULTRA_AUDIO.ensureAudioContext();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

    const samples = audioBuffer.getChannelData(0);

    setStatus("Decodifica in corso…");

    const { bits, payloadBits } = ULTRA_DECODER.decodeFromBuffer(samples, ctx.sampleRate);

    if (!payloadBits) {
      setStatus("Nessun header trovato nel file.", true);
      return;
    }

    // Decodifica Morse (se presente)
    const message = ULTRA.decodeBitsToMessage
      ? ULTRA.decodeBitsToMessage(payloadBits)
      : payloadBits;

    textArea.value = message;
    setStatus("Decodifica completata.");
  };

  /* ------------------------------------------------------------
     INIZIALIZZAZIONE
     ------------------------------------------------------------ */

  btnListen.style.display = "none";
  setStatus("Pronto.");

})();
