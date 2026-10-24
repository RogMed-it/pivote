// Catálogo de operaciones: qué entradas necesita cada una y cómo se calcula.

import { Q, qtoLatex, FormatOptions } from '../core/scalar';
import {
  Matrix, rows, cols, add, sub, mul, transpose, conjTranspose, scale, power, trace, toLatex, isReal,
} from '../core/matrix';
import {
  detByCofactors, detByElimination, inverseGaussJordan, solveSystemGaussJordan, cramer, solveByInverse,
  luDecomposition, cofactorMatrix, adjugate, rref, nullSpace, columnSpace,
} from '../core/elimination';
import { eigenComputation, toCMatrix, charPoly, polyLatex } from '../core/eigen';
import { normFro, spectralNorm, conditionNumber } from '../core/numeric';
import { Computation, StepLog } from '../core/steps';

export type Inputs = 'A' | 'Ab' | 'AB';
export type Group = 'sistema' | 'una' | 'dos';

export interface OpContext {
  A: Matrix;
  B: Matrix;
  b: Q[];
  k: Q;
  p: number;
  fmt: FormatOptions;
}

export interface Operation {
  id: string;
  label: string;
  group: Group;
  inputs: Inputs;
  /** Requiere un escalar k o un exponente p. */
  extra?: 'k' | 'p';
  hint: string;
  run(ctx: OpContext): Computation;
}

const L = (M: Matrix, o: FormatOptions) => toLatex(M, o);
const dim = (M: Matrix) => `${rows(M)}\\times${cols(M)}`;
const vec = (v: Q[], o: FormatOptions) => toLatex(v.map((x) => [x]), o);

function simple(title: string, label: string, latex: string, steps: Computation['steps'] = [], notes?: string[]): Computation {
  return { title, steps, results: [{ label, latex }], notes };
}

export const OPERATIONS: Operation[] = [
  // ── Sistemas ────────────────────────────────────────────────
  {
    id: 'gauss-jordan', label: 'Gauss-Jordan', group: 'sistema', inputs: 'Ab',
    hint: 'Resuelve Ax = b. Detecta solución única, infinitas (forma paramétrica) o ninguna.',
    run: ({ A, b, fmt }) => solveSystemGaussJordan(A, b, fmt),
  },
  {
    id: 'cramer', label: 'Regla de Cramer', group: 'sistema', inputs: 'Ab',
    hint: 'xᵢ = det(Aᵢ)/det(A). Solo si A es cuadrada y det(A) ≠ 0.',
    run: ({ A, b, fmt }) => cramer(A, b, fmt),
  },
  {
    id: 'inverse-solve', label: 'Por inversa (A⁻¹b)', group: 'sistema', inputs: 'Ab',
    hint: 'x = A⁻¹b. Solo si A es invertible.',
    run: ({ A, b, fmt }) => solveByInverse(A, b, fmt),
  },

  // ── Una matriz ──────────────────────────────────────────────
  {
    id: 'det-cofactors', label: 'Determinante (cofactores)', group: 'una', inputs: 'A',
    hint: 'Expansión de Laplace por la fila o columna con más ceros.',
    run: ({ A, fmt }) => detByCofactors(A, fmt),
  },
  {
    id: 'det-elimination', label: 'Determinante (eliminación)', group: 'una', inputs: 'A',
    hint: 'Reduce a triangular y multiplica la diagonal.',
    run: ({ A, fmt }) => detByElimination(A, fmt),
  },
  {
    id: 'inverse', label: 'Inversa (Gauss-Jordan)', group: 'una', inputs: 'A',
    hint: 'Reduce [A | I] hasta [I | A⁻¹].',
    run: ({ A, fmt }) => inverseGaussJordan(A, fmt),
  },
  {
    id: 'rref', label: 'RREF, rango y espacios', group: 'una', inputs: 'A',
    hint: 'Forma escalonada reducida, rango, nulidad y bases de N(A) y Col(A).',
    run: ({ A, fmt }) => {
      const log = new StepLog();
      const { R, rank } = rref(A, { log, fmt });
      const N = nullSpace(A);
      const Cs = columnSpace(A);
      return {
        title: 'RREF, rango y espacios',
        steps: log.steps,
        results: [
          { label: 'RREF', latex: `\\operatorname{RREF}(A) = ${L(R, fmt)}` },
          { label: 'Rango', latex: `\\operatorname{rango}(A) = ${rank},\\quad \\operatorname{nulidad}(A) = ${cols(A) - rank}` },
          { label: 'N(A)', latex: N.length ? `N(A) = \\operatorname{gen}\\left\\{ ${N.map((v) => vec(v, fmt)).join(',\\; ')} \\right\\}` : 'N(A) = \\{ \\mathbf{0} \\}' },
          { label: 'Col(A)', latex: Cs.length ? `\\operatorname{Col}(A) = \\operatorname{gen}\\left\\{ ${Cs.map((v) => vec(v, fmt)).join(',\\; ')} \\right\\}` : '\\operatorname{Col}(A) = \\{ \\mathbf{0} \\}' },
        ],
      };
    },
  },
  {
    id: 'eigen', label: 'Valores y vectores propios', group: 'una', inputs: 'A',
    hint: 'Polinomio característico exacto, λ y bases de cada eigenespacio. Indica si es diagonalizable.',
    run: ({ A, fmt }) => eigenComputation(A, fmt, true),
  },
  {
    id: 'charpoly', label: 'Polinomio característico', group: 'una', inputs: 'A',
    hint: 'p(λ) = det(λI − A) con coeficientes exactos.',
    run: ({ A, fmt }) => {
      const p = charPoly(A);
      return simple('Polinomio característico', 'p(λ)', `p(\\lambda) = \\det(\\lambda I - A) = ${polyLatex(p, '\\lambda', fmt)}`, [
        { text: 'Se calcula con el algoritmo de Faddeev–LeVerrier en aritmética exacta. El término independiente es (−1)ⁿ·det(A) y el coeficiente de λⁿ⁻¹ es −tr(A).' },
      ]);
    },
  },
  {
    id: 'lu', label: 'Factorización LU', group: 'una', inputs: 'A',
    hint: 'PA = LU con pivoteo cuando hace falta.',
    run: ({ A, fmt }) => luDecomposition(A, fmt),
  },
  {
    id: 'transpose', label: 'Transpuesta', group: 'una', inputs: 'A',
    hint: 'Aᵀ: filas ↔ columnas. Para complejos también se muestra Aᴴ.',
    run: ({ A, fmt }) => {
      const res = [{ label: 'Aᵀ', latex: `A^{T} = ${L(transpose(A), fmt)}` }];
      if (!isReal(A)) res.push({ label: 'Aᴴ', latex: `A^{H} = \\overline{A}^{T} = ${L(conjTranspose(A), fmt)}` });
      return { title: 'Transpuesta', steps: [{ text: 'La fila i de A pasa a ser la columna i de Aᵀ.' }], results: res };
    },
  },
  {
    id: 'adjugate', label: 'Adjunta y cofactores', group: 'una', inputs: 'A',
    hint: 'Matriz de cofactores C y adj(A) = Cᵀ.',
    run: ({ A, fmt }) => {
      const Cm = cofactorMatrix(A);
      return {
        title: 'Adjunta y cofactores',
        steps: [{ text: 'Cada cofactor es Cᵢⱼ = (−1)^(i+j)·Mᵢⱼ, donde Mᵢⱼ es el determinante al quitar la fila i y la columna j.', latex: `C = ${L(Cm, fmt)}` }],
        results: [
          { label: 'C', latex: `C = ${L(Cm, fmt)}` },
          { label: 'adj(A)', latex: `\\operatorname{adj}(A) = C^{T} = ${L(adjugate(A), fmt)}` },
        ],
      };
    },
  },
  {
    id: 'trace-norms', label: 'Traza y normas', group: 'una', inputs: 'A',
    hint: 'Traza, norma de Frobenius, norma espectral ‖A‖₂ y número de condición.',
    run: ({ A, fmt }) => {
      const Ac = toCMatrix(A);
      const d = fmt.decimals;
      const res = [
        { label: '‖A‖F', latex: `\\|A\\|_F = ${normFro(Ac).toFixed(d)}` },
        { label: '‖A‖₂', latex: `\\|A\\|_2 = \\sigma_{\\max} = ${spectralNorm(Ac).toFixed(d)}` },
      ];
      if (rows(A) === cols(A)) {
        const k = conditionNumber(Ac);
        res.unshift({ label: 'tr(A)', latex: `\\operatorname{tr}(A) = ${qtoLatex(trace(A), fmt)}` });
        res.push({ label: 'κ(A)', latex: `\\kappa_2(A) = ${Number.isFinite(k) ? k.toFixed(d) : '\\infty \\text{ (singular)}'}` });
      }
      return { title: 'Traza y normas', steps: [{ text: 'La norma espectral es el mayor valor singular: la raíz del mayor valor propio de AᴴA.' }], results: res, notes: ['Las normas son valores numéricos aproximados.'] };
    },
  },
  {
    id: 'power', label: 'Potencia Aᵖ', group: 'una', inputs: 'A', extra: 'p',
    hint: 'Potencia entera por cuadrados sucesivos.',
    run: ({ A, p, fmt }) => simple('Potencia', `A^${p}`, `A^{${p}} = ${L(power(A, p), fmt)}`),
  },
  {
    id: 'scalar', label: 'Escalar por matriz kA', group: 'una', inputs: 'A', extra: 'k',
    hint: 'Multiplica cada entrada por k.',
    run: ({ A, k, fmt }) => simple('Escalar por matriz', 'kA', `${qtoLatex(k, fmt)} \\cdot A = ${L(scale(A, k), fmt)}`),
  },

  // ── Dos matrices ────────────────────────────────────────────
  {
    id: 'add', label: 'A + B', group: 'dos', inputs: 'AB', hint: 'Suma entrada por entrada (mismas dimensiones).',
    run: ({ A, B, fmt }) => simple('Suma', 'A + B', `A + B = ${L(add(A, B), fmt)}`),
  },
  {
    id: 'sub', label: 'A − B', group: 'dos', inputs: 'AB', hint: 'Resta entrada por entrada (mismas dimensiones).',
    run: ({ A, B, fmt }) => simple('Resta', 'A − B', `A - B = ${L(sub(A, B), fmt)}`),
  },
  {
    id: 'mul', label: 'A · B', group: 'dos', inputs: 'AB', hint: 'Producto matricial: columnas de A = filas de B.',
    run: ({ A, B, fmt }) => {
      const P = mul(A, B);
      const e = (i: number, j: number) =>
        A[i].map((a, k) => `${qtoLatex(a, fmt)}\\cdot${qtoLatex(B[k][j], fmt)}`).join(' + ');
      return {
        title: 'Producto A·B',
        steps: [
          { text: `(${rows(A)}×${cols(A)}) · (${rows(B)}×${cols(B)}) da una matriz de ${rows(P)}×${cols(P)}. Cada entrada es fila de A por columna de B.`, latex: `(AB)_{11} = ${e(0, 0)} = ${qtoLatex(P[0][0], fmt)}` },
        ],
        results: [{ label: 'AB', latex: `AB = ${L(P, fmt)} \\quad (${dim(P)})` }],
      };
    },
  },
  {
    id: 'mul-ba', label: 'B · A', group: 'dos', inputs: 'AB', hint: 'El producto no es conmutativo: compáralo con A·B.',
    run: ({ A, B, fmt }) => simple('Producto B·A', 'BA', `BA = ${L(mul(B, A), fmt)}`),
  },
];

export const opById = (id: string) => OPERATIONS.find((o) => o.id === id);

export const GROUPS: { id: Group; label: string }[] = [
  { id: 'sistema', label: 'Sistema Ax=b' },
  { id: 'una', label: 'Una matriz' },
  { id: 'dos', label: 'Dos matrices' },
];

