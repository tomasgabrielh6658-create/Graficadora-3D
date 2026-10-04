import { Suspense, lazy, useRef } from 'react'
import { Boxes, Download, Grid2x2, Rotate3d, Shuffle, Upload } from 'lucide-react'
import { usePersisted, exportAll, importAll } from './lib/persistence'
import Module1 from './modules/Module1'
import Module2 from './modules/Module2'
import { Btn } from './components/ui'

const Module3 = lazy(() => import('./modules/Module3'))
const Module4 = lazy(() => import('./modules/Module4'))

const TABS = [
  { id: 1, label: 'Dobles · Cartesianas', icon: Grid2x2 },
  { id: 2, label: 'Dobles · Cambio de var.', icon: Shuffle },
  { id: 3, label: 'Triples · Cartesianas', icon: Boxes },
  { id: 4, label: 'Triples · Cil./Esf.', icon: Rotate3d },
] as const

export default function App() {
  const [mod, setMod] = usePersisted<number>('module', 1)
  const fileRef = useRef<HTMLInputElement>(null)

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-1 border-b border-slate-200 bg-white px-3 py-2">
        <div className="mr-3 flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-sky-600 text-sm font-bold text-white">
            ∫
          </span>
          <div className="leading-tight">
            <div className="text-sm font-bold text-slate-800">SólidoViz</div>
            <div className="text-[10px] text-slate-400">Regiones para integrales múltiples</div>
          </div>
        </div>
        {TABS.map((t) => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              onClick={() => setMod(t.id)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                mod === t.id
                  ? 'bg-sky-100 text-sky-800'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Icon size={14} />
              {t.label}
            </button>
          )
        })}
        <div className="ml-auto flex items-center gap-1.5">
          <Btn
            title="Exportar ejercicios a JSON"
            onClick={() => {
              const blob = new Blob([exportAll()], { type: 'application/json' })
              const a = document.createElement('a')
              a.href = URL.createObjectURL(blob)
              a.download = 'solidoviz-ejercicios.json'
              a.click()
              URL.revokeObjectURL(a.href)
            }}
          >
            <Download size={13} /> Exportar
          </Btn>
          <Btn title="Importar ejercicios desde JSON" onClick={() => fileRef.current?.click()}>
            <Upload size={13} /> Importar
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
          <div className="grid flex-1 place-items-center text-sm text-slate-400">
            Cargando motor 3D…
          </div>
        }
      >
        {mod === 3 && <Module3 />}
        {mod === 4 && <Module4 />}
      </Suspense>
    </div>
  )
}
