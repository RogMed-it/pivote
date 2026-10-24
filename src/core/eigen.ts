// Valores y vectores propios. Combina:
//  1) polinomio característico EXACTO (Faddeev–LeVerrier sobre fracciones),
//  2) raíces numéricas por QR complejo desplazado,
//  3) "ajuste" a valores exactos cuando la raíz es racional (o racional + i·racional):
//     se verifica con det(A − λI) = 0 en aritmética exacta y entonces los vectores
//     propios salen exactos del espacio nulo.

import { Q, Q0, Q1, q, qsub, qneg, qdiv, qisZero, qtoLatex, qtoLatexFactor, qtoC, qint, FormatOptions, DEFAULT_FMT } from './scalar';
import { fromNumberApprox, fisZero, fsign } from './rational';
import { Matrix, rows, identity, mul, add, trace, scale, assertSquare, toLatex, isReal, isHermitian } from './matrix';
import { det, nullSpace, rref } from './elimination';
import { C, CMatrix, eigenvaluesC, eigenvectorC, cabs, csub, fmtC, normFro } from './numeric';
import { StepLog, Computation, ResultBlock } from './steps';

/** Coeficientes [c0, c1, …, cn] de p(λ) = det(λI − A), con cn = 1. */
export function charPoly(A: Matrix): Q[] {
  assertSquare(A, 'El polinomio característico');
  const n = rows(A);
  const coef: Q[] = Array.from({ length: n + 1 }, () => Q0);
  coef[n] = Q1;
  let M: Matrix = Array.from({ length: n }, () => Array.from({ length: n }, () => Q0));
  for (let k = 1; k <= n; k++) {
    M = add(mul(A, M), scale(identity(n), coef[n - k + 1]));
    coef[n - k] = qdiv(qneg(trace(mul(A, M))), qint(k));
  }
  return coef;
}

export function polyLatex(coef: Q[], v = '\\lambda', o: FormatOptions = DEFAULT_FMT): string {
  const parts: string[] = [];
  for (let k = coef.length - 1; k >= 0; k--) {
    const a = coef[k];
    if (qisZero(a)) continue;
    const neg = fisZero(a.im) && fsign(a.re) < 0;
    const abs = neg ? qneg(a) : a;
    const pw = k === 0 ? '' : k === 1 ? v : `${v}^{${k}}`;
    const isOne = fisZero(abs.im) && abs.re.n === 1n && abs.re.d === 1n;
    const body = k === 0 ? qtoLatex(abs, o) : isOne ? pw : `${qtoLatexFactor(abs, o)}${pw}`;
    parts.push(parts.length === 0 ? (neg ? `-${body}` : body) : `${neg ? '-' : '+'} ${body}`);
  }
  return parts.join(' ') || '0';
}

export const toCMatrix = (A: Matrix): CMatrix => A.map((r) => r.map(qtoC));

function snap(z: C): Q | null {
  const re = fromNumberApprox(z.re, 1000n);
  const im = fromNumberApprox(z.im, 1000n);
  if (!re || !im) return null;
  return q(re, im);
}

export interface EigenPair {
  value: C;
  exact?: Q;
  algebraic: number;
  /** Base del eigenespacio (exacta si `exact` existe; si no, un vector numérico). */
  vectors: { exact?: Q[]; approx: C[] }[];
}

export function eigenDecompose(A: Matrix): EigenPair[] {
  assertSquare(A, 'Los valores propios');
  const Ac = toCMatrix(A);
  let vals = eigenvaluesC(Ac);
  if (isHermitian(A)) vals = vals.map((z) => ({ re: z.re, im: 0 })); // Hermitiana ⇒ valores reales
  const tol = 1e-4 * (normFro(Ac) || 1);
  // Agrupamos raíces repetidas.
  const groups: { value: C; count: number }[] = [];
  for (const v of vals) {
    const g = groups.find((g) => cabs(csub(g.value, v)) < tol);
    if (g) g.count++;
    else groups.push({ value: v, count: 1 });
  }
  return groups.map(({ value, count }) => {
    const ex = snap(value);
    if (ex) {
      const shifted = A.map((r, i) => r.map((x, j) => (i === j ? qsub(x, ex) : x)));
      if (qisZero(det(shifted))) {
        const basis = nullSpace(shifted);
        return { value: qtoC(ex), exact: ex, algebraic: count, vectors: basis.map((b) => ({ exact: b, approx: b.map(qtoC) })) };
      }
    }
    return { value, algebraic: count, vectors: [{ approx: eigenvectorC(Ac, value) }] };
  }).sort((a, b) => b.value.re - a.value.re || b.value.im - a.value.im);
}

const vecLatex = (v: string[]) => `\\begin{bmatrix} ${v.join(' \\\\ ')} \\end{bmatrix}`;

export function eigenComputation(A: Matrix, fmt: FormatOptions = DEFAULT_FMT, withVectors = true): Computation {
  assertSquare(A, 'Los valores propios');
  const n = rows(A);
  const o = fmt;
  const log = new StepLog();
  const notes: string[] = [];
  const p = charPoly(A);
  log.push({ text: 'Planteamos el polinomio característico p(λ) = det(λI − A) (cálculo exacto).', latex: `p(\\lambda) = ${polyLatex(p, '\\lambda', o)}` });
  const pairs = eigenDecompose(A);
  const allExact = pairs.every((pp) => pp.exact);
  log.push({
    text: allExact
      ? 'Las raíces de p(λ) son exactas (se verificó det(A − λI) = 0 en aritmética exacta).'
      : 'Las raíces se obtienen numéricamente con el método QR desplazado (las no racionales se muestran aproximadas).',
    latex: pairs.map((pp, k) => `\\lambda_{${k + 1}} = ${pp.exact ? qtoLatex(pp.exact, o) : fmtC(pp.value, o.decimals)}${pp.algebraic > 1 ? `\\;(\\text{mult. } ${pp.algebraic})` : ''}`).join(',\\quad '),
  });
  const results: ResultBlock[] = [];
  let geoTotal = 0;
  pairs.forEach((pp, k) => {
    const lam = pp.exact ? qtoLatex(pp.exact, o) : fmtC(pp.value, o.decimals);
    if (withVectors && pp.exact) {
      const shifted = A.map((r, i) => r.map((x, j) => (i === j ? qsub(x, pp.exact!) : x)));
      const { R } = rref(shifted);
      log.push({ text: `Para λ = ${pp.exact ? lam.replace(/\\frac\{(-?\d+)\}\{(\d+)\}/g, '$1/$2') : lam}: resolvemos (A − λI)v = 0.`, latex: `A - (${lam})I = ${toLatex(shifted, o)} \\sim ${toLatex(R, o)}` });
    }
    geoTotal += pp.exact ? pp.vectors.length : 1;
    const vecs = pp.vectors.map((v) => vecLatex(v.exact ? v.exact.map((x) => qtoLatex(x, o)) : v.approx.map((x) => fmtC(x, o.decimals))));
    results.push({
      label: `\\lambda_{${k + 1}}`,
      latex: `\\lambda_{${k + 1}} = ${lam}${pp.algebraic > 1 ? `\\;(\\text{mult. alg. } ${pp.algebraic})` : ''}${withVectors ? `,\\quad v = ${vecs.join(',\\; ')}` : ''}`,
      text: pp.exact ? undefined : fmtC(pp.value, o.decimals),
    });
  });
  if (withVectors) {
    const allDistinct = pairs.every((pp) => pp.algebraic === 1);
    const diag = allDistinct || (allExact && geoTotal === n);
    notes.push(diag ? 'A es diagonalizable: A = PDP⁻¹ con los vectores propios como columnas de P.' : allExact ? 'A no es diagonalizable (faltan vectores propios independientes).' : 'Hay valores repetidos aproximados; la diagonalizabilidad no se puede asegurar numéricamente.');
  }
  if (!allExact) notes.push('Los valores marcados como decimales son aproximaciones numéricas (QR con desplazamiento de Wilkinson). Los vectores aproximados están normalizados (‖v‖ = 1).');
  if (isReal(A) && pairs.some((pp) => Math.abs(pp.value.im) > 1e-9)) notes.push('La matriz es real pero tiene valores propios complejos: aparecen en pares conjugados.');
  return { title: withVectors ? 'Valores y vectores propios' : 'Valores propios', steps: log.steps, results, notes };
}

