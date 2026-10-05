import type { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { AsciiFigure } from './AsciiArt'

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="shrink-0">
      <rect width="32" height="32" fill="var(--color-cobalt)" />
      <path d="M16 6 24.7 11v10L16 26l-8.7-5V11z" fill="none" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
      <path d="M16 6 24.7 11 16 16 7.3 11z" fill="#fff" />
      <path d="M16 16v10" stroke="#fff" strokeWidth="2" />
    </svg>
  )
}

export function Sidebar({ children, fig }: { children: ReactNode; fig?: number }) {
  return (
    <aside className="sidebar w-[320px] shrink-0 overflow-y-auto border-r border-line bg-white">
      <div className="flex min-h-full flex-col">
        {children}
        {fig !== undefined && (
          <div className="mt-auto px-4 pb-4 pt-6">
            <AsciiFigure fig={fig} />
          </div>
        )}
      </div>
    </aside>
  )
}

export function Section({
  title, children, defaultOpen = true,
}: {
  title: string
  children: ReactNode
  defaultOpen?: boolean
}) {
  return (
    <details open={defaultOpen} className="group border-b border-line">
      <summary className="flex cursor-pointer select-none items-center px-4 pb-2 pt-3 text-[11px] font-bold uppercase tracking-[0.08em] text-ink hover:bg-paper">
        <span>{title}</span>
        <span className="mx-2 mt-1 flex-1 border-b border-dotted border-ink/20" />
        <ChevronDown size={13} className="chev text-mute transition-transform" />
      </summary>
      <div className="px-4 pb-3.5">{children}</div>
    </details>
  )
}

export function PanelTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex h-8 shrink-0 items-center gap-2 border-b border-line bg-white px-3 font-mono text-[10.5px] uppercase tracking-wider text-mute">
      <span className="h-1.5 w-1.5 bg-cobalt" />
      <span className="flex-1 truncate">{children}</span>
      {right}
    </div>
  )
}

export function PanelHint({ children }: { children: ReactNode }) {
  return (
    <div className="border-t border-line px-3 py-1.5 font-mono text-[10px] text-mute">{children}</div>
  )
}

export function SliderRow({
  label, value, min, max, step = 0.01, onChange, fmt, color = 'var(--color-cobalt)',
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
    <div className="mb-2.5">
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-ink/80">{label}</span>
        <span className="border border-line px-1.5 py-px font-mono text-[11px] font-medium" style={{ color }}>
          {fmt ? fmt(value) : value.toFixed(2)}
        </span>
      </div>
      <input
        type="range"
        className="h-1.5 w-full cursor-pointer"
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
    'inline-flex items-center gap-1.5 rounded-[2px] px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-35 disabled:cursor-not-allowed'
  const styles = {
    default: 'bg-white border border-line text-ink hover:border-ink',
    primary: 'bg-cobalt text-white hover:bg-cobalt-600 border border-cobalt',
    ghost: 'text-ink/70 hover:bg-paper hover:text-ink',
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
      className={`w-full cursor-pointer rounded-[2px] border border-line bg-white px-2 py-1.5 text-xs hover:border-ink ${className}`}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

export function NumField({
  label, value, onChange, step = 0.5,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  step?: number
}) {
  return (
    <label className="flex min-w-0 flex-1 items-center border border-line text-[11px] focus-within:border-cobalt hover:border-ink">
      <span className="shrink-0 border-r border-line bg-paper px-1.5 py-1 font-mono text-[10px] text-mute">{label}</span>
      <input
        type="number"
        step={step}
        className="w-full min-w-0 bg-white px-1.5 py-1 text-[11px] outline-none"
        value={Math.round(value * 1000) / 1000}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
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
    <label className="flex cursor-pointer items-center gap-2 py-0.5 text-xs text-ink/80 hover:text-ink">
      <input
        type="checkbox"
        className="h-3.5 w-3.5 cursor-pointer"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {color && <span className="inline-block h-2.5 w-2.5" style={{ background: color }} />}
      {label}
    </label>
  )
}

export function Badge({ children, color = '#1f3bf5' }: { children: ReactNode; color?: string }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 text-[10px] font-semibold"
      style={{ background: color + '1a', color }}
    >
      {children}
    </span>
  )
}
