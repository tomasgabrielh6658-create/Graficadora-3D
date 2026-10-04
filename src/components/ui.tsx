import type { ReactNode } from 'react'

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-b border-slate-200 px-4 py-3">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        {title}
      </h3>
      {children}
    </div>
  )
}

export function SliderRow({
  label, value, min, max, step = 0.01, onChange, fmt, color = '#38bdf8',
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  fmt?: (v: number) => string
  color?: string
}) {
  return (
    <div className="mb-2">
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-medium text-slate-600">{label}</span>
        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px]" style={{ color }}>
          {fmt ? fmt(value) : value.toFixed(2)}
        </span>
      </div>
      <input
        type="range"
        className="w-full accent-sky-500"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  )
}

export function Btn({
  children, onClick, variant = 'default', title, disabled, className = '',
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'default' | 'primary' | 'ghost' | 'danger'
  title?: string
  disabled?: boolean
  className?: string
}) {
  const base =
    'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-40'
  const styles = {
    default: 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50',
    primary: 'bg-sky-600 text-white hover:bg-sky-500 border border-sky-600',
    ghost: 'text-slate-600 hover:bg-slate-200',
    danger: 'text-rose-600 hover:bg-rose-50 border border-rose-200',
  }
  return (
    <button className={`${base} ${styles[variant]} ${className}`} onClick={onClick} title={title} disabled={disabled}>
      {children}
    </button>
  )
}

export function Select<T extends string>({
  value, onChange, options, className = '',
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
  className?: string
}) {
  return (
    <select
      className={`w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs ${className}`}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

export function Toggle({
  checked, onChange, label, color,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label?: ReactNode
  color?: string
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600">
      <input
        type="checkbox"
        className="accent-sky-600"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {color && <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} />}
      {label}
    </label>
  )
}

export function Badge({ children, color = '#0ea5e9' }: { children: ReactNode; color?: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold"
      style={{ background: color + '22', color }}
    >
      {children}
    </span>
  )
}
