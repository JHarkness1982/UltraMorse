/* ============================================================
   ULTRAMORSE — utils.js
   Funzioni condivise tra encoder e decoder
   ============================================================ */

/* ------------------------------------------------------------
   COSTANTI DEL PROTOCOLLO
   ------------------------------------------------------------ */

const FREQ = 400;              // frequenza portante
const UT   = 0.120;            // durata di un bit (120 ms)
const START_BITS = "";    // header di sincronizzazione
const END_BITS   = "";        // stop bit singolo
const CHECKSUM_BITS = 4;       // 4 bit finali di checksum

/* ------------------------------------------------------------
   MAPPA MORSE (Ultramorse v1)
   ------------------------------------------------------------ */

const MORSE_MAP = {
  // Lettere
  "A": ".-",
  "B": "-...",
  "C": "-.-.",
  "D": "-..",
  "E": ".",
  "F": "..-.",
  "G": "--.",
  "H": "....",
  "I": "..",
  "J": ".---",
  "K": "-.-",
  "L": ".-..",
  "M": "--",
  "N": "-.",
  "O": "---",
  "P": ".--.",
  "Q": "--.-",
  "R": ".-.",
  "S": "...",
  "T": "-",
  "U": "..-",
  "V": "...-",
  "W": ".--",
  "X": "-..-",
  "Y": "-.--",
  "Z": "--..",

  // Numeri
  "0": "-----",
  "1": ".----",
  "2": "..---",
  "3": "...--",
  "4": "....-",
  "5": ".....",
  "6": "-....",
  "7": "--...",
  "8": "---..",
  "9": "----.",

  // Simboli utili del progetto
  ".": ".-.-.-",
  ",": "--..--",
  "?": "..--..",
  "!": "-.-.--",
  "/": "-..-.",
  "-": "-....-",
  "+": ".-.-.",
  "X": "-..-",      // moltiplicazione
  ":": "---...",
  "'": ".----."
};

/* ------------------------------------------------------------
   REVERSE MAP: binario → carattere
   ------------------------------------------------------------ */

const BINARY_TO_CHAR = {};

for (const [char, morse] of Object.entries(MORSE_MAP)) {
  const bin = morse.replace(/\./g, "0").replace(/-/g, "1");
  BINARY_TO_CHAR[bin] = char;
}

/* ------------------------------------------------------------
   NORMALIZZAZIONE TESTO
   ------------------------------------------------------------ */

function normalizeText(input) {
  if (!input) return "";

  let s = input.normalize("NFC");

  // Accenti → vocale + apostrofo
  const accentMap = {
    "à": "a'",
    "è": "e'",
    "é": "e'",
    "ì": "i'",
    "ò": "o'",
    "ó": "o'",
    "ù": "u'"
  };

  s = s.replace(/[àèéìòóù]/gi, m => {
    const lower = m.toLowerCase();
    let rep = accentMap[lower] || m;
    if (m === m.toUpperCase()) rep = rep.toUpperCase();
    return rep;
  });

  // Tutto maiuscolo
  s = s.toUpperCase();

  // Rimuovi caratteri non supportati (tranne spazio)
  const allowed = /^[A-Z0-9\.\,\?\!\/\-\+\:X' ]$/;
  let out = "";
  for (const ch of s) {
    if (allowed.test(ch)) out += ch;
  }

  // Comprimi spazi multipli
  out = out.replace(/\s+/g, " ").trim();

  return out;
}

/* ------------------------------------------------------------
   MORSE → BINARIO
   ------------------------------------------------------------ */

function morseToBinary(morse) {
  return morse.replace(/\./g, "0").replace(/-/g, "1");
}

/* ------------------------------------------------------------
   BINARIO → MORSE
   ------------------------------------------------------------ */

function binaryToMorse(bin) {
  return bin.replace(/0/g, ".").replace(/1/g, "-");
}

/* ------------------------------------------------------------
   CHECKSUM (somma bit payload mod 16)
   ------------------------------------------------------------ */

function computeChecksumBits(payloadBits) {
  let sum = 0;
  for (const b of payloadBits) {
    if (b === "1") sum++;
  }
  const mod = sum % 16;
  let bin = mod.toString(2);
  while (bin.length < CHECKSUM_BITS) bin = "0" + bin;
  return bin;
}

/* ------------------------------------------------------------
   DECODIFICA BITSTREAM → TESTO (coerente con decoder.js)
   ------------------------------------------------------------ */

function decodeBitsToMessage(payloadBits) {
  // Sanity: tieni solo 0/1
  payloadBits = payloadBits.replace(/[^01]/g, "");

  // Stessa logica del decoder: split su "000" e mappa via BINARY_TO_CHAR
  const letters = payloadBits.split("000");
  let result = "";

  for (const letterBits of letters) {
    if (!letterBits) continue;
    const ch = BINARY_TO_CHAR[letterBits];
    result += ch || "?";
  }

  return result;
}

/* ------------------------------------------------------------
   UTILS VARI
   ------------------------------------------------------------ */

function isBinaryString(s) {
  return /^[01]+$/.test(s);
}

function limitString(str, max) {
  if (str.length <= max) return str;
  return "…" + str.slice(-max);
}

function sleep(ms) {
  return new Promise(res => setTimeout(res, ms));
}

/* ------------------------------------------------------------
   ESPORTAZIONE
   ------------------------------------------------------------ */

window.ULTRA = {
  UT,
  FREQ,
  START_BITS,
  END_BITS,
  CHECKSUM_BITS,
  MORSE_MAP,
  BINARY_TO_CHAR,
  normalizeText,
  morseToBinary,
  binaryToMorse,
  computeChecksumBits,
  decodeBitsToMessage,
  isBinaryString,
  limitString,
  sleep
};
