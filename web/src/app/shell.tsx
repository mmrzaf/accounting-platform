import { Link, Outlet } from '@tanstack/react-router'
import { useApplication } from './context'
import { languages } from '../lib/i18n'
import { Login } from '../pages/login'
import { Spinner } from '../components/ui'

const links = [
  { path: '/' as const, key: 'home' as const },
  { path: '/contacts' as const, key: 'contacts' as const },
  { path: '/invoices' as const, key: 'invoices' as const },
  { path: '/payments' as const, key: 'payments' as const },
  { path: '/ledger' as const, key: 'ledger' as const },
  { path: '/inventory' as const, key: 'inventory' as const },
  { path: '/assistant' as const, key: 'assistant' as const },
  { path: '/settings' as const, key: 'settings' as const },
  { path: '/administration' as const, key: 'administration' as const },
]
export function Shell() {
  const { session, loading, loadError, companies, companyId, setCompanyId, locale, setLocale, logout } = useApplication()
  const t = languages[locale]
  if (loading) return <main className="center"><Spinner /></main>
  if (loadError) return <main className="center"><div className="panel" role="alert"><p>{loadError}</p><button onClick={()=>window.location.reload()}>Retry connection</button></div></main>
  if (!session) return <Login />
  return <div className="layout" dir={locale === 'fa' ? 'rtl' : 'ltr'} lang={locale}>
    <a href="#main-content" className="skip-link">{locale === 'fa' ? 'رفتن به محتوا' : 'Skip to content'}</a>
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">A</div><span>{t.app}</span></div>
      <nav aria-label="Main navigation">
        {links.map(link => <Link key={link.path} to={link.path} activeProps={{ className: 'active' }} activeOptions={{ exact: link.path === '/' }}>
          {t[link.key]}
        </Link>)}
      </nav>
      <div className="sidebar-footer"><div>{session.user.displayName}</div><button type="button" className="text-button" onClick={() => void logout()}>{t.signOut}</button></div>
    </aside>
    <div className="workspace">
      <header className="topbar">
        <div className="top-company"><label htmlFor="current-company">{t.company}</label>
          <select id="current-company" value={companyId} onChange={event => setCompanyId(event.target.value)}>
            {companies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}
          </select></div>
        <div className="top-locale"><label htmlFor="language">{t.language}</label>
          <select id="language" value={locale} onChange={event => setLocale(event.target.value === 'fa' ? 'fa' : 'en')}>
            <option value="fa">فارسی</option><option value="en">English</option>
          </select></div>
      </header>
      <main id="main-content" tabIndex={-1}>
        {companyId ? <Outlet /> : <div className="panel"><p>{locale === 'fa' ? 'هنوز شرکتی برای این کاربر در دسترس نیست.' : 'No companies are available to this user.'}</p></div>}
      </main>
    </div>
  </div>
}
