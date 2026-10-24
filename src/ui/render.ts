// Dibuja un resultado (Computation) con KaTeX, aplica los límites del plan
// y genera el documento LaTeX del procedimiento.

import katex from 'katex';
import { h } from './dom';
import { Computation } from '../core/steps';

export function tex(latex: string, display = true): HTMLElement {
  const el = h('div', { class: 'math' });
  try {
    katex.render(latex, el, { displayMode: display, throwOnError: false, strict: 'ignore', output: 'htmlAndMathml' });
  } catch {
    el.textContent = latex;
  }
  return el;
}

/** Varias operaciones separadas por \\ necesitan un entorno en KaTeX. */
const wrapMulti = (s: string) => (s.includes('\\\\') && !s.includes('\\begin') ? `\\begin{gathered}${s}\\end{gathered}` : s);

export interface RenderOptions {
  onCopy(latex: string): void;
}

export function renderComputation(c: Computation, o: RenderOptions): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (const r of c.results) {
    out.push(h('div', { class: 'res-block' },
      tex(r.latex),
      h('button', { class: 'btn ghost sm copy', title: 'Copiar LaTeX', 'aria-label': `Copiar LaTeX de ${r.label}`, onclick: () => o.onCopy(r.latex) }, 'TeX'),
    ));
  }
  for (const n of c.notes ?? []) out.push(h('p', { class: 'note' }, n));

  if (c.steps.length) {
    out.push(h('h3', { class: 'steps-title' }, 'Paso a paso', h('span', { class: 'muted' }, `· ${c.steps.length} paso${c.steps.length > 1 ? 's' : ''}`)));
    const list = h('ol', { class: 'steps' });
    c.steps.forEach((s) => {
      list.append(h('li', { class: 'step' },
        h('p', {}, s.text),
        s.op ? h('div', { class: 'op' }, tex(wrapMulti(s.op))) : null,
        s.latex ? tex(s.latex) : null,
      ));
    });
    out.push(list);
  }
  return out;
}

const esc = (s: string) =>
  s.replace(/[\\{}&%$#_^~]/g, (ch) => ({ '\\': '\\textbackslash{}', '^': '\\textasciicircum{}', '~': '\\textasciitilde{}' })[ch] ?? `\\${ch}`);

/** Texto con símbolos unicode → seguro para LaTeX (pdflatex con inputenc utf8). */
function textLatex(s: string) {
  return esc(s)
    .replace(/λ/g, '$\\lambda$').replace(/≠/g, '$\\neq$').replace(/≥/g, '$\\geq$').replace(/≤/g, '$\\leq$')
    .replace(/−/g, '-').replace(/×/g, '$\\times$').replace(/Σ/g, '$\\Sigma$').replace(/‖/g, '$\\|$').replace(/κ/g, '$\\kappa$')
    .replace(/σ/g, '$\\sigma$').replace(/[ᵀᴴ⁻¹ᵢⱼⁿ₂…]/g, (ch) => ({ ᵀ: '$^T$', ᴴ: '$^H$', '⁻': '$^-$', '¹': '$^1$', ᵢ: '$_i$', ⱼ: '$_j$', ⁿ: '$^n$', '₂': '$_2$', '…': '\\ldots{}' })[ch] ?? ch);
}

export function computationToLatexDoc(c: Computation, title: string, inputs: string[]): string {
  const body: string[] = [];
  body.push(`\\section*{${textLatex(c.title)}}`);
  if (inputs.length) body.push('\\subsection*{Datos}', ...inputs.map((x) => `\\[ ${x} \\]`));
  body.push('\\subsection*{Resultado}', ...c.results.map((r) => `\\[ ${r.latex} \\]`));
  if (c.notes?.length) body.push('\\begin{itemize}', ...c.notes.map((n) => `\\item ${textLatex(n)}`), '\\end{itemize}');
  if (c.steps.length) {
    body.push('\\subsection*{Procedimiento}', '\\begin{enumerate}');
    for (const s of c.steps) {
      body.push(`\\item ${textLatex(s.text)}`);
      if (s.op) body.push(`\\[ ${wrapMulti(s.op)} \\]`);
      if (s.latex) body.push(`\\[ ${s.latex} \\]`);
    }
    body.push('\\end{enumerate}');
  }
  return [
    '\\documentclass[11pt]{article}',
    '\\usepackage[utf8]{inputenc}',
    '\\usepackage[spanish]{babel}',
    '\\usepackage{amsmath,amssymb}',
    '\\usepackage[margin=2cm]{geometry}',
    '\\setcounter{MaxMatrixCols}{20}',
    `\\title{${textLatex(title)}}`,
    '\\date{\\today}',
    '\\begin{document}',
    '\\maketitle',
    ...body,
    '\\vfill\\noindent{\\small Generado con Pivote.}',
    '\\end{document}',
    '',
  ].join('\n');
}
