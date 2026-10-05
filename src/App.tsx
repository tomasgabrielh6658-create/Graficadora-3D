import { Suspense, lazy, useEffect, useRef } from 'react'
import { Download, Upload } from 'lucide-react'
import { usePersisted, exportAll, importAll } from './lib/persistence'
import Module1 from './modules/Module1'
import Module2 from './modules/Module2'
import { Btn, Logo } from './components/ui'
import { AsciiSolid } from './components/AsciiArt'

const Module3 = lazy(() => import('./modules/Module3'))
const Module4 = lazy(() => import('./modules/Module4'))

const GITHUB_USER = 'tomasgabrielh6658-create'
const GITHUB_URL = `https://github.com/${GITHUB_USER}`

const TABS = [
  { id: 1, group: '∬', label: 'Dobles', title: 'Integrales dobles en x, y' },
  { id: 2, group: '∬', label: 'Cambio de variables', title: 'Integrales dobles con polares, elípticas u otra transformación' },
  { id: 3, group: '∭', label: 'Triples', title: 'Integrales triples en x, y, z' },
  { id: 4, group: '∭', label: 'Cilíndricas y esféricas', title: 'Integrales triples en cilíndricas o esféricas' },
] as const

const HINTS: Record<number, string> = {
  1: 'arrastrar = mover · rueda = zoom · arrastrá la línea violeta para mover el corte',
  2: 'pasá el mouse por un plano y mirá el punto equivalente en el otro · rueda = zoom',
  3: '3D: arrastrar = girar · click derecho = mover · rueda = zoom · click en la sombra = ubicar la flecha',
  4: '3D: arrastrar = girar · click derecho = mover · rueda = zoom · click en el panel derecho = explorar',
}

const HINTS_TOUCH: Record<number, string> = {
  1: 'arrastrar = mover · pinza = zoom · tocá la línea violeta para mover el corte',
  2: 'tocá un plano y mirá el punto equivalente en el otro · pinza = zoom',
  3: '3D: un dedo = girar · dos dedos = mover y zoom · tocá la sombra para ubicar la flecha',
  4: '3D: un dedo = girar · dos dedos = mover y zoom · tocá el panel de abajo = explorar',
}

function Credit() {
  return (
    <a
      href={GITHUB_URL}
      target="_blank"
      rel="noopener noreferrer"
      title="Ver perfil de GitHub"
      className="group flex items-center gap-2 text-mute hover:text-ink"
    >
      <span>
        diseñado por <span className="font-semibold text-ink group-hover:text-cobalt">Palacio Tomás</span>
      </span>
      <img
        src={`${GITHUB_URL}.png?size=40`}
        alt=""
        width={18}
        height={18}
        loading="lazy"
        className="h-[18px] w-[18px] rounded-full ring-1 ring-line group-hover:ring-cobalt"
        onError={(e) => (e.currentTarget.style.display = 'none')}
      />
      <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden>
        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
      </svg>
    </a>
  )
}

export default function App() {
  const [mod, setMod] = usePersisted<number>('module', 1)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.ctrlKey || e.metaKey || e.altKey || t.closest('input, select, textarea, [contenteditable]')) return
      const n = Number(e.key)
      if (n >= 1 && n <= 4) setMod(n)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setMod])

  return (
    <div className="flex h-full flex-col bg-white">
      <header className="flex h-12 shrink-0 items-stretch border-b border-ink">
        <div className="flex items-center gap-2.5 border-r border-line px-4">
          <Logo />
          <div className="leading-none">
            <div className="text-[17px] font-bold tracking-[-0.03em] text-ink">
              sólido<span className="text-cobalt">.</span>
            </div>
            <div className="mt-0.5 font-mono text-[9.5px] uppercase tracking-wider text-mute">
              integrales múltiples
            </div>
          </div>
        </div>
        <nav className="flex items-stretch overflow-x-auto">
          {TABS.map((t) => {
            const active = mod === t.id
            return (
              <button
                key={t.id}
                onClick={() => setMod(t.id)}
                title={`${t.title} · tecla ${t.id}`}
                className={`relative flex items-center gap-2 whitespace-nowrap border-r border-line px-3.5 text-xs transition-colors xl:px-4 ${
                  active ? 'bg-white font-semibold text-ink' : 'text-mute hover:bg-paper hover:text-ink'
                }`}
              >
                <span className={`font-mono text-[10px] ${active ? 'text-cobalt' : ''}`}>0{t.id}</span>
                <span className={`font-serif text-sm ${active ? 'text-cobalt' : ''}`}>{t.group}</span>
                <span className="hidden sm:inline">{t.label}</span>
                {active && <span className="absolute inset-x-0 -bottom-px h-[3px] bg-cobalt" />}
              </button>
            )
          })}
        </nav>
        <div className="dots hidden flex-1 items-center justify-end px-4 2xl:flex" aria-hidden>
          <span className="bg-white px-1.5 font-mono text-[10px] tracking-wider text-mute">
            región <span className="text-cobalt">→</span> límites <span className="text-cobalt">→</span> ∫
          </span>
        </div>
        <div className="ml-auto flex items-center gap-1 border-l border-line px-3">
          <Btn
            variant="ghost"
            title="Guardar todos los ejercicios en un archivo JSON"
            onClick={() => {
              const blob = new Blob([exportAll()], { type: 'application/json' })
              const a = document.createElement('a')
              a.href = URL.createObjectURL(blob)
              a.download = 'solido-ejercicios.json'
              a.click()
              URL.revokeObjectURL(a.href)
            }}
          >
            <Download size={13} /> <span className="hidden xl:inline">Exportar</span>
          </Btn>
          <Btn variant="ghost" title="Cargar ejercicios desde un archivo JSON" onClick={() => fileRef.current?.click()}>
            <Upload size={13} /> <span className="hidden xl:inline">Importar</span>
          </Btn>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (!f) return
              f.text().then((txt) => {
                if (importAll(txt)) location.reload()
              })
              e.target.value = ''
            }}
          />
        </div>
      </header>
      {mod === 1 && <Module1 />}
      {mod === 2 && <Module2 />}
      <Suspense
        fallback={
          <div className="dots grid flex-1 place-items-center">
            <div className="border border-line bg-white px-6 py-4 text-center">
              <AsciiSolid fig={mod} cols={56} rows={24} className="text-[11px] text-cobalt" />
              <div className="mt-2 font-mono text-[10px] uppercase tracking-wider text-mute">
                cargando motor 3D<span className="animate-pulse text-cobalt">_</span>
              </div>
            </div>
          </div>
        }
      >
        {mod === 3 && <Module3 />}
        {mod === 4 && <Module4 />}
      </Suspense>
      <footer className="flex h-7 shrink-0 items-center gap-4 border-t border-line bg-paper px-4 text-[11px]">
        <span className="truncate font-mono text-[10px] text-mute">
          <span className="text-cobalt">›</span>{' '}
          <span className="hidden sm:inline">{HINTS[mod]}</span>
          <span className="sm:hidden">{HINTS_TOUCH[mod]}</span>
          <span className="ml-3 hidden text-ink/35 xl:inline">teclas 1–4 = cambiar módulo</span>
        </span>
        <span className="ml-auto shrink-0">
          <Credit />
        </span>
      </footer>
    </div>
  )
}
