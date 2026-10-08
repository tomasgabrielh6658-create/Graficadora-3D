import { useSyncExternalStore } from 'react'
import { Delete, MoveLeft, MoveRight, X } from 'lucide-react'
import { insertMath, mathBackspace, mathKb, mathMoveCaret } from '../lib/kb'

interface Key {
  label: string
  ins?: string
  act?: 'bksp' | 'left' | 'right' | 'close'
}

const K = (label: string, ins?: string): Key => ({ label, ins: ins ?? label })

/** Filas compactas estilo GeoGebra: números, variables, operadores, funciones. */
const ROWS: Key[][] = [
  [K('7'), K('8'), K('9'), K('('), K(')'), K('^'), K('x²', '^2'), { label: '⌫', act: 'bksp' }, { label: '←', act: 'left' }, { label: '→', act: 'right' }],
  [K('4'), K('5'), K('6'), K('x'), K('y'), K('z'), K('u'), K('v'), K('r'), K('θ', 'theta')],
  [K('1'), K('2'), K('3'), K('+'), K('−', '-'), K('×', '*'), K('÷', '/'), K('='), K('≤', '<='), K('≥', '>=')],
  [K('0'), K('.'), K(','), K('π', 'pi'), K('e'), K('ρ', 'rho'), K('φ', 'phi'), K('|x|', 'abs(|)'), K('<'), K('>')],
  [K('√', 'sqrt('), K('sin', 'sin('), K('cos', 'cos('), K('tan', 'tan('), K('ln', 'log('), K('eˣ', 'exp('), K('min', 'min('), K('max', 'max('), K('mod', '%'), { label: '✕', act: 'close' }],
]

function press(k: Key) {
  if (k.act === 'bksp') return mathBackspace()
  if (k.act === 'left') return mathMoveCaret(-1)
  if (k.act === 'right') return mathMoveCaret(1)
  if (k.act === 'close') return mathKb.set(false)
  if (k.ins) insertMath(k.ins)
}

export function MathKeyboard() {
  const open = useSyncExternalStore(mathKb.subscribe, mathKb.get, () => false)
  if (!open) return null
  return (
    <div className="fixed inset-x-0 bottom-7 z-40 border-t border-ink bg-white shadow-[0_-6px_24px_rgba(0,0,0,0.12)]">
      <div className="mx-auto max-w-2xl px-1.5 py-1.5">
        <div className="mb-1 flex items-center justify-between">
          <span className="font-mono text-[9.5px] uppercase tracking-wider text-mute">
            teclado matemático — tocá un campo y escribí con el mouse
          </span>
          <button
            className="grid h-6 w-6 place-items-center text-mute hover:text-ink"
            onClick={() => mathKb.set(false)}
            title="Cerrar teclado"
          >
            <X size={13} />
          </button>
        </div>
        <div className="space-y-1">
          {ROWS.map((row, ri) => (
            <div key={ri} className="grid grid-cols-10 gap-1">
              {row.map((k, ki) => (
                <button
                  key={ki}
                  className={`h-8 select-none border font-mono text-[12px] leading-none transition-colors ${
                    k.act === 'close'
                      ? 'border-line text-mute hover:border-rose-400 hover:text-rose-600'
                      : k.act
                        ? 'border-line bg-paper text-ink/70 hover:border-cobalt hover:text-cobalt'
                        : 'border-line bg-white text-ink hover:border-cobalt hover:bg-cobalt hover:text-white active:bg-cobalt active:text-white'
                  }`}
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => press(k)}
                >
                  {k.act === 'bksp' ? (
                    <Delete size={13} className="mx-auto" />
                  ) : k.act === 'left' ? (
                    <MoveLeft size={13} className="mx-auto" />
                  ) : k.act === 'right' ? (
                    <MoveRight size={13} className="mx-auto" />
                  ) : (
                    k.label
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
