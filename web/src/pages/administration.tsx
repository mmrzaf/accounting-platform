import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useApplication } from '../app/context'
import { Alert, Empty, Field, Page, Panel, Spinner, Submit } from '../components/ui'
import { ApiError, request, type Company, type List } from '../lib/api'
import { languages } from '../lib/i18n'

interface User { id: string; username: string; displayName: string; status: 'active' | 'disabled' }
interface Role { id: string; scope: 'organization' | 'company'; code: string; name: string }
interface Assignment { id: string; role_id: string; role_code: string; company_id: string | null }

/** Organization administration is deliberately separate from company-scoped accounting operations. */
export function Administration() {
  const { session, companies, locale, refresh } = useApplication()
  const [users, setUsers] = useState<User[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [selectedUser, setSelectedUser] = useState('')
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [roleId, setRoleId] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [newCompanyCode, setNewCompanyCode] = useState('')
  const [newCompanyName, setNewCompanyName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [restricted, setRestricted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const csrf = session?.csrfToken
  const load = useCallback(async () => {
    const [foundUsers, foundRoles] = await Promise.all([
      request<List<User>>('/api/users'), request<List<Role>>('/api/roles'),
    ])
    setUsers(foundUsers.items)
    setRoles(foundRoles.items)
  }, [])
  useEffect(() => {
    let active = true
    setLoading(true); setError(null); setRestricted(false)
    void load().catch(cause => {
      if (!active) return
      if (cause instanceof ApiError && cause.status === 403) setRestricted(true)
      else setError(cause instanceof Error ? cause.message : String(cause))
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [load, session?.user.id])
  useEffect(() => {
    let active = true
    setAssignments([])
    if (!selectedUser) return
    void request<List<Assignment>>(`/api/roles/assignments?userId=${encodeURIComponent(selectedUser)}`)
      .then(value => { if (active) setAssignments(value.items) })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : String(cause)) })
    return () => { active = false }
  }, [selectedUser, notice])
  const post = async (path: string, payload: unknown) => request(path, csrf, payload)
  async function perform(action: () => Promise<void>) {
    setBusy(true); setError(null); setNotice(null)
    try { await action(); await load(); setNotice(languages[locale].success) }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setBusy(false) }
  }
  function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void perform(async () => {
      try { await post('/api/users', { username, displayName, password }) }
      finally { setPassword('') }
      setUsername(''); setDisplayName('')
    })
  }
  function createCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void perform(async () => {
      await post('/api/companies', { code: newCompanyCode, name: newCompanyName })
      setNewCompanyCode(''); setNewCompanyName('')
      await refresh()
    })
  }
  function grant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const role = roles.find(item => item.id === roleId)
    if (!role) { setError('Select a valid role'); return }
    void perform(async () => {
      await post('/api/roles/assign', {
        userId: selectedUser, roleId,
        companyId: role.scope === 'company' ? companyId : null,
      })
      setRoleId(''); setCompanyId('')
      const result = await request<List<Assignment>>(`/api/roles/assignments?userId=${encodeURIComponent(selectedUser)}`)
      setAssignments(result.items)
    })
  }
  const selectedRole = roles.find(role => role.id === roleId)
  return <Page title={locale === 'fa' ? 'مدیریت سازمان' : 'Organization administration'}
    description={locale === 'fa' ? 'کاربران، دسترسی‌های نقش‌محور و شرکت‌های مجموعه.' : 'Manage company access through roles, never direct user permissions.'}>
    <Alert text={error}/><Alert text={notice} type="success"/>
    {loading ? <Spinner/> : restricted ?
      <Panel><p>{locale === 'fa' ? 'مجوز مدیریت کاربران برای این حساب فعال نیست.' : 'Your account does not have administration access.'}</p></Panel> : <>
      <Panel title={locale === 'fa' ? 'کاربر جدید' : 'Create user'}>
        <form className="form-grid" onSubmit={createUser}>
          <Field label={locale === 'fa' ? 'نام کاربری' : 'Username'}>{id => <input id={id} dir="ltr" autoComplete="off" required value={username} onChange={e => setUsername(e.target.value)}/>}</Field>
          <Field label={languages[locale].name}>{id => <input id={id} required value={displayName} onChange={e => setDisplayName(e.target.value)}/>}</Field>
          <Field label={locale === 'fa' ? 'گذرواژه اولیه' : 'Initial password'}>{id => <input id={id} type="password" autoComplete="new-password" required value={password} onChange={e => setPassword(e.target.value)}/>}</Field>
          <div className="form-actions"><Submit busy={busy}>{languages[locale].create}</Submit></div>
        </form>
        <p className="muted fine-print">{locale === 'fa' ? 'پس از ایجاد کاربر، یک نقش و در صورت نیاز شرکت مربوط را اختصاص دهید. گذرواژه در مرورگر نگهداری نمی‌شود.' : 'Assign a role after creating the user. The initial password is cleared after submission.'}</p>
      </Panel>
      <Panel title={locale === 'fa' ? 'کاربران' : 'Users'}>
        {users.length ? <div className="table-wrap"><table><thead><tr><th>{locale === 'fa' ? 'نام کاربری' : 'Username'}</th><th>{languages[locale].name}</th><th>{languages[locale].status}</th></tr></thead><tbody>
          {users.map(user => <tr key={user.id}><td dir="ltr">{user.username}</td><td>{user.displayName}</td><td>{user.status}</td></tr>)}
        </tbody></table></div> : <Empty/>}
      </Panel>
      <Panel title={locale === 'fa' ? 'دسترسی کاربران' : 'Role assignments'}>
        <form className="form-grid" onSubmit={grant}>
          <Field label={locale === 'fa' ? 'کاربر' : 'User'}>{id => <select id={id} required value={selectedUser} onChange={e => setSelectedUser(e.target.value)}><option value="">—</option>{users.map(user => <option value={user.id} key={user.id}>{user.displayName} · {user.username}</option>)}</select>}</Field>
          <Field label={locale === 'fa' ? 'نقش' : 'Role'}>{id => <select id={id} required value={roleId} onChange={e => {setRoleId(e.target.value);setCompanyId('')}}><option value="">—</option>{roles.map(role => <option value={role.id} key={role.id}>{role.name} ({role.scope})</option>)}</select>}</Field>
          {selectedRole?.scope === 'company' && <Field label={languages[locale].company}>{id => <select id={id} value={companyId} required onChange={e => setCompanyId(e.target.value)}><option value="">—</option>{companies.map((company: Company) => <option value={company.id} key={company.id}>{company.name}</option>)}</select>}</Field>}
          <div className="form-actions"><Submit busy={busy}>{locale === 'fa' ? 'اعطای دسترسی' : 'Assign role'}</Submit></div>
        </form>
        {selectedUser && <div className="table-wrap"><table><thead><tr><th>{locale === 'fa' ? 'نقش فعلی' : 'Current role'}</th><th>{languages[locale].company}</th><th>{languages[locale].actions}</th></tr></thead><tbody>
          {assignments.map(assignment => <tr key={assignment.id}><td>{assignment.role_code}</td><td>{companies.find(company => company.id === assignment.company_id)?.name ?? '—'}</td><td>
            <button className="secondary small" type="button" disabled={busy} onClick={() => {
              if (!window.confirm(locale === 'fa' ? 'این دسترسی حذف شود؟' : 'Revoke this role assignment?')) return
              void perform(async () => {
                await post('/api/roles/revoke', { assignmentId: assignment.id })
                const result = await request<List<Assignment>>(`/api/roles/assignments?userId=${encodeURIComponent(selectedUser)}`)
                setAssignments(result.items)
              })
            }}>{locale === 'fa' ? 'لغو دسترسی' : 'Revoke'}</button>
          </td></tr>)}
        </tbody></table></div>}
      </Panel>
      <Panel title={locale === 'fa' ? 'شرکت جدید' : 'Add company'}>
        <form className="form-grid" onSubmit={createCompany}>
          <Field label={locale === 'fa' ? 'کد شرکت' : 'Company code'}>{id => <input id={id} dir="ltr" required value={newCompanyCode} onChange={e => setNewCompanyCode(e.target.value)}/>}</Field>
          <Field label={languages[locale].name}>{id => <input id={id} required value={newCompanyName} onChange={e => setNewCompanyName(e.target.value)}/>}</Field>
          <div className="form-actions"><Submit busy={busy}>{languages[locale].create}</Submit></div>
        </form>
      </Panel>
    </>}
  </Page>
}
