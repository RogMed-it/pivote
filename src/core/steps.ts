// Modelo de "paso a paso": cada operación produce pasos legibles en LaTeX.

export interface Step {
  /** Explicación corta en texto ("Hacemos 1 el pivote de la fila 2"). */
  text: string;
  /** Operación en LaTeX (ej. R_2 \leftarrow R_2 - 3R_1). */
  op?: string;
  /** Estado resultante en LaTeX (matriz o ecuación). */
  latex?: string;
}

export interface ResultBlock {
  label: string;
  latex: string;
  /** Versión en texto plano para copiar. */
  text?: string;
}

export interface Computation {
  title: string;
  steps: Step[];
  results: ResultBlock[];
  /** Avisos (ej. "resultado numérico aproximado"). */
  notes?: string[];
}

export class StepLog {
  readonly steps: Step[] = [];
  constructor(private enabled = true) {}
  push(step: Step) {
    if (this.enabled) this.steps.push(step);
  }
}
