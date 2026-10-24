// Matrices exactas (entradas Q) y operaciones básicas.

import {
  Q, Q0, Q1, qadd, qsub, qmul, qneg, qconj, qisZero, qeq, qisReal, parseScalar,
  qtoLatex, qtoString, FormatOptions, DEFAULT_FMT,
} from './scalar';

export type Matrix = Q[][];

export const rows = (A: Matrix) => A.length;
export const cols = (A: Matrix) => (A.length ? A[0].length : 0);
export const isSquare = (A: Matrix) => rows(A) === cols(A);

export function zeros(m: number, n: number): Matrix {
  return Array.from({ length: m }, () => Array.from({ length: n }, () => Q0));
}

export function identity(n: number): Matrix {
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? Q1 : Q0)));
}

export const clone = (A: Matrix): Matrix => A.map((r) => r.slice());

export function assertSquare(A: Matrix, what: string) {
  if (!isSquare(A)) throw new Error(`${what} solo está definida para matrices cuadradas (recibí ${rows(A)}×${cols(A)}).`);
}

function assertSameShape(A: Matrix, B: Matrix, what: string) {
  if (rows(A) !== rows(B) || cols(A) !== cols(B)) {
    throw new Error(`${what}: las dimensiones no coinciden (${rows(A)}×${cols(A)} y ${rows(B)}×${cols(B)}).`);
  }
}

export function add(A: Matrix, B: Matrix): Matrix {
  assertSameShape(A, B, 'Suma');
  return A.map((r, i) => r.map((x, j) => qadd(x, B[i][j])));
}

export function sub(A: Matrix, B: Matrix): Matrix {
  assertSameShape(A, B, 'Resta');
  return A.map((r, i) => r.map((x, j) => qsub(x, B[i][j])));
}

export const scale = (A: Matrix, k: Q): Matrix => A.map((r) => r.map((x) => qmul(k, x)));
export const neg = (A: Matrix): Matrix => A.map((r) => r.map(qneg));

export function mul(A: Matrix, B: Matrix): Matrix {
  if (cols(A) !== rows(B)) {
    throw new Error(`Multiplicación: ${rows(A)}×${cols(A)} por ${rows(B)}×${cols(B)} no es compatible (columnas de A ≠ filas de B).`);
  }
  const m = rows(A), n = cols(B), p = cols(A);
  const C = zeros(m, n);
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      let s = Q0;
      for (let k = 0; k < p; k++) if (!qisZero(A[i][k]) && !qisZero(B[k][j])) s = qadd(s, qmul(A[i][k], B[k][j]));
      C[i][j] = s;
    }
  }
  return C;
}

export function power(A: Matrix, k: number): Matrix {
  assertSquare(A, 'La potencia');
  if (!Number.isInteger(k) || k < 0) throw new Error('La potencia debe ser un entero ≥ 0 (para negativas usa la inversa).');
  let R = identity(rows(A));
  let B = A;
  while (k > 0) {
    if (k & 1) R = mul(R, B);
    B = mul(B, B);
    k >>= 1;
  }
  return R;
}

export function transpose(A: Matrix): Matrix {
  return Array.from({ length: cols(A) }, (_, j) => Array.from({ length: rows(A) }, (_, i) => A[i][j]));
}

/** Transpuesta conjugada (Hermitiana), Aᴴ. */
export const conjTranspose = (A: Matrix): Matrix => transpose(A).map((r) => r.map(qconj));

export function trace(A: Matrix): Q {
  assertSquare(A, 'La traza');
  return A.reduce((s, r, i) => qadd(s, r[i]), Q0);
}

export function hstack(A: Matrix, B: Matrix): Matrix {
  if (rows(A) !== rows(B)) throw new Error('No se pueden unir matrices con distinto número de filas.');
  return A.map((r, i) => [...r, ...B[i]]);
}

export const equals = (A: Matrix, B: Matrix) =>
  rows(A) === rows(B) && cols(A) === cols(B) && A.every((r, i) => r.every((x, j) => qeq(x, B[i][j])));

export const isReal = (A: Matrix) => A.every((r) => r.every(qisReal));

export function isSymmetric(A: Matrix) {
  return isSquare(A) && equals(A, transpose(A));
}

export function isHermitian(A: Matrix) {
  return isSquare(A) && equals(A, conjTranspose(A));
}

// ── Entrada / salida ────────────────────────────────────────────────

export function parseMatrix(cells: string[][]): Matrix {
  return cells.map((r, i) =>
    r.map((s, j) => {
      try {
        return parseScalar(s);
      } catch (e) {
        throw new Error(`Fila ${i + 1}, columna ${j + 1}: ${(e as Error).message}`);
      }
    }),
  );
}

/**
 * Lee una matriz pegada como texto: filas por salto de línea o ';',
 * columnas por tabulador, espacios o '&' (LaTeX). Acepta corchetes estilo [[1,2],[3,4]].
 */
export function parseMatrixText(text: string): string[][] {
  let t = text.trim();
  t = t.replace(/\\begin\{[a-z]*matrix\}|\\end\{[a-z]*matrix\}/g, '').replace(/\\left|\\right/g, '');
  if (/^\[\s*\[/.test(t)) {
    // Formato tipo JSON / Python / MATLAB anidado
    const inner = t.replace(/^\[|\]$/g, '');
    return inner
      .split(/\]\s*,?\s*\[/)
      .map((r) => r.replace(/[[\]]/g, '').split(',').map((s) => s.trim()))
      .filter((r) => r.some((s) => s !== ''));
  }
  t = t.replace(/^\[|\]$/g, '');
  const rowsTxt = t.split(/\\\\|;|\n/).map((r) => r.trim()).filter(Boolean);
  return rowsTxt.map((r) => {
    if (r.includes('&')) return r.split('&').map((s) => s.trim());
    if (r.includes('\t')) return r.split('\t').map((s) => s.trim());
    // Espacios separan columnas, salvo en "2 + 3i" (operador con espacio a ambos lados).
    // "1 -2" son dos columnas; "1 - 2" es una sola expresión.
    const joined = r.replace(/\s+([+\-*/^])\s+/g, '$1').replace(/\s*([*/^])\s*/g, '$1');
    return joined.split(/[\s,]+/).filter(Boolean);
  });
}

export function toLatex(A: Matrix, o: FormatOptions = DEFAULT_FMT, env = 'bmatrix'): string {
  const body = A.map((r) => r.map((x) => qtoLatex(x, o)).join(' & ')).join(' \\\\ ');
  return `\\begin{${env}} ${body} \\end{${env}}`;
}

/** Matriz aumentada [A | B] con línea vertical. */
export function augmentedLatex(M: Matrix, split: number, o: FormatOptions = DEFAULT_FMT): string {
  const n = cols(M);
  const spec = 'c'.repeat(split) + '|' + 'c'.repeat(n - split);
  const body = M.map((r) => r.map((x) => qtoLatex(x, o)).join(' & ')).join(' \\\\ ');
  return `\\left[\\begin{array}{${spec}} ${body} \\end{array}\\right]`;
}

export function toPlainText(A: Matrix, o: FormatOptions = DEFAULT_FMT): string {
  const cells = A.map((r) => r.map((x) => qtoString(x, o)));
  const w = cells[0]?.map((_, j) => Math.max(...cells.map((r) => r[j].length))) ?? [];
  return cells.map((r) => '[ ' + r.map((s, j) => s.padStart(w[j])).join('  ') + ' ]').join('\n');
}
