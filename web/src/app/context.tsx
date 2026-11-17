import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ApiError, request, scoped, type AuthSession, type Company, type List } from '../lib/api'

type Locale = 'fa'|'en'
interface ApplicationContext {
  session: AuthSession | null
  loading: boolean
  loadError: string | null
  companies: Company[]
  companyId: string
  setCompanyId: (value: string) => void
  locale: Locale
  setLocale: (value: Locale) => void
  refresh: () => Promise<void>
  logout: () => Promise<void>
  call: <T>(path: string, payload?: unknown) => Promise<T>
}
const Context = createContext<ApplicationContext | null>(null)
export function useApplication() {
  const context = useContext(Context)
  if (!context) throw Error('Application context required')
  return context
}
export function ApplicationProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [companies, setCompanies] = useState<Company[]>([])
  const [companyId, setCompanyId] = useState('')
  const [locale, setLocale] = useState<Locale>('fa')
  const refresh = useCallback(async () => {
    try {
      const found = await request<AuthSession>('/api/auth/session')
      const { items } = await request<List<Company>>('/api/companies')
      setLoadError(null)
      setSession(found)
      setCompanies(items)
      setCompanyId(previous => items.some(company => company.id === previous) ? previous : (items[0]?.id ?? ''))
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) setLoadError(error instanceof Error ? error.message : String(error))
      else setLoadError(null)
      setSession(null); setCompanies([]); setCompanyId('')
    }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void refresh() }, [refresh])
  const logout = useCallback(async () => {
    if (session) {
      try { await request('/api/auth/logout', session.csrfToken, {}) } catch { /* local session still cleared */ }
    }
    setSession(null); setCompanies([]); setCompanyId('')
  }, [session])
  const call = useCallback(<T,>(path: string, payload?: unknown): Promise<T> => {
    if (!session || !companyId) return Promise.reject(Error('Select a company first'))
    return request<T>(scoped(path, companyId), session.csrfToken, payload)
  }, [session, companyId])
  const value = useMemo(() => ({ session, loading, loadError, companies, companyId, setCompanyId, locale, setLocale, refresh, logout, call }),
    [session, loading, loadError, companies, companyId, locale, refresh, logout, call])
  return <Context.Provider value={value}>{children}</Context.Provider>
}
