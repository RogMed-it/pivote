import 'katex/dist/katex.min.css';
import './styles.css';

import { h, modal, toast, copyText, download, store } from './ui/dom';
import { MatrixEditor } from './ui/matrixEditor';
import { renderComputation, computationToLatexDoc, tex } from './ui/render';
import { OPERATIONS, GROUPS, Group, Operation, opById } from './app/operations';
import { parseMatrix, rows, cols, toLatex } from './core/matrix';
import { parseScalar, FormatOptions } from './core/scalar';
import { Computation } from './core/steps';
import { MAX_SIZE, LOCAL_HISTORY } from './shared/limits';
import { CLOUD_ENABLED, DEMO } from './services/config';
import { initAccount, onAccountChange, getAccount, signInWithEmail, signInWithGoogle, signOut, saveProfile } from './services/account';
import { listHistory, saveHistory, deleteHistory, encodeShare, decodeShare, cloudOn, SavedInput, HistoryItem } from './services/history';
import { adSlot } from './ui/ads';

// ── Estado ─────────────────────────────────────────────────────────

interface Draft {
  group: Group;
  op: string;
  A: string[][];
  B: string[][];
  k: string;
  p: number;
  fmt: FormatOptions;
}

const blank = (r: number, c: number) => Array.from({ length: r }, () => Array.from({ length: c }, () => ''));
const EXAMPLE_A = [['2', '1', '-1'], ['-3', '-1', '2'], ['-2', '1', '2']];
const EXAMPLE_B = [['8'], ['-11'], ['-3']];

const draft: Draft = store.get<Draft>('pivote.draft', {
  group: 'sistema', op: 'gauss-jordan', A: EXAMPLE_A, B: EXAMPLE_B, k: '2', p: 2, fmt: { mode: 'frac', decimals: 4 },
});
// Un enlace compartido tiene prioridad sobre el borrador.
const shared = new URLSearchParams(location.hash.slice(1)).get('c');
const fromShare = shared ? decodeShare(shared) : null;
if (fromShare && opById(fromShare.op)) {
  Object.assign(draft, { op: fromShare.op, group: opById(fromShare.op)!.group, A: fromShare.A, B: fromShare.B, k: fromShare.k ?? '2', p: fromShare.p ?? 2 });
}

let last: { comp: Computation; input: SavedInput; title: string } | null = null;

const saveDraft = () => store.set('pivote.draft', draft);
const currentOp = (): Operation => opById(draft.op) ?? OPERATIONS[0];

// ── Encabezado ─────────────────────────────────────────────────────

const accountBtn = h('button', { class: 'btn', onclick: () => openAccount() }, 'Entrar');
const themeBtn = h('button', {
  class: 'btn ghost icon', 'aria-label': 'Cambiar tema', title: 'Cambiar tema claro/oscuro',
  onclick: () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('pivote.theme', next); } catch { /* opcional */ }
  },
});
themeBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/></svg>';

const topbar = h('header', { class: 'topbar' },
  h('a', { class: 'brand', href: '/' }, h('img', { src: '/favicon.svg', alt: '' }), 'Pivote', h('small', {}, 'Álgebra lineal paso a paso')),
  h('div', { class: 'spacer' }),
  h('button', { class: 'btn ghost', onclick: () => openHistory() }, '🕘', h('span', { class: 'hide-sm' }, 'Historial')),
  themeBtn, CLOUD_ENABLED ? accountBtn : null,
);

// ── Espacio de trabajo ─────────────────────────────────────────────

const groupBar = h('div', { class: 'segmented', role: 'group', 'aria-label': 'Tipo de operación' });
const opsBar = h('div', { class: 'ops', role: 'group', 'aria-label': 'Operación' });
const hint = h('p', { class: 'op-hint' });
const editorsBox = h('div', { class: 'row', style: 'flex-direction:column;align-items:stretch;gap:12px' });
const extraBox = h('div', { class: 'row extra' });

const tooBig = (max: number) => toast(`El tamaño máximo es ${max}×${max}.`);

const edA = new MatrixEditor({
  name: 'A', cells: draft.A, maxSize: MAX_SIZE,
  onChange: (c) => {
    draft.A = c;
    if (currentOp().inputs === 'Ab') edB.update({ lockRows: c.length });
    saveDraft();
  },
  onTooBig: tooBig,
});
const edB = new MatrixEditor({
  name: 'B', cells: draft.B, maxSize: MAX_SIZE,
  onChange: (c) => { draft.B = c; saveDraft(); },
  onTooBig: tooBig,
});

const fmtSelect = h('select', { 'aria-label': 'Formato de números' },
  h('option', { value: 'frac' }, 'Fracciones exactas'),
  h('option', { value: 'dec' }, 'Decimales'),
) as HTMLSelectElement;
fmtSelect.value = draft.fmt.mode;
fmtSelect.addEventListener('change', () => {
  draft.fmt.mode = fmtSelect.value as 'frac' | 'dec';
  saveDraft();
  if (last) calculate();
});

const calcBtn = h('button', { class: 'btn primary', onclick: () => calculate() }, 'Calcular');

const workspace = h('aside', { class: 'panel workspace', 'aria-label': 'Entrada' },
  h('div', {}, h('p', { class: 'section-label' }, 'Operación'), groupBar, h('div', { style: 'height:10px' }), opsBar, hint),
  h('div', {}, h('p', { class: 'section-label' }, 'Datos'), editorsBox),
  extraBox,
  h('div', { class: 'row' }, h('label', { class: 'field' }, 'Mostrar resultados en', fmtSelect)),
  h('div', { class: 'calc-bar' }, calcBtn, h('span', { class: 'kbd hide-sm', title: 'Atajo de teclado' }, 'Ctrl + Enter')),
);

function renderControls() {
  const op = currentOp();
  groupBar.replaceChildren(...GROUPS.map((g) => h('button', {
    type: 'button', 'aria-pressed': String(g.id === draft.group),
    onclick: () => {
      draft.group = g.id;
      draft.op = OPERATIONS.find((o) => o.group === g.id)!.id;
      if (g.id === 'dos' && (draft.B[0]?.length ?? 0) === 1) draft.B = blank(draft.A.length, draft.A[0].length);
      saveDraft();
      renderControls();
    },
  }, g.label)));
  opsBar.replaceChildren(...OPERATIONS.filter((o) => o.group === draft.group).map((o) => h('button', {
    type: 'button', class: 'op-chip', 'aria-pressed': String(o.id === draft.op),
    onclick: () => { draft.op = o.id; saveDraft(); renderControls(); },
  }, o.label)));
  hint.textContent = op.hint;

  if (op.inputs === 'A') {
    editorsBox.replaceChildren(edA.el);
  } else if (op.inputs === 'Ab') {
    edB.update({ name: 'b', lockCols: 1, lockRows: draft.A.length });
    editorsBox.replaceChildren(edA.el, edB.el);
  } else {
    edB.update({ name: 'B', lockCols: undefined, lockRows: undefined });
    editorsBox.replaceChildren(edA.el, edB.el);
  }

  extraBox.replaceChildren();
  if (op.extra === 'k') {
    const inp = h('input', { value: draft.k, 'aria-label': 'Escalar k', oninput: (e: Event) => { draft.k = (e.target as HTMLInputElement).value; saveDraft(); } });
    extraBox.append(h('label', { class: 'field' }, 'Escalar k', inp));
  }
  if (op.extra === 'p') {
    const inp = h('input', { type: 'number', min: 0, max: 50, value: draft.p, 'aria-label': 'Exponente p', oninput: (e: Event) => { draft.p = Number((e.target as HTMLInputElement).value); saveDraft(); } });
    extraBox.append(h('label', { class: 'field' }, 'Exponente p', inp));
  }
  extraBox.hidden = !op.extra;
}

// ── Resultados ─────────────────────────────────────────────────────

const results = h('main', { class: 'panel results', id: 'resultados', 'aria-live': 'polite' });
const resultAd = adSlot('result', 'ad-result');

function renderEmpty() {
  results.replaceChildren(h('div', { class: 'empty' }, h('div', {},
    h('h2', {}, 'Escribe tu matriz y presiona Calcular'),
    h('p', {}, 'Ya cargamos un sistema de ejemplo. Acepta enteros, fracciones, decimales y complejos:'),
    h('ul', {},
      h('li', {}, h('code', {}, '3   -1/2   0.25   2+3i   -i   (1+i)^2')),
      h('li', {}, 'Pega desde Excel directamente en una celda'),
      h('li', {}, 'Navega con flechas y Enter; calcula con Ctrl + Enter'),
    ),
  )));
}

function inputLatex(op: Operation, A: ReturnType<typeof parseMatrix>, B: ReturnType<typeof parseMatrix>) {
  const xs = [`A = ${toLatex(A, draft.fmt)}`];
  if (op.inputs === 'Ab') xs.push(`b = ${toLatex(B, draft.fmt)}`);
  if (op.inputs === 'AB') xs.push(`B = ${toLatex(B, draft.fmt)}`);
  return xs;
}

function calculate() {
  const op = currentOp();
  let comp: Computation;
  let A, B;
  try {
    A = parseMatrix(draft.A);
    B = parseMatrix(op.inputs === 'A' ? [['0']] : draft.B);
    comp = op.run({ A, B, b: B.map((r) => r[0]), k: parseScalar(draft.k || '1'), p: draft.p, fmt: draft.fmt });
  } catch (e) {
    results.replaceChildren(h('div', { class: 'res-head' }, h('h2', {}, op.label)), h('div', { class: 'error-card', role: 'alert' }, (e as Error).message));
    return;
  }
  const input: SavedInput = { op: op.id, A: draft.A, B: op.inputs === 'A' ? [['']] : draft.B, k: draft.k, p: draft.p };
  last = { comp, input, title: `${op.label} · ${rows(A)}×${cols(A)}` };
  showResult();
}

function showResult() {
  if (!last) return renderEmpty();
  const { comp } = last;
  const op = currentOp();
  const A = parseMatrix(last.input.A);
  const B = parseMatrix(last.input.B);
  const act = (label: string, title: string, fn: () => void) => h('button', { class: 'btn sm', title, onclick: fn }, label);
  results.replaceChildren(
    h('div', { class: 'print-head' }, `Pivote · ${new Date().toLocaleDateString('es-MX')}`),
    h('div', { class: 'res-head' },
      h('h2', {}, comp.title),
      h('div', { class: 'actions' },
        act('Guardar', 'Guardar en el historial', () => void doSave()),
        DEMO ? null : act('Compartir', 'Copiar enlace con estos datos', () => doShare()),
        act('LaTeX', DEMO ? 'Copiar el procedimiento como documento LaTeX' : 'Descargar el procedimiento como .tex', () => doLatex()),
        DEMO ? null : act('PDF', 'Imprimir o guardar como PDF', () => doPdf()),
      ),
    ),
    h('div', { class: 'row', style: 'gap:18px;margin-bottom:8px' }, ...inputLatex(op, A, B).map((x) => tex(x))),
    ...renderComputation(comp, {
      onCopy: (l) => void copyText(l, 'LaTeX copiado'),
    }),
  );
  resultAd?.activate();
  results.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function doSave() {
  if (!last) return;
  const where = await saveHistory(last.title, last.input);
  toast(where === 'cloud' ? 'Guardado en tu cuenta' : `Guardado en este navegador (últimos ${LOCAL_HISTORY})`);
}

function doShare() {
  if (!last) return;
  const url = `${location.origin}${location.pathname}#c=${encodeShare(last.input)}`;
  void copyText(url, 'Enlace copiado: quien lo abra verá estos datos');
}

function doLatex() {
  if (!last) return;
  const A = parseMatrix(last.input.A), B = parseMatrix(last.input.B);
  const doc = computationToLatexDoc(last.comp, last.title, inputLatex(currentOp(), A, B));
  if (DEMO) return void copyText(doc, 'Documento LaTeX copiado');
  download('pivote-procedimiento.tex', doc, 'application/x-tex');
}

function doPdf() {
  if (!last) return;
  window.print();
}

// ── Modales ────────────────────────────────────────────────────────

function openLogin(title = 'Entrar a Pivote') {
  if (!CLOUD_ENABLED) {
    modal(title, [h('p', {}, 'Las cuentas aún no están activas. Todo funciona sin cuenta y el historial se guarda en este navegador.')]);
    return;
  }
  const email = h('input', { type: 'email', placeholder: 'tu@correo.com', autocomplete: 'email', required: true }) as HTMLInputElement;
  const msg = h('p', { class: 'muted' }, 'Te enviamos un enlace mágico: sin contraseñas.');
  const form = h('form', { class: 'dlg-body', style: 'padding:0' },
    h('label', { class: 'field' }, 'Correo electrónico', email),
    h('button', { class: 'btn primary', type: 'submit' }, 'Enviarme el enlace'),
    msg,
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await signInWithEmail(email.value);
      msg.textContent = `Listo. Revisa ${email.value} y abre el enlace.`;
    } catch (err) {
      msg.textContent = (err as Error).message;
    }
  });
  modal(title, [
    h('button', { class: 'btn', onclick: () => void signInWithGoogle().catch((e) => toast(e.message)) }, 'Continuar con Google'),
    h('p', { class: 'muted', style: 'text-align:center;margin:0' }, 'o'),
    form,
  ]);
  email.focus();
}

function openAccount() {
  const acc = getAccount();
  if (!acc.session) return openLogin();
  const p = acc.profile;
  const field = (label: string, name: string, value: string | number | null | undefined, extra: Record<string, string | number> = {}) =>
    h('label', { class: 'field' }, label, h('input', { name, value: value ?? '', ...extra }));
  const form = h('form', { class: 'dlg-body', style: 'padding:0' },
    field('Nombre', 'full_name', p?.full_name),
    field('Universidad / facultad', 'university', p?.university, { placeholder: 'FIME UANL', list: 'unis' }),
    h('datalist', { id: 'unis' }, ...['FIME UANL', 'UNAM Facultad de Ingeniería', 'IPN ESIME', 'Tec de Monterrey', 'UAM', 'UdeG CUCEI'].map((u) => h('option', { value: u }))),
    field('Carrera', 'career', p?.career, { placeholder: 'IMTC, IEC, IAS…' }),
    field('Semestre', 'semester', p?.semester, { type: 'number', min: 1, max: 14 }),
    h('button', { class: 'btn primary', type: 'submit' }, 'Guardar perfil'),
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const s = (k: string) => (String(fd.get(k) ?? '').trim() || null);
    try {
      await saveProfile({ full_name: s('full_name'), university: s('university'), career: s('career'), semester: s('semester') ? Number(s('semester')) : null });
      toast('Perfil guardado');
    } catch (err) {
      toast((err as Error).message);
    }
  });
  modal('Tu cuenta', [
    h('p', {}, acc.session.user.email ?? '', h('br'), h('span', { class: 'muted' }, 'Tu historial se guarda en tu cuenta.')),
    form,
    h('div', { class: 'row' },
      h('button', { class: 'btn ghost', onclick: () => void signOut().then(() => toast('Sesión cerrada')) }, 'Cerrar sesión'),
    ),
  ]);
}

async function openHistory() {
  const list = h('ul', { class: 'history-list' }, h('li', {}, 'Cargando…'));
  const dlg = modal('Historial', [
    h('p', { class: 'muted' }, cloudOn() ? 'Sincronizado con tu cuenta.' : `Guardado solo en este navegador (últimos ${LOCAL_HISTORY}).${CLOUD_ENABLED ? ' Inicia sesión para tenerlo en todos tus dispositivos.' : ''}`),
    list,
  ]);
  const items = await listHistory();
  const open = (it: HistoryItem) => {
    const op = opById(it.op);
    if (!op) return;
    Object.assign(draft, { op: op.id, group: op.group, A: it.A, B: it.B, k: it.k ?? '2', p: it.p ?? 2 });
    edA.set(it.A);
    edB.set(it.B);
    saveDraft();
    renderControls();
    dlg.close();
    calculate();
  };
  list.replaceChildren(...(items.length ? items.map((it) => {
    const li = h('li', {},
      h('button', { class: 'open', onclick: () => open(it) }, it.title, h('time', {}, new Date(it.created_at).toLocaleString('es-MX'))),
      h('button', { class: 'btn ghost sm', 'aria-label': 'Borrar', onclick: async () => { await deleteHistory(it); li.remove(); } }, '✕'),
    );
    return li;
  }) : [h('li', {}, 'Aún no guardas cálculos. Usa «Guardar» en un resultado.')]));
}

// ── Página ─────────────────────────────────────────────────────────

const about = h('section', { class: 'about' },
  h('h2', {}, 'Calculadora de matrices con procedimiento, hecha para ingeniería'),
  h('div', { class: 'cols' },
    h('div', {}, h('h3', {}, 'Exacta de verdad'), h('p', {}, 'Trabaja con fracciones y complejos sin redondeo: 1/3 sigue siendo 1/3 y det = 0 significa exactamente cero, no "casi cero".')),
    h('div', {}, h('h3', {}, 'Cada operación de renglón'), h('p', {}, 'Gauss-Jordan, cofactores, inversa, LU y vectores propios con el mismo procedimiento que te piden en el examen.')),
    h('div', {}, h('h3', {}, 'Lista para entregar'), h('p', {}, 'Copia cualquier resultado en LaTeX o exporta el procedimiento completo a PDF para tus tareas.')),
  ),
);

const footer = h('footer', {},
  'Pivote es gratis gracias a la publicidad. Creada por Rogelio Emilio Medrano Díaz. ',
  h('a', { href: '/privacidad.html' }, 'Aviso de privacidad'),
);

// Anuncios: uno debajo del resultado (se activa con el primer cálculo) y uno antes del pie.
const footerAd = adSlot('footer', 'ad-footer');

document.getElementById('app')!.append(
  ...[topbar, h('div', { class: 'layout' }, workspace, h('div', { class: 'main-col' }, results, resultAd?.el)), about, footerAd?.el, footer]
    .filter((x): x is HTMLElement => Boolean(x)),
);
footerAd?.activate();

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); calculate(); }
});

onAccountChange((acc) => {
  accountBtn.textContent = acc.session ? 'Mi cuenta' : 'Entrar';
});

renderControls();
renderEmpty();
void initAccount();
if (fromShare) calculate();
