// Fracciones exactas con BigInt. Siempre normalizadas: den > 0 y gcd(num, den) = 1.

export interface Frac {
  readonly n: bigint;
  readonly d: bigint;
}

const abs = (x: bigint) => (x < 0n ? -x : x);

function gcd(a: bigint, b: bigint): bigint {
  a = abs(a);
  b = abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

export function frac(n: bigint | number, d: bigint | number = 1n): Frac {
  let N = BigInt(n);
  let D = BigInt(d);
  if (D === 0n) throw new Error('División entre cero.');
  if (D < 0n) {
    N = -N;
    D = -D;
  }
  const g = gcd(N, D) || 1n;
  return { n: N / g, d: D / g };
}

export const ZERO: Frac = { n: 0n, d: 1n };
export const ONE: Frac = { n: 1n, d: 1n };

export const fadd = (a: Frac, b: Frac) => frac(a.n * b.d + b.n * a.d, a.d * b.d);
export const fsub = (a: Frac, b: Frac) => frac(a.n * b.d - b.n * a.d, a.d * b.d);
export const fmul = (a: Frac, b: Frac) => frac(a.n * b.n, a.d * b.d);
export const fdiv = (a: Frac, b: Frac) => {
  if (b.n === 0n) throw new Error('División entre cero.');
  return frac(a.n * b.d, a.d * b.n);
};
export const fneg = (a: Frac): Frac => ({ n: -a.n, d: a.d });
export const fisZero = (a: Frac) => a.n === 0n;
export const feq = (a: Frac, b: Frac) => a.n === b.n && a.d === b.d;
export const fsign = (a: Frac) => (a.n > 0n ? 1 : a.n < 0n ? -1 : 0);

export function ftoNumber(a: Frac): number {
  // Evita perder precisión con numeradores enormes.
  const n = Number(a.n);
  const d = Number(a.d);
  if (Number.isFinite(n) && Number.isFinite(d)) return n / d;
  const shift = BigInt(Math.max(a.n.toString().length, a.d.toString().length) - 300);
  const s = 10n ** shift;
  return Number(a.n / s) / Number(a.d / s);
}

/** Convierte un literal decimal ("2.5", "-1e-3", ".75") a fracción exacta. */
export function fromDecimalString(s: string): Frac {
  const m = /^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(s);
  if (!m || (m[2] === '' && (m[3] ?? '') === '')) throw new Error(`'${s}' no es un número válido.`);
  const sign = m[1] === '-' ? -1n : 1n;
  const intPart = m[2] || '0';
  const decPart = m[3] ?? '';
  const exp = m[4] ? parseInt(m[4], 10) : 0;
  if (Math.abs(exp) > 300) throw new Error(`Exponente demasiado grande en '${s}'.`);
  let num = BigInt(intPart + decPart) * sign;
  let den = 10n ** BigInt(decPart.length);
  if (exp > 0) num *= 10n ** BigInt(exp);
  if (exp < 0) den *= 10n ** BigInt(-exp);
  return frac(num, den);
}

/** Aproxima un float por una fracción con denominador acotado (fracciones continuas). */
export function fromNumberApprox(x: number, maxDen = 1000n): Frac | null {
  if (!Number.isFinite(x)) return null;
  const sign = x < 0 ? -1n : 1n;
  let v = Math.abs(x);
  let [h0, h1, k0, k1] = [0n, 1n, 1n, 0n];
  for (let i = 0; i < 40; i++) {
    const a = Math.floor(v);
    if (a > 1e15) break;
    const A = BigInt(a);
    const h2 = A * h1 + h0;
    const k2 = A * k1 + k0;
    if (k2 > maxDen) break;
    [h0, h1, k0, k1] = [h1, h2, k1, k2];
    const frac_ = v - a;
    if (frac_ < 1e-12) break;
    v = 1 / frac_;
  }
  if (k1 === 0n) return null;
  return frac(sign * h1, k1);
}

export function ftoString(a: Frac): string {
  return a.d === 1n ? a.n.toString() : `${a.n}/${a.d}`;
}

export function ftoDecimal(a: Frac, decimals = 4): string {
  if (a.d === 1n) return a.n.toString();
  const x = ftoNumber(a);
  const s = x.toFixed(decimals).replace(/\.?0+$/, '');
  return s === '-0' ? '0' : s;
}
