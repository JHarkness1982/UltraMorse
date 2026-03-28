/* ============================================================
   ULTRAMORSE — encoder.js
   Converte testo → bitstream → pronto per audio.js
   ============================================================ */

(function () {

  /* ------------------------------------------------------------
     1. Testo → payload logico (con separatori simbolici)
     ------------------------------------------------------------ */

  function textToLogicalBits(text) {
    const norm = ULTRA.normalizeText(text);
    if (!norm) return "";

    const words = norm.split(" ");
    let logical = "";

    words.forEach((word, wIndex) => {
      const chars = word.split("");

      chars.forEach((ch, cIndex) => {
        const morse = ULTRA.MORSE_MAP[ch];
        if (!morse) return; // carattere non supportato → ignorato

        const bin = ULTRA.morseToBinary(morse);
        if (!bin) return; // protezione extra

        // Aggiungi i bit della lettera
        logical += bin;

        // Separatore lettere (marker logico)
        if (cIndex < chars.length - 1) {
          logical += "|L|";
        }
      });

      // Separatore parole (marker logico)
      if (wIndex < words.length - 1) {
        logical += "|W|";
      }
    });

    return logical;
  }

  /* ------------------------------------------------------------
     2. Logical bits → payload binario (solo 0/1)
        (usato per checksum)
     ------------------------------------------------------------ */

  function logicalToPayloadBits(logical) {
    return logical.replace(/\|L\||\|W\|/g, "");
  }

  /* ------------------------------------------------------------
     3. Costruzione messaggio completo
        START + payload + END + checksum
     ------------------------------------------------------------ */

  function buildMessageBits(text) {
    const logical = textToLogicalBits(text);
    if (!logical) return "";

    const payloadBits = logicalToPayloadBits(logical);
    const checksum = ULTRA.computeChecksumBits(payloadBits);

    const full =
      ULTRA.START_BITS +
      payloadBits +
      ULTRA.END_BITS +
      checksum;

    return full;
  }

  /* ------------------------------------------------------------
     4. Esportazione
     ------------------------------------------------------------ */

  window.ULTRA_ENCODER = {
    textToLogicalBits,
    logicalToPayloadBits,
    buildMessageBits
  };

})();
