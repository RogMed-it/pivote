// Escalares exactos: números complejos con partes racionales (a + b·i, a, b ∈ ℚ).
// Toda la eliminación (determinantes, inversas, RREF, sistemas) usa este tipo,
// así que los resultados son exactos y no dependen de tolerancias.

import {
  Frac, ZERO, ONE, frac, fadd, fsub, fmul, fdiv, fneg, fisZero, feq, ftoNumber,
  fromDecimalString, ftoString, ftoDecimal, fsign,
} from './rational';

export interface Q {
  readonly re: Frac;
  readonly im: Frac;
}

export const q = (re: Frac, im: Frac = ZERO): Q => ({ re, im });
export const qint = (n: number | bigint): Q => q(frac(n));
export const Q0: Q = q(ZERO);
export const Q1: Q = q(ONE);
export const QI: Q = q(ZERO, ONE);

export const qadd = (a: Q, b: Q) => q(fadd(a.re, b.re), fadd(a.im, b.im));
export const qsub = (a: Q, b: Q) => q(fsub(a.re, b.re), fsub(a.im, b.im));
export const qneg = (a: Q) => q(fneg(a.re), fneg(a.im));
export const qconj = (a: Q) => q(a.re, fneg(a.im));
export const qmul = (a: Q, b: Q) =>
  q(fsub(fmul(a.re, b.re), fmul(a.im, b.im)), fadd(fmul(a.re, b.im), fmul(a.im, b.re)));
export function qdiv(a: Q, b: Q): Q {
  const den = fadd(fmul(b.re, b.re), fmul(b.im, b.im));
  if (fisZero(den)) throw new Error('División entre cero.');
  const num = qmul(a, qconj(b));
  return q(fdiv(num.re, den), fdiv(num.im, den));
}
export const qinv = (a: Q) => qdiv(Q1, a);
export const qisZero = (a: Q) => fisZero(a.re) && fisZero(a.im);
export const qisReal = (a: Q) => fisZero(a.im);
export const qeq = (a: Q, b: Q) => feq(a.re, b.re) && feq(a.im, b.im);
export const qisOne = (a: Q) => qeq(a, Q1);

export function qpow(a: Q, k: number): Q {
  if (!Number.isInteger(k)) throw new Error('Solo se permiten potencias enteras.');
  if (k < 0) return qinv(qpow(a, -k));
  let r = Q1;
  let b = a;
  while (k > 0) {
    if (k & 1) r = qmul(r, b);
    b = qmul(b, b);
    k >>= 1;
  }
  return r;
}

/** Valor complejo de punto flotante (para métodos numéricos). */
export const qtoC = (a: Q): { re: number; im: number } => ({ re: ftoNumber(a.re), im: ftoNumber(a.im) });

// ── Formato ─────────────────────────────────────────────────────────

export interface FormatOptions {
  /** 'frac' muestra fracciones exactas, 'dec' decimales. */
  mode: 'frac' | 'dec';
  decimals: number;
}

export const DEFAULT_FMT: FormatOptions = { mode: 'frac', decimals: 4 };

function fpart(f: Frac, o: FormatOptions) {
  return o.mode === 'frac' ? ftoString(f) : ftoDecimal(f, o.decimals);
}

export function qtoString(a: Q, o: FormatOptions = DEFAULT_FMT): string {
  const absIm = fsign(a.im) < 0 ? fneg(a.im) : a.im;
  const imTxt = feq(absIm, ONE) ? 'i' : `${fpart(absIm, o)}i`;
  if (fisZero(a.im)) return fpart(a.re, o);
  if (fisZero(a.re)) return (fsign(a.im) < 0 ? '-' : '') + imTxt;
  return `${fpart(a.re, o)} ${fsign(a.im) < 0 ? '-' : '+'} ${imTxt}`;
}

function flatex(f: Frac, o: FormatOptions): string {
  if (o.mode === 'dec' || f.d === 1n) return fpart(f, o);
  const n = f.n < 0n ? -f.n : f.n;
  return `${f.n < 0n ? '-' : ''}\\frac{${n}}{${f.d}}`;
}

export function qtoLatex(a: Q, o: FormatOptions = DEFAULT_FMT): string {
  const absIm = fsign(a.im) < 0 ? fneg(a.im) : a.im;
  const imTxt = feq(absIm, ONE) ? 'i' : `${flatex(absIm, o)}i`;
  if (fisZero(a.im)) return flatex(a.re, o);
  if (fisZero(a.re)) return (fsign(a.im) < 0 ? '-' : '') + imTxt;
  return `${flatex(a.re, o)} ${fsign(a.im) < 0 ? '-' : '+'} ${imTxt}`;
}

/** Para coeficientes dentro de una expresión: agrega paréntesis si es complejo con dos partes. */
export function qtoLatexFactor(a: Q, o: FormatOptions = DEFAULT_FMT): string {
  const s = qtoLatex(a, o);
  return !fisZero(a.re) && !fisZero(a.im) ? `\\left(${s}\\right)` : s;
}

// ── Parser ──────────────────────────────────────────────────────────
// Gramática (descenso recursivo):
//   expr   := term (('+'|'-') term)*
//   term   := unary (('*'|'/') unary | implicit)*
//   unary  := ('+'|'-') unary | power
//   power  := atom ('^' unary)?
//   atom   := number | 'i' | 'j' | '(' expr ')'
// Acepta: 3, -2.5, 2,5, 1/3, 2+3i, -i, 3i, 2(1+i), (1+i)^2, 1.5e-3, i*2, 1/2 - 1/3i

type Tok = { t: 'num'; v: string } | { t: 'i' } | { t: 'op'; v: string };

function tokenize(src: string): Tok[] {
  const s = src.replace(/[−–]/g, '-').replace(/[·×]/g, '*').replace(/÷/g, '/');
  const toks: Tok[] = [];
  let k = 0;
  while (k < s.length) {
    const ch = s[k];
    if (/\s/.test(ch)) { k++; continue; }
    const num = /^(\d+(?:[.,]\d*)?|[.,]\d+)(?:e[+-]?\d+)?/i.exec(s.slice(k));
    if (num) {
      toks.push({ t: 'num', v: num[0].replace(',', '.') });
      k += num[0].length;
      continue;
    }
    if (ch === 'i' || ch === 'j' || ch === 'I' || ch === 'J') { toks.push({ t: 'i' }); k++; continue; }
    if ('+-*/^()'.includes(ch)) { toks.push({ t: 'op', v: ch }); k++; continue; }
    throw new Error(`Carácter no válido '${ch}' en '${src}'.`);
  }
  return toks;
}

export function parseScalar(src: string): Q {
  const text = src.trim();
  if (text === '') return Q0;
  const toks = tokenize(text);
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => peek()?.t === 'op' && (peek() as { v: string }).v === v;
  const fail = (): never => {
    throw new Error(`No se pudo interpretar '${src}' como número.`);
  };

  function atom(): Q {
    const tk = peek();
    if (!tk) return fail();
    if (tk.t === 'num') { p++; return q(fromDecimalString(tk.v)); }
    if (tk.t === 'i') { p++; return QI; }
    if (isOp('(')) {
      p++;
      const v = expr();
      if (!isOp(')')) fail();
      p++;
      return v;
    }
    return fail();
  }
  function power(): Q {
    const base = atom();
    if (isOp('^')) {
      p++;
      const e = unary();
      if (!qisReal(e) || e.re.d !== 1n || e.re.n > 64n || e.re.n < -64n) {
        throw new Error('El exponente debe ser un entero entre -64 y 64.');
      }
      return qpow(base, Number(e.re.n));
    }
    return base;
  }
  function unary(): Q {
    if (isOp('-')) { p++; return qneg(unary()); }
    if (isOp('+')) { p++; return unary(); }
    return power();
  }
  function term(): Q {
    let v = unary();
    for (;;) {
      if (isOp('*')) { p++; v = qmul(v, unary()); }
      else if (isOp('/')) { p++; v = qdiv(v, unary()); }
      else if (peek() && (peek()!.t === 'i' || peek()!.t === 'num' || isOp('('))) v = qmul(v, power());
      else return v;
    }
  }
  function expr(): Q {
    let v = term();
    for (;;) {
      if (isOp('+')) { p++; v = qadd(v, term()); }
      else if (isOp('-')) { p++; v = qsub(v, term()); }
      else return v;
    }
  }

  const v = expr();
  if (p !== toks.length) fail();
  return v;
}
