import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Outlet, useLocation } from '@tanstack/react-router'
import { useApplication } from './context'
import { languages } from '../lib/i18n'
import { Login } from '../pages/login'
import { Spinner } from '../components/ui'
import { Icon, type IconName } from '../components/icons'
import { AssistantWorkspace } from '../components/assistant-workspace'

type NavItem = { path: '/' | '/contacts' | '/invoices' | '/payments' | '/ledger' | '/inventory' | '/assistant' | '/settings' | '/administration'; key: keyof typeof languages.en; icon: IconName }
const primary: NavItem[] = [
  {path:'/',key:'home',icon:'home'},
  {path:'/contacts',key:'contacts',icon:'contacts'},
  {path:'/invoices',key:'invoices',icon:'invoice'},
  {path:'/payments',key:'payments',icon:'payment'},
]
const finance: NavItem[] = [
  {path:'/ledger',key:'ledger',icon:'ledger'},
  {path:'/inventory',key:'inventory',icon:'inventory'},
]
const administration: NavItem[] = [
  {path:'/administration',key:'administration',icon:'users'},
  {path:'/settings',key:'settings',icon:'settings'},
]
const allItems = [...primary, ...finance, ...administration, {path:'/assistant',key:'assistant',icon:'assistant'}] satisfies NavItem[]

function Navigation({close}:{close:()=>void}) {
  const {locale} = useApplication()
  const t = languages[locale]
  const groups = [
    {label:locale==='fa'?'کارهای روزانه':'WORKSPACE',items:primary},
    {label:locale==='fa'?'مالی و حسابداری':'FINANCE',items:finance},
    {label:locale==='fa'?'مدیریت':'ADMINISTRATION',items:administration},
  ]
  return <nav className="primary-navigation" aria-label={locale==='fa'?'ناوبری اصلی':'Main navigation'}>
    {groups.map(group => <div key={group.label} className="nav-group">
      <p className="nav-group-title">{group.label}</p>
      {group.items.map(item=><Link key={item.path} to={item.path} onClick={close} className="nav-link" activeProps={{className:'nav-link active'}} activeOptions={{exact:item.path==='/'}}>
        <Icon name={item.icon}/><span>{t[item.key]}</span>
      </Link>)}
    </div>)}
  </nav>
}

function QuickNavigate({close}:{close:()=>void}) {
  const {locale} = useApplication()
  const t = languages[locale]
  const [query,setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const matches = useMemo(()=>allItems.filter(item=>t[item.key].toLowerCase().includes(query.toLowerCase())),[query,t])
  useEffect(()=>{inputRef.current?.focus()},[])
  return <div className="dialog-backdrop" onClick={close}>
    <div role="dialog" aria-modal="true" aria-label={locale==='fa'?'رفتن به بخش':'Go to page'} className="quick-dialog" onClick={event=>event.stopPropagation()} onKeyDown={event=>{if(event.key==='Escape')close()}}>
      <div className="quick-input"><Icon name="search"/><input ref={inputRef} value={query} onChange={event=>setQuery(event.target.value)} placeholder={locale==='fa'?'جست‌وجوی بخش‌ها…':'Find a page…'} aria-label={locale==='fa'?'جست‌وجوی بخش‌ها':'Find a page'} /><button type="button" className="icon-button" onClick={close} aria-label={locale==='fa'?'بستن':'Close'}><Icon name="close"/></button></div>
      <div className="quick-results">{matches.length?matches.map(item=><Link key={item.path} to={item.path} onClick={close} className="quick-result"><Icon name={item.icon}/><span>{t[item.key]}</span><Icon name="arrow" size={16}/></Link>):<p className="muted quick-empty">{t.empty}</p>}</div>
      <div className="quick-hint">{locale==='fa'?'فقط برای جابه‌جایی بین بخش‌ها؛ جست‌وجوی اسناد در صفحات مربوط انجام می‌شود.':'Navigate sections; search records inside each workspace.'}</div>
    </div>
  </div>
}

export function Shell() {
  const {session,loading,loadError,locale,setLocale,logout,assistantOpen,openAssistant,closeAssistant} = useApplication()
  const [logoutError,setLogoutError] = useState<string|null>(null)
  const [mobileOpen,setMobileOpen] = useState(false)
  const [quickOpen,setQuickOpen] = useState(false)
  const location = useLocation()
  const t = languages[locale]
  const current = allItems.find(item=>item.path===location.pathname)
  useEffect(()=>{
    const keyHandler = (event:KeyboardEvent) => {
      if ((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k') {event.preventDefault();setQuickOpen(open=>!open)}
      if (event.key==='Escape'){setQuickOpen(false);setMobileOpen(false);closeAssistant()}
    }
    window.addEventListener('keydown',keyHandler)
    return ()=>window.removeEventListener('keydown',keyHandler)
  },[closeAssistant])
  useEffect(()=>{setMobileOpen(false)},[location.pathname])
  if (loading) return <main className="center"><Spinner/></main>
  if (loadError) return <main className="center"><div className="panel" role="alert"><p>{loadError}</p><button type="button" onClick={()=>window.location.reload()}>{t.retry}</button></div></main>
  if (!session) return <Login/>
  return <div className="app-layout" dir={locale==='fa'?'rtl':'ltr'} lang={locale}>
    <a className="skip-link" href="#main-content">{locale==='fa'?'رفتن به محتوای اصلی':'Skip to main content'}</a>
    {mobileOpen&&<button className="sidebar-scrim" aria-label={locale==='fa'?'بستن منو':'Close menu'} onClick={()=>setMobileOpen(false)}/>}
    <aside className={`app-sidebar ${mobileOpen?'is-open':''}`}>
      <Link to="/" className="app-brand" onClick={()=>setMobileOpen(false)} aria-label={t.app}>
        <span className="app-brand-symbol" aria-hidden="true"><Icon name="ledger" size={23}/></span>
        <span><strong>{t.app}</strong><small>{locale==='fa'?'مدیریت مالی':'Business finance'}</small></span>
      </Link>
      <div className="sidebar-context"><span className="context-caption">{locale==='fa'?'شرکت شما':'YOUR COMPANY'}</span><span className="context-name" title={session.company.name}>{session.company.name}</span></div>
      <Navigation close={()=>setMobileOpen(false)}/>
      <div className="sidebar-bottom">
        <Link className="nav-link assistant-nav-link" to="/assistant" onClick={()=>setMobileOpen(false)} activeProps={{className:'nav-link assistant-nav-link active'}}><Icon name="assistant"/><span>{t.assistant}</span></Link>
        <div className="signed-in-user"><span className="user-avatar">{session.user.displayName.trim().slice(0,1).toUpperCase()}</span><span className="user-description"><strong>{session.user.displayName}</strong><small dir="ltr">{session.user.username}</small></span></div>
        {logoutError&&<p className="nav-error" role="alert">{logoutError}</p>}
        <button type="button" className="nav-link signout-link" onClick={()=>{setLogoutError(null);void logout().catch(error=>setLogoutError(error instanceof Error?error.message:String(error)))}}><Icon name="logout"/><span>{t.signOut}</span></button>
      </div>
    </aside>
    <div className="app-workspace">
      <header className="app-topbar">
        <div className="topbar-leading"><button type="button" className="icon-button mobile-nav-toggle" onClick={()=>setMobileOpen(true)} aria-label={locale==='fa'?'باز کردن منو':'Open menu'} aria-expanded={mobileOpen}><Icon name="menu"/></button>
          <div className="topbar-breadcrumb"><span>{t.app}</span><Icon name="chevron" size={15}/><strong>{current?t[current.key]:t.home}</strong></div>
        </div>
        <div className="topbar-actions">
          <button type="button" className="search-trigger" onClick={()=>setQuickOpen(true)} aria-label={locale==='fa'?'رفتن به بخش؛ کنترل کی':'Navigate sections; Control K'}><Icon name="search" size={17}/><span>{locale==='fa'?'رفتن به بخش…':'Go to…'}</span><kbd>⌘ K</kbd></button>
          <label className="language-control"><Icon name="globe" size={17}/><span className="sr-only">{t.language}</span><select aria-label={t.language} value={locale} onChange={event=>setLocale(event.target.value==='fa'?'fa':'en')}><option value="fa">فارسی</option><option value="en">English</option></select></label>
          <button type="button" className="assistant-top-action" aria-haspopup="dialog" onClick={()=>openAssistant()}><Icon name="assistant" size={18}/><span>{t.assistant}</span></button>
        </div>
      </header>
      <main id="main-content" tabIndex={-1}><Outlet/></main>
    </div>
    {quickOpen&&<QuickNavigate close={()=>setQuickOpen(false)}/>}
    {assistantOpen&&<div className="assistant-drawer-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)closeAssistant()}}>
      <aside className="assistant-drawer" role="dialog" aria-modal="true" aria-label={locale==='fa'?'دستیار مالی':'Financial assistant'}>
        <div className="assistant-drawer-top"><span>{t.assistant}</span><button type="button" className="icon-button" aria-label={locale==='fa'?'بستن':'Close'} onClick={closeAssistant}><Icon name="close"/></button></div>
        <AssistantWorkspace compact onNavigate={closeAssistant}/>
      </aside>
    </div>}
  </div>
}
