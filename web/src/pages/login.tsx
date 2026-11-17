import { useState, type FormEvent } from 'react'
import { useApplication } from '../app/context'
import { request } from '../lib/api'
import { Alert, Field, Submit } from '../components/ui'
import { languages } from '../lib/i18n'

export function Login() {
  const { refresh, locale, setLocale } = useApplication()
  const persian = locale === 'fa'
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
  return <main className="login-screen" dir={persian ? 'rtl' : 'ltr'} lang={locale}><form className="login-panel" onSubmit={event => void submit(event)}>
    <div className="login-language"><label htmlFor="login-locale">{languages[locale].language}</label><select id="login-locale" value={locale} onChange={event => setLocale(event.target.value === 'en' ? 'en' : 'fa')}><option value="fa">فارسی</option><option value="en">English</option></select></div>
    <div className="brand"><div className="brand-mark">A</div><span>{languages[locale].app}</span></div>
    <h1>{persian ? 'ورود به سامانه' : 'Sign in'}</h1><p className="muted">{persian ? 'به محیط مالی شرکت خود وارد شوید.' : 'Access your company accounting workspace.'}</p>
    <Alert text={error}/>
    <Field label={persian ? "شناسه سازمان" : "Organization slug"}>{id => <input id={id} dir="ltr" autoComplete="organization" value={organizationSlug} onChange={e => setOrganizationSlug(e.target.value)} required/>}</Field>
    <Field label={persian ? "نام کاربری" : "Username"}>{id => <input id={id} dir="ltr" autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} required/>}</Field>
    <Field label={persian ? "گذرواژه" : "Password"}>{id => <input id={id} type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required/>}</Field>
    <Submit busy={busy}>{persian ? 'ورود' : 'Sign in'}</Submit>
    <p className="muted fine-print">{persian ? 'حساب‌های اولیه از طریق ابزار مدیریت سامانه ساخته می‌شوند.' : 'Initial accounts are created using the administration CLI.'}</p>
  </form></main>
}
