import { describe, it, expect } from 'vitest';
import { parseScalar, qtoString, Q } from '../src/core/scalar';
import { parseMatrix, parseMatrixText, mul, identity, equals, power, Matrix } from '../src/core/matrix';
import {
  det, detByCofactors, detByElimination, inverseExact, solveSystemExact, cramer, luExact, rank, adjugate, rref, nullSpace,
} from '../src/core/elimination';
import { charPoly, eigenDecompose } from '../src/core/eigen';
import { eigenvaluesC, spectralNorm, conditionNumber, cabs, csub, C } from '../src/core/numeric';
import { toCMatrix } from '../src/core/eigen';

const M = (rows: string[][]) => parseMatrix(rows);
const s = (x: Q) => qtoString(x);
const close = (a: C, b: C, tol = 1e-8) => cabs(csub(a, b)) < tol;

describe('parser de escalares', () => {
  it.each([
    ['3', '3'], ['-2.5', '-5/2'], ['2,5', '5/2'], ['1/3', '1/3'], ['2+3i', '2 + 3i'], ['-i', '-i'], ['3j', '3i'],
    ['2(1+i)', '2 + 2i'], ['(1+i)^2', '2i'], ['1.5e-3', '3/2000'], ['i*2', '2i'], ['1/2 - 1/3i', '1/2 - 1/3i'],
    ['', '0'], ['−4', '-4'], ['.75', '3/4'], ['i^2', '-1'], ['1/(1+i)', '1/2 - 1/2i'],
  ])('%s → %s', (inp, out) => expect(s(parseScalar(inp))).toBe(out));

  it.each(['3x', 'abc', '2++', '1/0', '(1+2', '2^1.5', '1e999'])('rechaza "%s"', (inp) => {
    expect(() => parseScalar(inp)).toThrow();
  });
});

describe('texto pegado', () => {
  it('lee espacios, punto y coma, LaTeX y corchetes', () => {
    expect(parseMatrixText('1 2\n3 4')).toEqual([['1', '2'], ['3', '4']]);
    expect(parseMatrixText('1 -2; 3 4')).toEqual([['1', '-2'], ['3', '4']]);
    expect(parseMatrixText('1 2 + 3i\n4 5')).toEqual([['1', '2+3i'], ['4', '5']]);
    expect(parseMatrixText('\\begin{bmatrix} 1 & 2 \\\\ 3 & 4 \\end{bmatrix}')).toEqual([['1', '2'], ['3', '4']]);
    expect(parseMatrixText('[[1, 2], [3, 4]]')).toEqual([['1', '2'], ['3', '4']]);
  });
});

describe('determinante exacto', () => {
  const A = M([['2', '-1', '0'], ['-1', '2', '-1'], ['0', '-1', '2']]);
  it('3×3 tridiagonal = 4 por los tres métodos', () => {
    expect(s(det(A))).toBe('4');
    expect(detByCofactors(A).results[0].text).toBe('4');
    expect(detByElimination(A).results[0].text).toBe('4');
  });
  it('complejo', () => {
    expect(s(det(M([['1+i', '2'], ['3', '1-i']])))).toBe('-4');
  });
  it('requiere intercambio y conserva signo', () => {
    expect(s(det(M([['0', '1'], ['1', '0']])))).toBe('-1');
  });
  it('singular = 0', () => {
    expect(s(det(M([['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9']])))).toBe('0');
  });
  it('escala pequeña ya no se considera singular (error 4 de la auditoría)', () => {
    const tiny = M([['1e-7', '0'], ['0', '1e-7']]);
    expect(s(det(tiny))).toBe('1/100000000000000');
    expect(s(inverseExact(tiny)[0][0])).toBe('10000000');
  });
});

describe('inversa', () => {
  it('A·A⁻¹ = I (con complejos y fracciones)', () => {
    const A = M([['1', 'i', '0'], ['2', '1/2', '1'], ['0', '3', '1-i']]);
    expect(equals(mul(A, inverseExact(A)), identity(3))).toBe(true);
  });
  it('singular lanza error', () => {
    expect(() => inverseExact(M([['1', '2'], ['2', '4']]))).toThrow(/singular/);
  });
});

describe('sistemas lineales', () => {
  const b = (xs: string[]) => xs.map((x) => parseScalar(x));
  it('solución única', () => {
    const sol = solveSystemExact(M([['2', '1'], ['1', '3']]), b(['3', '5']));
    expect(sol.kind).toBe('unique');
    expect(sol.particular!.map(s)).toEqual(['4/5', '7/5']);
  });
  it('infinitas soluciones con forma paramétrica', () => {
    const sol = solveSystemExact(M([['1', '2', '3'], ['2', '4', '6']]), b(['6', '12']));
    expect(sol.kind).toBe('infinite');
    expect(sol.freeVars).toEqual([1, 2]);
    expect(sol.particular!.map(s)).toEqual(['6', '0', '0']);
    expect(sol.directions.map((d) => d.map(s))).toEqual([['-2', '1', '0'], ['-3', '0', '1']]);
  });
  it('incompatible', () => {
    expect(solveSystemExact(M([['1', '1'], ['1', '1']]), b(['1', '2'])).kind).toBe('none');
  });
  it('Cramer coincide', () => {
    const r = cramer(M([['2', '1'], ['1', '3']]), b(['3', '5']));
    expect(r.results[0].text).toBe('x1 = 4/5\nx2 = 7/5');
  });
});

describe('LU, rango, adjunta, espacio nulo', () => {
  it('PA = LU', () => {
    const A = M([['0', '2', '1'], ['1', '1', '1'], ['2', '1', '0']]);
    const { P, L, U } = luExact(A);
    expect(equals(mul(P, A), mul(L, U))).toBe(true);
  });
  it('rango', () => {
    expect(rank(M([['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9']]))).toBe(2);
    expect(rank(M([['1', '2'], ['3', '4'], ['5', '6']]))).toBe(2);
  });
  it('A·adj(A) = det(A)·I', () => {
    const A = M([['1', '2', '0'], ['3', '1', '4'], ['0', '5', '1']]);
    const P = mul(A, adjugate(A));
    expect(s(P[0][0])).toBe(s(det(A)));
    expect(s(P[0][1])).toBe('0');
  });
  it('RREF y espacio nulo', () => {
    const A = M([['1', '2', '1'], ['2', '4', '0']]);
    expect(rref(A).pivots).toEqual([0, 2]);
    expect(nullSpace(A).map((v) => v.map(s))).toEqual([['-2', '1', '0']]);
  });
  it('potencia', () => {
    expect(s(power(M([['1', '1'], ['0', '1']]), 10)[0][1])).toBe('10');
  });
});

describe('valores propios', () => {
  it('polinomio característico exacto', () => {
    // det(λI − A) para [[2,1],[1,2]] = λ² − 4λ + 3
    expect(charPoly(M([['2', '1'], ['1', '2']])).map(s)).toEqual(['3', '-4', '1']);
  });
  it('matriz compleja 3×3: la suma de λ es la traza (error 2 de la auditoría)', () => {
    const A = M([['i', '1', '2'], ['1+i', '2', '1'], ['0', '1', '1+i']]);
    const ev = eigenvaluesC(toCMatrix(A));
    const sum = ev.reduce((a, b) => ({ re: a.re + b.re, im: a.im + b.im }), { re: 0, im: 0 });
    expect(close(sum, { re: 3, im: 2 })).toBe(true);
  });
  it('rotación real: ±i exactos', () => {
    const pairs = eigenDecompose(M([['0', '-1', '0'], ['1', '0', '0'], ['0', '0', '2']]));
    expect(pairs.map((p) => p.exact && s(p.exact)).sort()).toEqual(['-i', '2', 'i']);
  });
  it('valor repetido con dos vectores (exactos)', () => {
    const pairs = eigenDecompose(M([['2', '0', '0'], ['0', '2', '0'], ['0', '0', '5']]));
    const two = pairs.find((p) => p.exact && s(p.exact) === '2')!;
    expect(two.algebraic).toBe(2);
    expect(two.vectors.length).toBe(2);
  });
  it('raíces irracionales: aproximadas y verificadas con Av = λv', () => {
    const A = M([['1', '2'], ['3', '4']]); // λ = (5 ± √33)/2
    const pairs = eigenDecompose(A);
    const Ac = toCMatrix(A);
    for (const p of pairs) {
      expect(p.exact).toBeUndefined();
      const v = p.vectors[0].approx;
      const Av = Ac.map((r) => r.reduce((acc, x, j) => ({ re: acc.re + x.re * v[j].re - x.im * v[j].im, im: acc.im + x.re * v[j].im + x.im * v[j].re }), { re: 0, im: 0 }));
      Av.forEach((y, i) => expect(close(y, { re: p.value.re * v[i].re - p.value.im * v[i].im, im: p.value.re * v[i].im + p.value.im * v[i].re }, 1e-7)).toBe(true));
    }
    expect(pairs.map((p) => p.value.re).sort((a, b) => a - b)[1]).toBeCloseTo((5 + Math.sqrt(33)) / 2, 10);
  });
  it('matriz aleatoria 8×8: traza y determinante coinciden con los λ', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 10 - 5;
    const A: Matrix = M(Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => `${Math.round(rnd())}+${Math.round(rnd())}i`)));
    const ev = eigenvaluesC(toCMatrix(A));
    const prod = ev.reduce((a, b) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re }), { re: 1, im: 0 });
    const d = det(A);
    const dC = { re: Number(d.re.n) / Number(d.re.d), im: Number(d.im.n) / Number(d.im.d) };
    expect(cabs(csub(prod, dC)) / cabs(dC)).toBeLessThan(1e-8);
  });
});

describe('normas (error 1 de la auditoría)', () => {
  it('norma espectral de diag(3,1) = 3', () => {
    expect(spectralNorm(toCMatrix(M([['3', '0'], ['0', '1']])))).toBeCloseTo(3, 12);
  });
  it('norma espectral usa la parte imaginaria', () => {
    expect(spectralNorm(toCMatrix(M([['2i', '0'], ['0', '1']])))).toBeCloseTo(2, 12);
  });
  it('número de condición', () => {
    expect(conditionNumber(toCMatrix(M([['3', '0'], ['0', '1']])))).toBeCloseTo(3, 10);
  });
});
