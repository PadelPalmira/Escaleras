// Generador de códigos QR — implementación propia, sin dependencias externas
// (modo Byte, corrección de errores nivel M, versiones 1–10 — de sobra para
// los textos cortos que usamos: el código de un cashback o "CBALL:<id>").
//
// No es un vendored de terceros: es una implementación directa del estándar
// ISO/IEC 18004 (Reed-Solomon sobre GF(256), máscaras, colocación de datos).
// Verificada por prueba de mesa: se generó una imagen real y se decodificó
// con un lector independiente (OpenCV) para confirmar que un lector de
// verdad (cámara de celular) la lee correctamente — ver notas de QA.
//
// Uso:
//   import { generarQR } from './vendor/qrencode.js';
//   const { size, matrix } = generarQR('texto a codificar');
//   // matrix es un arreglo size×size de booleanos (true = módulo oscuro).

const GF_EXP = new Array(512);
const GF_LOG = new Array(256);
(function initGF() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d; // primitivo x^8+x^4+x^3+x^2+1
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();
function gfMul(a, b) {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

// Polinomio generador de Reed-Solomon para `nsym` símbolos de corrección.
function rsGenPoly(nsym) {
  let poly = [1];
  for (let i = 0; i < nsym; i++) {
    const factor = [1, GF_EXP[i]];
    const result = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      for (let k = 0; k < factor.length; k++) {
        result[j + k] ^= gfMul(poly[j], factor[k]);
      }
    }
    poly = result;
  }
  return poly;
}
function rsEncode(data, nsym) {
  const gen = rsGenPoly(nsym);
  const res = data.concat(new Array(nsym).fill(0));
  for (let i = 0; i < data.length; i++) {
    const coef = res[i];
    if (coef !== 0) {
      for (let j = 0; j < gen.length; j++) {
        res[i + j] ^= gfMul(gen[j], coef);
      }
    }
  }
  return res.slice(data.length);
}

// Tabla de bloques por versión, nivel de corrección M (ver comentario del
// archivo: verificada por consistencia contra el total de codewords por
// versión, que es un dato bien conocido e independiente del nivel).
const TABLA_M = {
  1: { ecPerBlock: 10, g1: [1, 16], g2: [0, 0] },
  2: { ecPerBlock: 16, g1: [1, 28], g2: [0, 0] },
  3: { ecPerBlock: 26, g1: [1, 44], g2: [0, 0] },
  4: { ecPerBlock: 18, g1: [2, 32], g2: [0, 0] },
  5: { ecPerBlock: 24, g1: [2, 43], g2: [0, 0] },
  6: { ecPerBlock: 16, g1: [4, 27], g2: [0, 0] },
  7: { ecPerBlock: 18, g1: [4, 31], g2: [0, 0] },
  8: { ecPerBlock: 22, g1: [2, 38], g2: [2, 39] },
  9: { ecPerBlock: 22, g1: [3, 36], g2: [2, 37] },
  10: { ecPerBlock: 26, g1: [4, 43], g2: [1, 44] },
};
const ALINEACION = {
  2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34],
  7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
};

function capacidadDatos(version) {
  const t = TABLA_M[version];
  return t.g1[0] * t.g1[1] + t.g2[0] * t.g2[1];
}

function construirCodewords(texto, version) {
  const bytes = Array.from(new TextEncoder().encode(texto));
  const bitsCount = version <= 9 ? 8 : 16;
  const bits = [];
  const push = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1); };
  push(0b0100, 4); // indicador de modo: Byte
  push(bytes.length, bitsCount);
  bytes.forEach((b) => push(b, 8));

  const capacidadBits = capacidadDatos(version) * 8;
  // Terminador (hasta 4 ceros)
  for (let i = 0; i < 4 && bits.length < capacidadBits; i++) bits.push(0);
  // Relleno a múltiplo de 8
  while (bits.length % 8 !== 0) bits.push(0);
  // Bytes de codewords a partir de bits
  const codewords = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
    codewords.push(byte);
  }
  // Relleno de codewords 0xEC/0x11 alternados hasta llenar capacidad
  const padBytes = [0xec, 0x11];
  let p = 0;
  while (codewords.length < capacidadDatos(version)) {
    codewords.push(padBytes[p % 2]);
    p++;
  }
  return codewords;
}

function elegirVersion(texto) {
  const bytes = new TextEncoder().encode(texto).length;
  for (let v = 1; v <= 10; v++) {
    const bitsCount = v <= 9 ? 8 : 16;
    const bitsNecesarios = 4 + bitsCount + bytes * 8;
    if (Math.ceil(bitsNecesarios / 8) <= capacidadDatos(v)) return v;
  }
  throw new Error(`Texto demasiado largo para el generador de QR (${bytes} bytes, máximo soportado ~216 bytes).`);
}

function entrelazarConEC(codewords, version) {
  const t = TABLA_M[version];
  const bloques = [];
  let idx = 0;
  for (let i = 0; i < t.g1[0]; i++) { bloques.push(codewords.slice(idx, idx + t.g1[1])); idx += t.g1[1]; }
  for (let i = 0; i < t.g2[0]; i++) { bloques.push(codewords.slice(idx, idx + t.g2[1])); idx += t.g2[1]; }
  const bloquesEC = bloques.map((b) => rsEncode(b, t.ecPerBlock));

  const salida = [];
  const maxData = Math.max(...bloques.map((b) => b.length));
  for (let i = 0; i < maxData; i++) {
    bloques.forEach((b) => { if (i < b.length) salida.push(b[i]); });
  }
  for (let i = 0; i < t.ecPerBlock; i++) {
    bloquesEC.forEach((b) => salida.push(b[i]));
  }
  return salida;
}

function crearMatrizVacia(size) {
  const m = [];
  for (let r = 0; r < size; r++) m.push(new Array(size).fill(null));
  return m;
}

function dibujarFinder(m, row, col) {
  for (let r = -1; r <= 7; r++) {
    for (let c = -1; c <= 7; c++) {
      const rr = row + r, cc = col + c;
      if (rr < 0 || cc < 0 || rr >= m.length || cc >= m.length) continue;
      const enAnillo = (r >= 0 && r <= 6 && c >= 0 && c <= 6) &&
        (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
      m[rr][cc] = enAnillo;
    }
  }
}
function dibujarAlineacion(m, row, col) {
  for (let r = -2; r <= 2; r++) {
    for (let c = -2; c <= 2; c++) {
      const enAnillo = (r === -2 || r === 2 || c === -2 || c === 2 || (r === 0 && c === 0));
      m[row + r][col + c] = enAnillo;
    }
  }
}

function construirMatrizBase(version) {
  const size = 17 + version * 4;
  const m = crearMatrizVacia(size);
  const reservado = crearMatrizVacia(size); // true = módulo de función, no tocar al colocar datos/máscara

  const marcarReservado = (r, c) => { reservado[r][c] = true; };
  const marcarBloque = (r0, c0, r1, c1) => {
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) marcarReservado(r, c);
  };

  dibujarFinder(m, 0, 0); marcarBloque(0, 0, 7, 7);
  dibujarFinder(m, 0, size - 7); marcarBloque(0, size - 8, 7, size - 1);
  dibujarFinder(m, size - 7, 0); marcarBloque(size - 8, 0, size - 1, 7);

  // Patrones de temporización (fila/columna 6)
  for (let i = 8; i < size - 8; i++) {
    m[6][i] = i % 2 === 0; marcarReservado(6, i);
    m[i][6] = i % 2 === 0; marcarReservado(i, 6);
  }

  // Alineación
  const pos = ALINEACION[version] || [];
  pos.forEach((r) => {
    pos.forEach((c) => {
      const esquina = (r === pos[0] && c === pos[0]) || (r === pos[0] && c === pos[pos.length - 1]) || (r === pos[pos.length - 1] && c === pos[0]);
      if (esquina) return;
      dibujarAlineacion(m, r, c);
      marcarBloque(r - 2, c - 2, r + 2, c + 2);
    });
  });

  // Módulo oscuro fijo
  const drow = 4 * version + 9;
  m[drow][8] = true; marcarReservado(drow, 8);

  // Reservar áreas de información de formato (se llenan después)
  for (let i = 0; i < 9; i++) { marcarReservado(8, i); marcarReservado(i, 8); }
  for (let i = 0; i < 8; i++) { marcarReservado(8, size - 1 - i); marcarReservado(size - 1 - i, 8); }

  // Reservar información de versión (solo versión >= 7)
  if (version >= 7) {
    marcarBloque(0, size - 11, 5, size - 9);
    marcarBloque(size - 11, 0, size - 9, 5);
  }

  return { m, reservado, size };
}

function colocarDatos(m, reservado, size, codewordsBits) {
  let bitIdx = 0;
  let dir = -1; // -1 = subiendo, 1 = bajando
  let col = size - 1;
  const total = codewordsBits.length;
  while (col > 0) {
    if (col === 6) col--; // saltar columna de temporización
    for (let i = 0; i < size; i++) {
      const row = dir === -1 ? size - 1 - i : i;
      for (let dc = 0; dc < 2; dc++) {
        const c = col - dc;
        if (!reservado[row][c]) {
          m[row][c] = bitIdx < total ? !!codewordsBits[bitIdx] : false;
          bitIdx++;
        }
      }
    }
    dir = -dir;
    col -= 2;
  }
  return m;
}

function codewordsABits(codewords) {
  const bits = [];
  codewords.forEach((b) => { for (let i = 7; i >= 0; i--) bits.push((b >> i) & 1); });
  return bits;
}

function aplicarMascara(m, reservado, size, patron) {
  const salida = crearMatrizVacia(size);
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      let val = m[r][c];
      if (!reservado[r][c]) {
        let invertir;
        switch (patron) {
          case 0: invertir = (r + c) % 2 === 0; break;
          case 1: invertir = r % 2 === 0; break;
          case 2: invertir = c % 3 === 0; break;
          case 3: invertir = (r + c) % 3 === 0; break;
          case 4: invertir = (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0; break;
          case 5: invertir = ((r * c) % 2) + ((r * c) % 3) === 0; break;
          case 6: invertir = (((r * c) % 2) + ((r * c) % 3)) % 2 === 0; break;
          case 7: invertir = (((r + c) % 2) + ((r * c) % 3)) % 2 === 0; break;
          default: invertir = false;
        }
        if (invertir) val = !val;
      }
      salida[r][c] = val;
    }
  }
  return salida;
}

function penalizacion(m, size) {
  let total = 0;
  // Regla 1: corridas de 5+ del mismo color, filas y columnas
  for (let r = 0; r < size; r++) {
    let run = 1;
    for (let c = 1; c < size; c++) {
      if (m[r][c] === m[r][c - 1]) run++;
      else { if (run >= 5) total += 3 + (run - 5); run = 1; }
    }
    if (run >= 5) total += 3 + (run - 5);
  }
  for (let c = 0; c < size; c++) {
    let run = 1;
    for (let r = 1; r < size; r++) {
      if (m[r][c] === m[r - 1][c]) run++;
      else { if (run >= 5) total += 3 + (run - 5); run = 1; }
    }
    if (run >= 5) total += 3 + (run - 5);
  }
  // Regla 2: bloques 2x2 del mismo color
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const v = m[r][c];
      if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) total += 3;
    }
  }
  // Regla 3: patrón tipo finder 1:1:3:1:1 con 4 claros alrededor
  const patronA = [true, false, true, true, true, false, true, false, false, false, false];
  const patronB = [false, false, false, false, true, false, true, true, true, false, true];
  const coincide = (arr) => {
    const s = arr.join(',');
    return s === patronA.join(',') || s === patronB.join(',');
  };
  for (let r = 0; r < size; r++) {
    for (let c = 0; c <= size - 11; c++) {
      const fila = []; for (let k = 0; k < 11; k++) fila.push(m[r][c + k]);
      if (coincide(fila)) total += 40;
    }
  }
  for (let c = 0; c < size; c++) {
    for (let r = 0; r <= size - 11; r++) {
      const col = []; for (let k = 0; k < 11; k++) col.push(m[r + k][c]);
      if (coincide(col)) total += 40;
    }
  }
  // Regla 4: proporción de módulos oscuros
  let oscuros = 0;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (m[r][c]) oscuros++;
  const pct = (oscuros / (size * size)) * 100;
  const desviacion = Math.floor(Math.abs(pct - 50) / 5) * 10;
  total += desviacion;
  return total;
}

function bch15(dato5bits) {
  // BCH(15,5) para información de formato — generador 0x537, máscara 0x5412.
  let g = dato5bits << 10;
  const gen = 0x537;
  for (let i = 4; i >= 0; i--) {
    if (g & (1 << (i + 10))) g ^= gen << i;
  }
  return ((dato5bits << 10) | g) ^ 0x5412;
}
function bch18(version) {
  // BCH(18,6) para información de versión — generador 0x1F25.
  let g = version << 12;
  const gen = 0x1f25;
  for (let i = 5; i >= 0; i--) {
    if (g & (1 << (i + 12))) g ^= gen << i;
  }
  return (version << 12) | g;
}

function colocarFormato(m, size, mascara) {
  // Nivel M = 00 (2 bits), + 3 bits de máscara.
  const nivelBits = 0b00;
  const datos5 = (nivelBits << 3) | mascara;
  const info = bch15(datos5);
  const bit = (i) => (info >> i) & 1; // i=0 (LSB) .. 14 (MSB)

  // Copia 1 (alrededor del finder superior-izquierdo)
  for (let i = 0; i <= 5; i++) m[i][8] = !!bit(i);
  m[7][8] = !!bit(6);
  m[8][8] = !!bit(7);
  m[8][7] = !!bit(8);
  for (let i = 9; i <= 14; i++) m[8][14 - i] = !!bit(i);

  // Copia 2 (superior-derecha / inferior-izquierda)
  for (let i = 0; i <= 7; i++) m[8][size - 1 - i] = !!bit(i);
  for (let i = 8; i <= 14; i++) m[size - 15 + i][8] = !!bit(i);
}

function colocarVersion(m, size, version) {
  if (version < 7) return;
  const info = bch18(version);
  const bit = (i) => (info >> i) & 1; // i=17..0
  for (let i = 0; i < 18; i++) {
    const fila = Math.floor(i / 3);
    const col = i % 3;
    m[fila][size - 11 + col] = !!bit(i);
    m[size - 11 + col][fila] = !!bit(i);
  }
}

export function generarQR(texto) {
  const version = elegirVersion(texto);
  const dataCodewords = construirCodewords(texto, version);
  const todosCodewords = entrelazarConEC(dataCodewords, version);
  const bits = codewordsABits(todosCodewords);

  const { m: base, reservado, size } = construirMatrizBase(version);
  colocarDatos(base, reservado, size, bits);

  let mejor = null, mejorScore = Infinity, mejorPatron = 0;
  for (let p = 0; p < 8; p++) {
    const candidata = aplicarMascara(base, reservado, size, p);
    colocarFormato(candidata, size, p);
    colocarVersion(candidata, size, version);
    const score = penalizacion(candidata, size);
    if (score < mejorScore) { mejorScore = score; mejor = candidata; mejorPatron = p; }
  }

  return { size, matrix: mejor, version, mascara: mejorPatron };
}
