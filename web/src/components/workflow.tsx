import { useEffect, useRef, type ReactNode } from 'react'
import { useApplication } from '../app/context'

export type RecordState = 'draft' | 'posted' | 'reversed' | 'voided' | 'active' | 'archived' | string
export function Status({ value }: { value: RecordState }) {
  const { locale } = useApplication()
  const names: Record<string, [string,string]> = {
    draft: ['Draft', 'پیش‌نویس'], posted: ['Posted', 'ثبت‌شده'], reversed: ['Reversed', 'برگشت‌خورده'],
    voided: ['Void', 'باطل‌شده'], active: ['Active', 'فعال'], archived: ['Archived', 'بایگانی‌شده'],
  }
  const label = names[value]
  return <span className={`record-status status-${value}`}>{label ? label[locale === 'fa' ? 1 : 0] : value}</span>
}
export function SectionHeading({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return <div className="section-heading"><h2>{children}</h2>{actions && <div className="section-actions">{actions}</div>}</div>
}
export function SummaryValue({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return <div className="summary-value"><span className="muted">{label}</span><strong>{value}</strong>{hint && <small className="muted">{hint}</small>}</div>
}
export function ActionDialog({ title, description, confirm, destructive = false, open, busy, onConfirm, onClose, children }: {
  title: string; description: string; confirm: string; destructive?: boolean; open: boolean; busy: boolean;
  onConfirm: () => void; onClose: () => void; children?: ReactNode
}) {
  const { locale } = useApplication()
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])
  return <dialog ref={ref} className="action-dialog" aria-labelledby="action-dialog-title" onClose={onClose} onCancel={event => { if (busy) event.preventDefault() }}>
    <h2 id="action-dialog-title">{title}</h2><p className="muted">{description}</p>{children}
    <div className="dialog-actions"><button className="secondary" type="button" disabled={busy} onClick={onClose}>{locale === 'fa' ? 'انصراف' : 'Cancel'}</button>
      <button className={destructive ? 'danger-button' : ''} type="button" disabled={busy} onClick={onConfirm}>{busy ? '…' : confirm}</button></div>
  </dialog>
}
export function SearchBox({ value, onChange, label, placeholder }: { value: string; onChange: (v:string)=>void; label:string; placeholder?:string }) {
  return <input type="search" value={value} onChange={event=>onChange(event.target.value)} aria-label={label} placeholder={placeholder ?? label}/>
}
export function FilterTabs<T extends string>({ options, value, onChange, label }: { options: {value:T; label:string}[]; value:T; onChange:(v:T)=>void; label:string }) {
  return <div className="filter-tabs" role="group" aria-label={label}>
    {options.map(option=><button type="button" key={option.value} className={option.value===value ? 'filter-tab selected' : 'filter-tab'} aria-pressed={value===option.value} onClick={()=>onChange(option.value)}>{option.label}</button>)}
  </div>
}
