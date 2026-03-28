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
    setStatus("Modalità OUT selezionata.");
  };

  modeInBtn.onclick = () => {
    mode = "IN";
    toggleActive(modeInBtn, modeOutBtn);
    textLabel.textContent = "Decoder (Live)";
    textArea.disabled = true;
    btnAction.style.display = "none";
    btnListen.style.display = "block";
    setStatus("Modalità IN selezionata.");
  };

  /* ------------------------------------------------------------
     MODALITÀ LIVE / FILE (per ora solo LIVE)
     ------------------------------------------------------------ */

  liveModeBtn.onclick = () => {
    inputMode = "LIVE";
    toggleActive(liveModeBtn, fileModeBtn);
    setStatus("Modalità Live attiva.");
  };

  fileModeBtn.onclick = () => {
    inputMode = "FILE";
    toggleActive(fileModeBtn, liveModeBtn);
    setStatus("Modalità File non ancora implementata.");
  };

  /* ------------------------------------------------------------
     TRASMISSIONE (OUT)
     ------------------------------------------------------------ */

  btnAction.onclick = async () => {
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
     ASCOLTO (IN)
     ------------------------------------------------------------ */

  btnListen.onclick = async () => {
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
     INIZIALIZZAZIONE
     ------------------------------------------------------------ */

  // Modalità iniziale: OUT + LIVE
  btnListen.style.display = "none";
  setStatus("Pronto.");

})();
