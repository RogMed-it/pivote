// Métodos numéricos en punto flotante complejo: valores y vectores propios,
// norma espectral, número de condición. Aquí sí hay aproximación, así que todas
// las tolerancias son RELATIVAS a la escala de la matriz.

export interface C { re: number; im: number }
export type CMatrix = C[][];

export const c = (re: number, im = 0): C => ({ re, im });
export const cadd = (a: C, b: C): C => ({ re: a.re + b.re, im: a.im + b.im });
export const csub = (a: C, b: C): C => ({ re: a.re - b.re, im: a.im - b.im });
export const cmul = (a: C, b: C): C => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
export const cconj = (a: C): C => ({ re: a.re, im: -a.im });
export const cabs = (a: C) => Math.hypot(a.re, a.im);
export const cscale = (a: C, k: number): C => ({ re: a.re * k, im: a.im * k });
export function cdiv(a: C, b: C): C {
  // División de Smith: evita overflow/underflow intermedio.
  if (Math.abs(b.re) >= Math.abs(b.im)) {
    const r = b.im / b.re, d = b.re + b.im * r;
    return { re: (a.re + a.im * r) / d, im: (a.im - a.re * r) / d };
  }
  const r = b.re / b.im, d = b.re * r + b.im;
  return { re: (a.re * r + a.im) / d, im: (a.im * r - a.re) / d };
}
export function csqrt(z: C): C {
  const r = cabs(z);
  if (r === 0) return c(0);
  const re = Math.sqrt((r + z.re) / 2);
  const im = Math.sqrt(Math.max(0, (r - z.re) / 2));
  return { re, im: z.im < 0 ? -im : im };
}

const EPS = Number.EPSILON;

export function normFro(A: CMatrix) {
  return Math.sqrt(A.reduce((s, r) => s + r.reduce((t, x) => t + x.re * x.re + x.im * x.im, 0), 0));
}

const cloneC = (A: CMatrix) => A.map((r) => r.map((x) => ({ ...x })));

/** Reducción a forma de Hessenberg superior con reflexiones de Householder complejas. */
function hessenberg(A0: CMatrix): CMatrix {
  const A = cloneC(A0);
  const n = A.length;
  for (let k = 0; k < n - 2; k++) {
    let alpha = 0;
    for (let i = k + 1; i < n; i++) alpha += A[i][k].re ** 2 + A[i][k].im ** 2;
    alpha = Math.sqrt(alpha);
    if (alpha < EPS) continue;
    const x0 = A[k + 1][k];
    const ph = cabs(x0) > 0 ? cscale(x0, 1 / cabs(x0)) : c(1);
    const v: C[] = Array.from({ length: n }, () => c(0));
    v[k + 1] = cadd(x0, cscale(ph, alpha));
    for (let i = k + 2; i < n; i++) v[i] = { ...A[i][k] };
    let vn = 0;
    for (let i = k + 1; i < n; i++) vn += v[i].re ** 2 + v[i].im ** 2;
    if (vn < EPS * EPS) continue;
    // A ← H A, con H = I − 2vvᴴ/(vᴴv)
    for (let j = 0; j < n; j++) {
      let s = c(0);
      for (let i = k + 1; i < n; i++) s = cadd(s, cmul(cconj(v[i]), A[i][j]));
      s = cscale(s, 2 / vn);
      for (let i = k + 1; i < n; i++) A[i][j] = csub(A[i][j], cmul(v[i], s));
    }
    // A ← A H
    for (let i = 0; i < n; i++) {
      let s = c(0);
      for (let j = k + 1; j < n; j++) s = cadd(s, cmul(A[i][j], v[j]));
      s = cscale(s, 2 / vn);
      for (let j = k + 1; j < n; j++) A[i][j] = csub(A[i][j], cmul(s, cconj(v[j])));
    }
    for (let i = k + 2; i < n; i++) A[i][k] = c(0);
  }
  return A;
}

/** Valor propio del bloque 2×2 [[a,b],[c,d]] más cercano a d (desplazamiento de Wilkinson). */
function wilkinson(a: C, b: C, cc: C, d: C): C {
  const tr = cadd(a, d);
  const dt = csub(cmul(a, d), cmul(b, cc));
  const half = cscale(tr, 0.5);
  const disc = csqrt(csub(cmul(half, half), dt));
  const l1 = cadd(half, disc), l2 = csub(half, disc);
  return cabs(csub(l1, d)) < cabs(csub(l2, d)) ? l1 : l2;
}

/**
 * Valores propios por QR desplazado (Wilkinson) sobre la forma de Hessenberg,
 * con rotaciones de Givens complejas y deflación. Funciona igual para matrices
 * reales y complejas, y encuentra pares conjugados de matrices reales.
 */
export function eigenvaluesC(A0: CMatrix): C[] {
  const n = A0.length;
  if (n === 0) return [];
  const H = hessenberg(A0);
  const scale = normFro(A0) || 1;
  const eig: C[] = [];
  let m = n; // tamaño del bloque activo
  let iter = 0;
  while (m > 0) {
    if (m === 1) { eig.push(H[0][0]); break; }
    const sub = cabs(H[m - 1][m - 2]);
    if (sub <= EPS * (cabs(H[m - 1][m - 1]) + cabs(H[m - 2][m - 2])) || sub < EPS * scale * 1e-3) {
      eig.push(H[m - 1][m - 1]);
      H[m - 1][m - 2] = c(0);
      m--;
      iter = 0;
      continue;
    }
    if (++iter > 1000) throw new Error('El método QR no convergió.');
    // Desplazamiento de Wilkinson, con uno excepcional cada 11 iteraciones.
    let mu = wilkinson(H[m - 2][m - 2], H[m - 2][m - 1], H[m - 1][m - 2], H[m - 1][m - 1]);
    if (iter % 11 === 0) mu = cadd(H[m - 1][m - 1], c(sub * 0.75, sub * 0.5));
    for (let i = 0; i < m; i++) H[i][i] = csub(H[i][i], mu);
    // QR por Givens: H = QR, luego H ← RQ
    const rots: { cs: number; sn: C }[] = [];
    for (let k = 0; k < m - 1; k++) {
      const a = H[k][k], b = H[k + 1][k];
      const r = Math.hypot(cabs(a), cabs(b));
      let cs: number, sn: C;
      if (r === 0) { cs = 1; sn = c(0); }
      else if (cabs(a) === 0) { cs = 0; sn = cdiv(cconj(b), c(cabs(b))); }
      else {
        cs = cabs(a) / r;
        const ph = cscale(a, 1 / cabs(a));
        sn = cscale(cmul(ph, cconj(b)), 1 / r);
      }
      rots.push({ cs, sn });
      // Filas k, k+1: [cs, sn; -conj(sn), cs]
      for (let j = k; j < m; j++) {
        const x = H[k][j], y = H[k + 1][j];
        H[k][j] = cadd(cscale(x, cs), cmul(sn, y));
        H[k + 1][j] = csub(cscale(y, cs), cmul(cconj(sn), x));
      }
    }
    for (let k = 0; k < m - 1; k++) {
      const { cs, sn } = rots[k];
      // Columnas k, k+1: multiplicar por la adjunta de la rotación
      for (let i = 0; i <= Math.min(k + 1, m - 1); i++) {
        const x = H[i][k], y = H[i][k + 1];
        H[i][k] = cadd(cscale(x, cs), cmul(cconj(sn), y));
        H[i][k + 1] = csub(cscale(y, cs), cmul(sn, x));
      }
    }
    for (let i = 0; i < m; i++) H[i][i] = cadd(H[i][i], mu);
  }
  return eig.reverse();
}

/** Resuelve (A − σI)x = b con LU de pivoteo parcial. */
function solveShifted(A: CMatrix, sigma: C, b: C[]): C[] {
  const n = A.length;
  const M = A.map((r, i) => r.map((x, j) => (i === j ? csub(x, sigma) : { ...x })));
  const x = b.map((v) => ({ ...v }));
  const tiny = EPS * (normFro(A) || 1);
  for (let k = 0; k < n; k++) {
    let p = k;
    for (let i = k + 1; i < n; i++) if (cabs(M[i][k]) > cabs(M[p][k])) p = i;
    [M[k], M[p]] = [M[p], M[k]];
    [x[k], x[p]] = [x[p], x[k]];
    if (cabs(M[k][k]) < tiny) M[k][k] = c(tiny);
    for (let i = k + 1; i < n; i++) {
      const f = cdiv(M[i][k], M[k][k]);
      for (let j = k; j < n; j++) M[i][j] = csub(M[i][j], cmul(f, M[k][j]));
      x[i] = csub(x[i], cmul(f, x[k]));
    }
  }
  for (let i = n - 1; i >= 0; i--) {
    let s = x[i];
    for (let j = i + 1; j < n; j++) s = csub(s, cmul(M[i][j], x[j]));
    x[i] = cdiv(s, M[i][i]);
  }
  return x;
}

/** Normaliza: norma 2 = 1 y la componente de mayor módulo real positiva. */
export function normalizeVec(v: C[]): C[] {
  let big = v[0];
  for (const x of v) if (cabs(x) > cabs(big) + 1e-12) big = x;
  const ph = cabs(big) > 0 ? cdiv(c(cabs(big)), big) : c(1);
  const w = v.map((x) => cmul(x, ph));
  const n = Math.sqrt(w.reduce((s, x) => s + x.re ** 2 + x.im ** 2, 0)) || 1;
  return w.map((x) => cscale(x, 1 / n));
}

/** Vector propio por iteración inversa. */
export function eigenvectorC(A: CMatrix, lambda: C): C[] {
  const n = A.length;
  const scale = normFro(A) || 1;
  const sigma = cadd(lambda, c(scale * 1e-10, scale * 1e-10));
  let v: C[] = Array.from({ length: n }, (_, i) => c(1 / Math.sqrt(n), (i % 2) * 0.1));
  for (let it = 0; it < 4; it++) v = normalizeVec(solveShifted(A, sigma, v));
  return v;
}

/** Valores singulares: raíces de los valores propios de AᴴA (Hermitiana, valores reales ≥ 0). */
export function singularValues(A: CMatrix): number[] {
  const m = A.length, n = A[0]?.length ?? 0;
  const AhA: CMatrix = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => {
    let s = c(0);
    for (let k = 0; k < m; k++) s = cadd(s, cmul(cconj(A[k][i]), A[k][j]));
    return s;
  }));
  return eigenvaluesC(AhA).map((z) => Math.sqrt(Math.max(0, z.re))).sort((a, b) => b - a);
}

export const spectralNorm = (A: CMatrix) => singularValues(A)[0] ?? 0;

export function conditionNumber(A: CMatrix): number {
  const s = singularValues(A);
  const min = s[s.length - 1];
  return min === 0 || min < EPS * s[0] ? Infinity : s[0] / min;
}

export function fmtC(z: C, decimals = 4): string {
  const tol = 10 ** -(decimals + 1);
  const r = (x: number) => {
    const s = (Math.abs(x) < tol ? 0 : x).toFixed(decimals).replace(/\.?0+$/, '');
    return s === '-0' ? '0' : s;
  };
  const re = Math.abs(z.re) < tol ? 0 : z.re;
  const im = Math.abs(z.im) < tol ? 0 : z.im;
  if (im === 0) return r(re);
  const imAbs = r(Math.abs(im));
  const imTxt = imAbs === '1' ? 'i' : `${imAbs}i`;
  if (re === 0) return (im < 0 ? '-' : '') + imTxt;
  return `${r(re)} ${im < 0 ? '-' : '+'} ${imTxt}`;
}
