// Editor de matriz: cuadrícula de celdas con validación en vivo, navegación por
// teclado (flechas, Enter), dimensiones ajustables y pegado desde texto/LaTeX/Excel.

import { h, modal } from './dom';
import { parseScalar } from '../core/scalar';
import { parseMatrixText } from '../core/matrix';

export interface EditorOptions {
  name: string;
  cells: string[][];
  maxSize: number;
  lockCols?: number;
  lockRows?: number;
  onChange(cells: string[][]): void;
  /** Se llama cuando el usuario intenta pasar del tamaño máximo. */
  onTooBig(max: number): void;
}

export class MatrixEditor {
  readonly el: HTMLElement;
  private cells: string[][];
  private grid!: HTMLElement;
  private err!: HTMLElement;

  constructor(private o: EditorOptions) {
    this.cells = o.cells.map((r) => r.slice());
    this.el = h('section', { class: 'editor', 'aria-label': `Matriz ${o.name}` });
    this.render();
  }

  get value() {
    return this.cells.map((r) => r.slice());
  }

  set(cells: string[][]) {
    this.cells = cells.map((r) => r.slice());
    this.render();
  }

  update(opts: Partial<EditorOptions>) {
    this.o = { ...this.o, ...opts };
    const r = this.o.lockRows ?? this.cells.length;
    const c = this.o.lockCols ?? this.cells[0].length;
    if (r !== this.cells.length || c !== this.cells[0].length) this.resize(r, c, false);
    else this.render();
  }

  private emit() {
    this.o.onChange(this.value);
  }

  private resize(r: number, c: number, fromUser = true) {
    if (fromUser && (r > this.o.maxSize || c > this.o.maxSize)) {
      this.o.onTooBig(this.o.maxSize);
      return;
    }
    r = Math.max(1, Math.min(this.o.maxSize, r));
    c = Math.max(1, Math.min(this.o.maxSize, c));
    this.cells = Array.from({ length: r }, (_, i) => Array.from({ length: c }, (_, j) => this.cells[i]?.[j] ?? ''));
    this.render();
    this.emit();
  }

  private fill(fn: (i: number, j: number) => string) {
    this.cells = this.cells.map((r, i) => r.map((_, j) => fn(i, j)));
    this.render();
    this.emit();
  }

  private stepper(label: string, value: number, set: (v: number) => void, locked: boolean) {
    if (locked) return h('span', { class: 'stepper', 'aria-label': `${label}: ${value}` }, h('span', {}, String(value)));
    return h('span', { class: 'stepper', role: 'group', 'aria-label': label },
      h('button', { type: 'button', 'aria-label': `Quitar ${label.toLowerCase()}`, onclick: () => set(value - 1) }, '−'),
      h('span', { 'aria-live': 'polite' }, String(value)),
      h('button', { type: 'button', 'aria-label': `Agregar ${label.toLowerCase()}`, onclick: () => set(value + 1) }, '+'),
    );
  }

  private openPaste() {
    const ta = h('textarea', { class: 'paste', placeholder: '1 2 3\n4 5 6\n7 8 10\n\nTambién: [[1,2],[3,4]], 1 2; 3 4, celdas de Excel o \\begin{bmatrix}…' }) as HTMLTextAreaElement;
    const msg = h('p', { class: 'muted' }, 'Filas por renglón o «;». Columnas por espacio, tabulador, coma o «&». Expresiones como 2 + 3i o 1/3 son válidas.');
    const dlg = modal(`Pegar matriz ${this.o.name}`, [
      ta, msg,
      h('div', { class: 'row' }, h('button', {
        class: 'btn primary', onclick: () => {
          const rowsTxt = parseMatrixText(ta.value);
          if (!rowsTxt.length) return;
          const r = this.o.lockRows ?? rowsTxt.length;
          const c = this.o.lockCols ?? Math.max(...rowsTxt.map((x) => x.length));
          if (r > this.o.maxSize || c > this.o.maxSize) {
            this.o.onTooBig(this.o.maxSize);
            return;
          }
          this.cells = Array.from({ length: r }, (_, i) => Array.from({ length: c }, (_, j) => rowsTxt[i]?.[j] ?? ''));
          this.render();
          this.emit();
          dlg.close();
        },
      }, 'Usar esta matriz')),
    ]);
    ta.focus();
  }

  private move(i: number, j: number) {
    const inp = this.grid.querySelector<HTMLInputElement>(`[data-i="${i}"][data-j="${j}"]`);
    if (inp) { inp.focus(); inp.select(); }
  }

  private validate(inp: HTMLInputElement) {
    try {
      parseScalar(inp.value);
      inp.removeAttribute('aria-invalid');
      return null;
    } catch (e) {
      inp.setAttribute('aria-invalid', 'true');
      return (e as Error).message;
    }
  }

  private refreshError() {
    const bad = [...this.grid.querySelectorAll<HTMLInputElement>('.cell')].map((x) => this.validate(x)).find(Boolean);
    this.err.textContent = bad ?? '';
    this.err.hidden = !bad;
  }

  render() {
    const { name } = this.o;
    const R = this.cells.length, Cc = this.cells[0].length;
    const isVector = this.o.lockCols === 1;
    this.grid = h('div', { class: 'mgrid', style: `grid-template-columns: repeat(${Cc}, minmax(${Cc > 5 ? 64 : 52}px, 1fr))` });
    this.cells.forEach((row, i) => row.forEach((v, j) => {
      const inp = h('input', {
        class: 'cell', value: v, inputmode: 'text', autocomplete: 'off', spellcheck: 'false', placeholder: '0',
        'aria-label': isVector ? `${name} entrada ${i + 1}` : `${name} fila ${i + 1} columna ${j + 1}`, 'data-i': i, 'data-j': j,
      }) as HTMLInputElement;
      inp.addEventListener('input', () => {
        this.cells[i][j] = inp.value;
        this.validate(inp);
        this.emit();
      });
      inp.addEventListener('blur', () => this.refreshError());
      inp.addEventListener('keydown', (e) => {
        const atStart = inp.selectionStart === 0 && inp.selectionEnd === 0;
        const atEnd = inp.selectionStart === inp.value.length;
        if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); this.move(i + 1 < R ? i + 1 : 0, i + 1 < R ? j : (j + 1) % Cc); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); this.move(i + 1, j); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); this.move(i - 1, j); }
        else if (e.key === 'ArrowRight' && atEnd) { e.preventDefault(); this.move(i, j + 1); }
        else if (e.key === 'ArrowLeft' && atStart) { e.preventDefault(); this.move(i, j - 1); }
      });
      // Pegar un bloque desde Excel/Sheets directamente en una celda
      inp.addEventListener('paste', (e) => {
        const text = e.clipboardData?.getData('text') ?? '';
        if (!/[\t\n]/.test(text.trim())) return;
        e.preventDefault();
        const block = parseMatrixText(text);
        const needR = this.o.lockRows ?? Math.max(R, i + block.length);
        const needC = this.o.lockCols ?? Math.max(Cc, j + Math.max(...block.map((x) => x.length)));
        if (needR > this.o.maxSize || needC > this.o.maxSize) { this.o.onTooBig(this.o.maxSize); return; }
        this.cells = Array.from({ length: needR }, (_, a) => Array.from({ length: needC }, (_, b) => block[a - i]?.[b - j] ?? this.cells[a]?.[b] ?? ''));
        this.render();
        this.emit();
      });
      this.grid.append(inp);
    }));
    this.err = h('p', { class: 'editor-error', role: 'alert', hidden: true });

    const tool = (label: string, title: string, fn: () => void) => h('button', { type: 'button', class: 'btn ghost sm', title, 'aria-label': title, onclick: fn }, label);
    const square = R === Cc;
    const tools = h('div', { class: 'editor-tools' },
      square && !isVector ? tool('I', 'Llenar con la identidad', () => this.fill((a, b) => (a === b ? '1' : '0'))) : null,
      tool('0', 'Llenar con ceros', () => this.fill(() => '0')),
      tool('🎲', 'Valores aleatorios', () => this.fill(() => String(Math.floor(Math.random() * 19) - 9))),
      tool('📋', 'Pegar desde texto, Excel o LaTeX', () => this.openPaste()),
      tool('⌫', 'Vaciar', () => this.fill(() => '')),
    );

    const dims = h('div', { class: 'dims' },
      this.stepper('Filas', R, (v) => this.resize(v, Cc), this.o.lockRows !== undefined),
      h('span', { 'aria-hidden': 'true' }, '×'),
      this.stepper('Columnas', Cc, (v) => this.resize(R, v), this.o.lockCols !== undefined),
    );

    this.el.replaceChildren(
      h('div', { class: 'editor-head' }, h('span', { class: 'editor-name' }, name), dims, tools),
      h('div', { class: 'grid-wrap' }, this.grid),
      this.err,
    );
  }
}
