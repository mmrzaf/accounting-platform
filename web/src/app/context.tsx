import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ApiError, request, type AuthSession } from '../lib/api'

type Locale = 'fa' | 'en'
interface ApplicationContext {
  session: AuthSession | null
  loading: boolean
  loadError: string | null
  locale: Locale
  setLocale: (value: Locale) => void
  refresh: () => Promise<void>
  logout: () => Promise<void>
  call: <T>(path: string, payload?: unknown, method?: string) => Promise<T>
}
const Context = createContext<ApplicationContext | null>(null)
export function useApplication() {
  const context = useContext(Context)
  if (!context) throw Error('Application context required')
  return context
}
const localeKey = 'accounting.locale'
function initialLocale(): Locale {
  try { return window.localStorage.getItem(localeKey) === 'en' ? 'en' : 'fa' } catch { return 'fa' }
}
export function ApplicationProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [locale, changeLocale] = useState<Locale>(initialLocale)
  const setLocale = useCallback((next: Locale) => {
    changeLocale(next)
    try { window.localStorage.setItem(localeKey, next) } catch { /* private browsing may block storage */ }
  }, [])
  const refresh = useCallback(async () => {
    try {
      const found = await request<AuthSession>('/api/auth/session')
      setLoadError(null)
      setSession(found)
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setLoadError(null)
        setSession(null)
      } else {
        setLoadError(error instanceof Error ? error.message : String(error))
      }
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { void refresh() }, [refresh])
  const logout = useCallback(async () => {
    if (session) await request('/api/auth/logout', session.csrfToken, {})
    setSession(null)
  }, [session])
  const call = useCallback(<T,>(path: string, payload?: unknown, method?: string): Promise<T> => {
    if (!session) return Promise.reject(Error('Authentication required'))
    return request<T>(path, session.csrfToken, payload, method)
  }, [session])
  const value = useMemo(() => ({session,loading,loadError,locale,setLocale,refresh,logout,call}),
    [session,loading,loadError,locale,setLocale,refresh,logout,call])
  return <Context.Provider value={value}>{children}</Context.Provider>
}
