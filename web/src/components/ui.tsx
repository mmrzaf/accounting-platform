import { useId, type ReactNode } from 'react'
import { useApplication } from '../app/context'
import { languages } from '../lib/i18n'

export function Page({ title, description, actions, children }: { title: string; description?: string; actions?: ReactNode; children: ReactNode }) {
  return <section className="page"><header className="page-heading"><div><h1>{title}</h1>{description && <p className="muted">{description}</p>}</div>{actions}</header>{children}</section>
}
export function Panel({ title, children }: { title?: string; children: ReactNode }) {
  return <section className="panel">{title && <h2>{title}</h2>}{children}</section>
}
export function Field({ label, children, hint }: { label: string; hint?: string; children: (id: string) => ReactNode }) {
  const id = useId()
  return <div className="field"><label htmlFor={id}>{label}</label>{children(id)}{hint && <small className="muted">{hint}</small>}</div>
}
export function Alert({ text, type = 'error' }: { text: string | null; type?: 'error'|'success'|'info' }) {
  if (!text) return null
  return <div role={type === 'error' ? 'alert' : 'status'} className={`alert ${type}`}>{text}</div>
}
export function Empty({ message }: { message?: string }) {
  const { locale } = useApplication()
  return <div className="empty">{message ?? languages[locale].empty}</div>
}
export function Spinner() {
  const { locale } = useApplication()
  return <p className="muted" role="status">{languages[locale].loading}</p>
}
export function Submit({ children, busy }: { children: ReactNode; busy: boolean }) {
  return <button type="submit" disabled={busy}>{busy ? '…' : children}</button>
}
