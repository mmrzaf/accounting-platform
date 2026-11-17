import { useState, type FormEvent } from 'react'
import { useApplication } from '../app/context'
import { request } from '../lib/api'
import { Alert, Field, Submit } from '../components/ui'

export function Login() {
  const { refresh } = useApplication()
  const [organizationSlug, setOrganizationSlug] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string|null>(null)
  const [busy, setBusy] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null)
    try { await request('/api/auth/login', undefined, { organizationSlug, username, password }); setPassword(''); await refresh() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Sign in failed') }
    finally { setBusy(false) }
  }
  return <main className="login-screen" dir="rtl" lang="fa"><form className="login-panel" onSubmit={event => void submit(event)}>
    <div className="brand"><div className="brand-mark">A</div><span>حسابداری</span></div>
    <h1>ورود به سامانه</h1><p className="muted">به محیط مالی شرکت خود وارد شوید.</p>
    <Alert text={error}/>
    <Field label="شناسه سازمان">{id => <input id={id} dir="ltr" autoComplete="organization" value={organizationSlug} onChange={e => setOrganizationSlug(e.target.value)} required/>}</Field>
    <Field label="نام کاربری">{id => <input id={id} dir="ltr" autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} required/>}</Field>
    <Field label="گذرواژه">{id => <input id={id} type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required/>}</Field>
    <Submit busy={busy}>ورود</Submit>
    <p className="muted fine-print">حساب‌های اولیه از طریق ابزار مدیریت سامانه ساخته می‌شوند.</p>
  </form></main>
}
