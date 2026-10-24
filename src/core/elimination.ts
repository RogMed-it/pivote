// Eliminación exacta con registro de pasos: RREF, determinantes, inversa,
// sistemas lineales (únicos, infinitos o incompatibles), LU, Cramer, adjunta.

import {
  Q, Q0, Q1, qadd, qsub, qmul, qdiv, qneg, qisZero, qisOne, qeq, qisReal,
  qtoLatex, qtoLatexFactor, qtoString, FormatOptions, DEFAULT_FMT,
} from './scalar';
import { fsign } from './rational';
import {
  Matrix, rows, cols, clone, identity, hstack, assertSquare, toLatex, augmentedLatex, mul, transpose, zeros,
} from './matrix';
import { StepLog, Computation, ResultBlock } from './steps';

// ── Utilidades de formato para operaciones de renglón ──────────────

const R = (i: number) => `R_{${i + 1}}`;

function coefLatex(c: Q, o: FormatOptions): string {
  if (qisOne(c)) return '';
  if (qeq(c, qneg(Q1))) return '-';
  return qtoLatexFactor(c, o);
}

/** "R_i + cR_j" mostrando el signo de forma natural. */
function addOpLatex(i: number, c: Q, j: number, o: FormatOptions): string {
  if (qisReal(c) && fsign(c.re) < 0) {
    return `${R(i)} \\leftarrow ${R(i)} - ${coefLatex(qneg(c), o)}${R(j)}`;
  }
  return `${R(i)} \\leftarrow ${R(i)} + ${coefLatex(c, o)}${R(j)}`;
}

function show(M: Matrix, split: number | undefined, o: FormatOptions) {
  return split !== undefined && split < cols(M) ? augmentedLatex(M, split, o) : toLatex(M, o);
}

/** Prefiere un pivote igual a ±1 (menos fracciones, como se hace a mano). */
function choosePivot(M: Matrix, col: number, from: number): number {
  let first = -1;
  for (let r = from; r < rows(M); r++) {
    const v = M[r][col];
    if (qisZero(v)) continue;
    if (first < 0) first = r;
    if (qisReal(v) && v.re.d === 1n && (v.re.n === 1n || v.re.n === -1n)) return r;
  }
  return first;
}

// ── RREF (Gauss-Jordan) ─────────────────────────────────────────────

export interface RrefOptions {
  /** Columna donde termina la parte "A" de una aumentada [A|B] (para dibujar la línea). */
  split?: number;
  /** Solo busca pivotes en las primeras `pivotCols` columnas. */
  pivotCols?: number;
  log?: StepLog;
  fmt?: FormatOptions;
  /** Texto del primer paso (por defecto "Matriz inicial."). */
  intro?: string;
}

export interface RrefResult {
  R: Matrix;
  pivots: number[];
  rank: number;
}

export function rref(M0: Matrix, opt: RrefOptions = {}): RrefResult {
  const o = opt.fmt ?? DEFAULT_FMT;
  const log = opt.log ?? new StepLog(false);
  const M = clone(M0);
  const m = rows(M);
  const limit = opt.pivotCols ?? cols(M);
  const pivots: number[] = [];
  let r = 0;

  log.push({ text: opt.intro ?? 'Matriz inicial.', latex: show(M, opt.split, o) });

  for (let c = 0; c < limit && r < m; c++) {
    const p = choosePivot(M, c, r);
    if (p < 0) {
      log.push({ text: `La columna ${c + 1} no tiene pivote disponible: pasamos a la siguiente.` });
      continue;
    }
    if (p !== r) {
      [M[p], M[r]] = [M[r], M[p]];
      log.push({ text: `Intercambiamos filas para tener un pivote distinto de cero en la columna ${c + 1}.`, op: `${R(r)} \\leftrightarrow ${R(p)}`, latex: show(M, opt.split, o) });
    }
    const piv = M[r][c];
    if (!qisOne(piv)) {
      const inv = qdiv(Q1, piv);
      M[r] = M[r].map((x) => qmul(x, inv));
      log.push({ text: `Hacemos 1 el pivote de la fila ${r + 1}.`, op: `${R(r)} \\leftarrow ${coefLatex(inv, o)}${R(r)}`, latex: show(M, opt.split, o) });
    }
    const ops: string[] = [];
    for (let i = 0; i < m; i++) {
      if (i === r || qisZero(M[i][c])) continue;
      const f = qneg(M[i][c]);
      M[i] = M[i].map((x, j) => qadd(x, qmul(f, M[r][j])));
      ops.push(addOpLatex(i, f, r, o));
    }
    if (ops.length) {
      log.push({ text: `Hacemos ceros arriba y abajo del pivote en la columna ${c + 1}.`, op: ops.join(' \\\\ '), latex: show(M, opt.split, o) });
    }
    pivots.push(c);
    r++;
  }
  log.push({ text: 'Forma escalonada reducida (RREF).', latex: show(M, opt.split, o) });
  return { R: M, pivots, rank: pivots.length };
}

// ── Determinante ────────────────────────────────────────────────────

/** Determinante exacto sin pasos (eliminación con pivoteo para evitar ceros). */
export function det(A: Matrix): Q {
  assertSquare(A, 'El determinante');
  const M = clone(A);
  const n = rows(M);
  let d = Q1;
  for (let c = 0; c < n; c++) {
    const p = choosePivot(M, c, c);
    if (p < 0) return Q0;
    if (p !== c) {
      [M[p], M[c]] = [M[c], M[p]];
      d = qneg(d);
    }
    const piv = M[c][c];
    d = qmul(d, piv);
    for (let i = c + 1; i < n; i++) {
      if (qisZero(M[i][c])) continue;
      const f = qdiv(M[i][c], piv);
      for (let j = c; j < n; j++) M[i][j] = qsub(M[i][j], qmul(f, M[c][j]));
    }
  }
  return d;
}

const vmatrix = (A: Matrix, o: FormatOptions) => toLatex(A, o, 'vmatrix');

/** Determinante por eliminación (triangular superior) con pasos. */
export function detByElimination(A: Matrix, fmt: FormatOptions = DEFAULT_FMT): Computation {
  assertSquare(A, 'El determinante');
  const o = fmt;
  const log = new StepLog();
  const M = clone(A);
  const n = rows(M);
  let sign = 1;
  log.push({ text: 'Reducimos a forma triangular superior usando solo intercambios (cambian el signo) y sumas de múltiplos de filas (no cambian el determinante).', latex: vmatrix(M, o) });
  for (let c = 0; c < n; c++) {
    const p = choosePivot(M, c, c);
    if (p < 0) {
      log.push({ text: `La columna ${c + 1} queda sin pivote: la matriz es singular, así que el determinante es 0.` });
      return { title: 'Determinante (eliminación)', steps: log.steps, results: [{ label: '\\det(A)', latex: '\\det(A) = 0', text: '0' }] };
    }
    if (p !== c) {
      [M[p], M[c]] = [M[c], M[p]];
      sign = -sign;
      log.push({ text: 'Intercambio de filas: el determinante cambia de signo.', op: `${R(c)} \\leftrightarrow ${R(p)}`, latex: `${sign < 0 ? '-' : ''}${vmatrix(M, o)}` });
    }
    const ops: string[] = [];
    for (let i = c + 1; i < n; i++) {
      if (qisZero(M[i][c])) continue;
      const f = qneg(qdiv(M[i][c], M[c][c]));
      M[i] = M[i].map((x, j) => qadd(x, qmul(f, M[c][j])));
      ops.push(addOpLatex(i, f, c, o));
    }
    if (ops.length) log.push({ text: `Hacemos ceros debajo del pivote de la columna ${c + 1}.`, op: ops.join(' \\\\ '), latex: `${sign < 0 ? '-' : ''}${vmatrix(M, o)}` });
  }
  let d: Q = sign < 0 ? qneg(Q1) : Q1;
  const diag = M.map((r, i) => r[i]);
  diag.forEach((x) => (d = qmul(d, x)));
  const prod = diag.map((x) => qtoLatexFactor(x, o)).join(' \\cdot ');
  log.push({ text: 'El determinante de una matriz triangular es el producto de su diagonal.', latex: `\\det(A) = ${sign < 0 ? '-' : ''}${prod} = ${qtoLatex(d, o)}` });
  return { title: 'Determinante (eliminación)', steps: log.steps, results: [{ label: '\\det(A)', latex: `\\det(A) = ${qtoLatex(d, o)}`, text: qtoString(d, o) }] };
}

export function minor(A: Matrix, i: number, j: number): Matrix {
  return A.filter((_, r) => r !== i).map((row) => row.filter((_, c) => c !== j));
}

/** Expansión por cofactores (Laplace) sobre la fila o columna con más ceros. */
export function detByCofactors(A: Matrix, fmt: FormatOptions = DEFAULT_FMT): Computation {
  assertSquare(A, 'El determinante');
  const o = fmt;
  const n = rows(A);
  const log = new StepLog();
  if (n === 1) {
    return { title: 'Determinante (cofactores)', steps: [], results: [{ label: '\\det(A)', latex: `\\det(A) = ${qtoLatex(A[0][0], o)}` }] };
  }
  if (n === 2) {
    const [[a, b], [c, d]] = A;
    const v = qsub(qmul(a, d), qmul(b, c));
    log.push({ text: 'Para 2×2: det = ad − bc.', latex: `${vmatrix(A, o)} = ${qtoLatexFactor(a, o)}\\cdot${qtoLatexFactor(d, o)} - ${qtoLatexFactor(b, o)}\\cdot${qtoLatexFactor(c, o)} = ${qtoLatex(v, o)}` });
    return { title: 'Determinante (cofactores)', steps: log.steps, results: [{ label: '\\det(A)', latex: `\\det(A) = ${qtoLatex(v, o)}`, text: qtoString(v, o) }] };
  }
  // Elegimos la línea con más ceros.
  let best = { isRow: true, k: 0, zeros: -1 };
  for (let k = 0; k < n; k++) {
    const zr = A[k].filter(qisZero).length;
    const zc = A.filter((r) => qisZero(r[k])).length;
    if (zr > best.zeros) best = { isRow: true, k, zeros: zr };
    if (zc > best.zeros) best = { isRow: false, k, zeros: zc };
  }
  const line = best.isRow ? `la fila ${best.k + 1}` : `la columna ${best.k + 1}`;
  log.push({ text: `Expandimos por ${line}${best.zeros > 0 ? ` (tiene ${best.zeros} cero${best.zeros > 1 ? 's' : ''}, menos cálculos)` : ''}: det(A) = Σ (−1)^(i+j) · aᵢⱼ · Mᵢⱼ.`, latex: vmatrix(A, o) });
  let total = Q0;
  const terms: string[] = [];
  for (let t = 0; t < n; t++) {
    const i = best.isRow ? best.k : t;
    const j = best.isRow ? t : best.k;
    const a = A[i][j];
    if (qisZero(a)) continue;
    const Mi = minor(A, i, j);
    const md = det(Mi);
    const s = (i + j) % 2 === 0 ? Q1 : qneg(Q1);
    const term = qmul(s, qmul(a, md));
    total = qadd(total, term);
    terms.push(`${s === Q1 ? '+' : '-'}${qtoLatexFactor(a, o)}\\cdot${qtoLatexFactor(md, o)}`);
    log.push({
      text: `Cofactor C${i + 1}${j + 1}: signo (−1)^(${i + 1}+${j + 1}) = ${(i + j) % 2 === 0 ? '+' : '−'}, menor M${i + 1}${j + 1} = ${qtoString(md, o)}.`,
      latex: `M_{${i + 1}${j + 1}} = ${vmatrix(Mi, o)} = ${qtoLatex(md, o)}`,
    });
  }
  const sumTxt = terms.length ? terms.join(' ').replace(/^\+/, '') : '0';
  log.push({ text: 'Sumamos los términos.', latex: `\\det(A) = ${sumTxt} = ${qtoLatex(total, o)}` });
  return { title: 'Determinante (cofactores)', steps: log.steps, results: [{ label: '\\det(A)', latex: `\\det(A) = ${qtoLatex(total, o)}`, text: qtoString(total, o) }] };
}

// ── Inversa ─────────────────────────────────────────────────────────

export function inverseExact(A: Matrix): Matrix {
  assertSquare(A, 'La inversa');
  const n = rows(A);
  const { R: Rm, rank } = rref(hstack(A, identity(n)), { pivotCols: n });
  if (rank < n) throw new Error('La matriz es singular (det = 0): no tiene inversa.');
  return Rm.map((r) => r.slice(n));
}

export function inverseGaussJordan(A: Matrix, fmt: FormatOptions = DEFAULT_FMT): Computation {
  assertSquare(A, 'La inversa');
  const n = rows(A);
  const log = new StepLog();
  const { R: Rm, rank } = rref(hstack(A, identity(n)), { split: n, pivotCols: n, log, fmt, intro: 'Formamos la matriz aumentada [A | I] y la reducimos hasta que la parte izquierda sea la identidad.' });
  if (rank < n) {
    log.push({ text: `El rango de A es ${rank} < ${n}: la parte izquierda no llega a la identidad, así que A no es invertible.` });
    return { title: 'Inversa (Gauss-Jordan)', steps: log.steps, results: [{ label: 'A^{-1}', latex: '\\text{A no es invertible } (\\det A = 0)' }] };
  }
  const inv = Rm.map((r) => r.slice(n));
  return { title: 'Inversa (Gauss-Jordan)', steps: log.steps, results: [{ label: 'A^{-1}', latex: `A^{-1} = ${toLatex(inv, fmt)}` }] };
}

// ── Sistemas lineales ───────────────────────────────────────────────

export type SolutionKind = 'unique' | 'infinite' | 'none';

export interface SystemSolution {
  kind: SolutionKind;
  /** Solución particular (si existe). */
  particular?: Q[];
  /** Base del espacio de soluciones homogéneas (direcciones libres). */
  directions: Q[][];
  freeVars: number[];
  rank: number;
  augmentedRank: number;
}

export function solveSystemExact(A: Matrix, b: Q[]): SystemSolution {
  return classify(A, b, rref(hstack(A, b.map((x) => [x])), { pivotCols: cols(A) }));
}

function classify(A: Matrix, _b: Q[], res: RrefResult): SystemSolution {
  const n = cols(A);
  const { R: Rm, pivots } = res;
  const inconsistent = Rm.some((r) => r.slice(0, n).every(qisZero) && !qisZero(r[n]));
  const rank = pivots.length;
  if (inconsistent) return { kind: 'none', directions: [], freeVars: [], rank, augmentedRank: rank + 1 };
  const free = [...Array(n).keys()].filter((c) => !pivots.includes(c));
  const particular = Array.from({ length: n }, () => Q0);
  pivots.forEach((c, r) => (particular[c] = Rm[r][n]));
  const directions = free.map((f) => {
    const v = Array.from({ length: n }, () => Q0);
    v[f] = Q1;
    pivots.forEach((c, r) => (v[c] = qneg(Rm[r][f])));
    return v;
  });
  return { kind: free.length ? 'infinite' : 'unique', particular, directions, freeVars: free, rank, augmentedRank: rank };
}

const colVec = (v: Q[], o: FormatOptions) => toLatex(v.map((x) => [x]), o);

export function solveSystemGaussJordan(A: Matrix, b: Q[], fmt: FormatOptions = DEFAULT_FMT): Computation {
  if (b.length !== rows(A)) throw new Error(`El vector b debe tener ${rows(A)} entradas.`);
  const n = cols(A);
  const log = new StepLog();
  const res = rref(hstack(A, b.map((x) => [x])), { split: n, pivotCols: n, log, fmt, intro: 'Escribimos la matriz aumentada [A | b] y aplicamos Gauss-Jordan.' });
  const sol = classify(A, b, res);
  const results = describeSolution(sol, n, fmt, log);
  return { title: 'Sistema Ax = b (Gauss-Jordan)', steps: log.steps, results };
}

function describeSolution(sol: SystemSolution, n: number, o: FormatOptions, log: StepLog): ResultBlock[] {
  const x = (k: number) => `x_{${k + 1}}`;
  if (sol.kind === 'none') {
    log.push({ text: `Aparece una fila [0 … 0 | c] con c ≠ 0: rango(A) = ${sol.rank} < rango([A|b]) = ${sol.augmentedRank}. El sistema es incompatible.` });
    return [{ label: 'Solución', latex: '\\text{El sistema no tiene solución (incompatible).}', text: 'Sin solución' }];
  }
  if (sol.kind === 'unique') {
    log.push({ text: `rango(A) = rango([A|b]) = ${n} = número de incógnitas: solución única.` });
    const p = sol.particular!;
    return [
      { label: 'x', latex: `x = ${colVec(p, o)}`, text: p.map((v, k) => `x${k + 1} = ${qtoString(v, o)}`).join('\n') },
      ...p.map((v, k) => ({ label: x(k), latex: `${x(k)} = ${qtoLatex(v, o)}` })),
    ];
  }
  const t = sol.freeVars.map((_, k) => (sol.freeVars.length === 1 ? 't' : `t_{${k + 1}}`));
  log.push({
    text: `rango(A) = ${sol.rank} < ${n} incógnitas: hay ${sol.freeVars.length} variable${sol.freeVars.length > 1 ? 's' : ''} libre${sol.freeVars.length > 1 ? 's' : ''} (${sol.freeVars.map((f) => `x${f + 1}`).join(', ')}). Infinitas soluciones.`,
  });
  const parts = [colVec(sol.particular!, o), ...sol.directions.map((d, k) => `${t[k]}${colVec(d, o)}`)];
  const params = sol.freeVars.map((f, k) => `${x(f)} = ${t[k]}`).join(',\\; ');
  return [
    { label: 'Solución general', latex: `x = ${parts.join(' + ')}, \\quad ${t.join(', ')} \\in \\mathbb{C}`, text: 'Infinitas soluciones' },
    { label: 'Parámetros', latex: params },
  ];
}

export function cramer(A: Matrix, b: Q[], fmt: FormatOptions = DEFAULT_FMT): Computation {
  assertSquare(A, 'La regla de Cramer');
  if (b.length !== rows(A)) throw new Error(`El vector b debe tener ${rows(A)} entradas.`);
  const o = fmt;
  const n = rows(A);
  const log = new StepLog();
  const dA = det(A);
  log.push({ text: 'Calculamos det(A).', latex: `\\det(A) = ${vmatrix(A, o)} = ${qtoLatex(dA, o)}` });
  if (qisZero(dA)) {
    log.push({ text: 'det(A) = 0: Cramer no aplica. Usa Gauss-Jordan para saber si hay infinitas soluciones o ninguna.' });
    return { title: 'Regla de Cramer', steps: log.steps, results: [{ label: 'x', latex: '\\det(A) = 0 \\Rightarrow \\text{Cramer no aplica}' }] };
  }
  const xs: Q[] = [];
  for (let k = 0; k < n; k++) {
    const Ak = A.map((r, i) => r.map((v, j) => (j === k ? b[i] : v)));
    const dk = det(Ak);
    const xk = qdiv(dk, dA);
    xs.push(xk);
    log.push({ text: `Reemplazamos la columna ${k + 1} por b.`, latex: `x_{${k + 1}} = \\frac{\\det(A_{${k + 1}})}{\\det(A)} = \\frac{${qtoLatex(dk, o)}}{${qtoLatex(dA, o)}} = ${qtoLatex(xk, o)}, \\quad A_{${k + 1}} = ${toLatex(Ak, o)}` });
  }
  return { title: 'Regla de Cramer', steps: log.steps, results: [{ label: 'x', latex: `x = ${colVec(xs, o)}`, text: xs.map((v, k) => `x${k + 1} = ${qtoString(v, o)}`).join('\n') }] };
}

export function solveByInverse(A: Matrix, b: Q[], fmt: FormatOptions = DEFAULT_FMT): Computation {
  const inv = inverseExact(A);
  const x = mul(inv, b.map((v) => [v])).map((r) => r[0]);
  return {
    title: 'Sistema por inversa (x = A⁻¹b)',
    steps: [
      { text: 'Calculamos la inversa de A (ver "Inversa" para el detalle).', latex: `A^{-1} = ${toLatex(inv, fmt)}` },
      { text: 'Multiplicamos A⁻¹ por b.', latex: `x = A^{-1}b = ${toLatex(inv, fmt)}${colVec(b, fmt)} = ${colVec(x, fmt)}` },
    ],
    results: [{ label: 'x', latex: `x = ${colVec(x, fmt)}`, text: x.map((v, k) => `x${k + 1} = ${qtoString(v, fmt)}`).join('\n') }],
  };
}

// ── LU con pivoteo (PA = LU) ────────────────────────────────────────

export interface LU { P: Matrix; L: Matrix; U: Matrix; swaps: number }

export function luExact(A: Matrix, log?: StepLog, fmt: FormatOptions = DEFAULT_FMT): LU {
  assertSquare(A, 'La factorización LU');
  const n = rows(A);
  const U = clone(A);
  const L = zeros(n, n);
  const perm = [...Array(n).keys()];
  let swaps = 0;
  for (let c = 0; c < n; c++) {
    if (qisZero(U[c][c])) {
      const p = choosePivot(U, c, c);
      if (p > c) {
        [U[p], U[c]] = [U[c], U[p]];
        [L[p], L[c]] = [L[c], L[p]];
        [perm[p], perm[c]] = [perm[c], perm[p]];
        swaps++;
        log?.push({ text: `Pivote cero: intercambiamos filas ${c + 1} y ${p + 1} (se registra en P).`, op: `${R(c)} \\leftrightarrow ${R(p)}`, latex: toLatex(U, fmt) });
      }
    }
    if (qisZero(U[c][c])) continue;
    const ops: string[] = [];
    for (let i = c + 1; i < n; i++) {
      const l = qdiv(U[i][c], U[c][c]);
      L[i][c] = l;
      if (qisZero(l)) continue;
      U[i] = U[i].map((x, j) => qsub(x, qmul(l, U[c][j])));
      ops.push(`\\ell_{${i + 1}${c + 1}} = ${qtoLatex(l, fmt)}:\\; ${addOpLatex(i, qneg(l), c, fmt)}`);
    }
    if (ops.length) log?.push({ text: `Eliminamos debajo del pivote ${c + 1}; los multiplicadores van a L.`, op: ops.join(' \\\\ '), latex: toLatex(U, fmt) });
  }
  for (let i = 0; i < n; i++) L[i][i] = Q1;
  const P = perm.map((p) => Array.from({ length: n }, (_, j) => (j === p ? Q1 : Q0)));
  return { P, L, U, swaps };
}

export function luDecomposition(A: Matrix, fmt: FormatOptions = DEFAULT_FMT): Computation {
  const log = new StepLog();
  log.push({ text: 'Buscamos P, L (triangular inferior con 1 en la diagonal) y U (triangular superior) tales que PA = LU.', latex: toLatex(A, fmt) });
  const { P, L, U } = luExact(A, log, fmt);
  const isI = P.every((r, i) => r.every((x, j) => qeq(x, i === j ? Q1 : Q0)));
  return {
    title: 'Factorización LU',
    steps: log.steps,
    results: [
      ...(isI ? [] : [{ label: 'P', latex: `P = ${toLatex(P, fmt)}` }]),
      { label: 'L', latex: `L = ${toLatex(L, fmt)}` },
      { label: 'U', latex: `U = ${toLatex(U, fmt)}` },
    ],
    notes: isI ? ['No hubo intercambios de filas: A = LU.'] : undefined,
  };
}

// ── Cofactores, adjunta, rango, espacios ────────────────────────────

export function cofactorMatrix(A: Matrix): Matrix {
  assertSquare(A, 'La matriz de cofactores');
  const n = rows(A);
  if (n === 1) return [[Q1]];
  return A.map((r, i) => r.map((_, j) => {
    const d = det(minor(A, i, j));
    return (i + j) % 2 === 0 ? d : qneg(d);
  }));
}

export const adjugate = (A: Matrix) => transpose(cofactorMatrix(A));

export const rank = (A: Matrix) => rref(A).rank;

/** Base del espacio nulo N(A). */
export function nullSpace(A: Matrix): Q[][] {
  const sol = solveSystemExact(A, Array.from({ length: rows(A) }, () => Q0));
  return sol.directions;
}

/** Base del espacio columna: las columnas de A en posiciones pivote. */
export function columnSpace(A: Matrix): Q[][] {
  const { pivots } = rref(A);
  return pivots.map((c) => A.map((r) => r[c]));
}

