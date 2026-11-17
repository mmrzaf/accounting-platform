import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useApplication } from '../app/context'
import { Alert, Empty, Field, Page, Panel, Spinner, Submit } from '../components/ui'
import { ApiError, type List } from '../lib/api'
import { languages } from '../lib/i18n'

interface User { id: string; username: string; displayName: string; status: 'active' | 'disabled' }
interface Role { id: string; code: string; name: string }
interface Assignment { id: string; role_id: string; role_code: string }

/** One company's administrator manages its people and roles; no company switching or cross-company grants. */
export function Administration() {
  const { call, locale } = useApplication()
  const [users, setUsers] = useState<User[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [selectedUser, setSelectedUser] = useState('')
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [roleId, setRoleId] = useState('')
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [restricted, setRestricted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const fa = locale === 'fa'
  const load = useCallback(async () => {
    const [foundUsers, foundRoles] = await Promise.all([
      call<List<User>>('/api/users'), call<List<Role>>('/api/roles'),
    ])
    setUsers(foundUsers.items)
    setRoles(foundRoles.items)
  }, [call])
  const loadAssignments = useCallback(async (userId: string) => {
    if (!userId) { setAssignments([]); return }
    const result = await call<List<Assignment>>(`/api/roles/assignments?userId=${encodeURIComponent(userId)}`)
    setAssignments(result.items)
  }, [call])
  useEffect(() => {
    let current = true
    setLoading(true); setError(null); setRestricted(false)
    void load().catch(cause => {
      if (!current) return
      if (cause instanceof ApiError && cause.status === 403) setRestricted(true)
      else setError(cause instanceof Error ? cause.message : String(cause))
    }).finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [load])
  useEffect(() => {
    let current = true
    void loadAssignments(selectedUser).catch(cause => {
      if (current) setError(cause instanceof Error ? cause.message : String(cause))
    })
    return () => { current = false }
  }, [loadAssignments,selectedUser])
  async function perform(action: () => Promise<void>) {
    setBusy(true); setError(null); setNotice(null)
    try { await action(); await load(); setNotice(languages[locale].success) }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setBusy(false) }
  }
  function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void perform(async () => {
      try { await call('/api/users', { username, displayName, password }) }
      finally { setPassword('') }
      setUsername(''); setDisplayName('')
    })
  }
  function grant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedUser || !roleId) return
    void perform(async () => {
      await call('/api/roles/assign', { userId: selectedUser, roleId })
      await loadAssignments(selectedUser)
      setRoleId('')
    })
  }
  return <Page title={fa ? 'کاربران و دسترسی‌ها' : 'People & access'}
    description={fa ? 'مدیریت اعضای شرکت و نقش‌های دسترسی آن‌ها.' : 'Manage your company users and their assigned roles.'}>
    <Alert text={error}/><Alert text={notice} type="success"/>
    {loading ? <Spinner/> : restricted ?
      <Panel><p>{fa ? 'شما مجوز مدیریت کاربران را ندارید.' : 'You do not have permission to manage users.'}</p></Panel> : <>
      <Panel title={fa ? 'کاربران' : 'Users'}>
        {users.length ? <div className="table-wrap"><table><thead><tr><th>{fa ? 'نام کاربری' : 'Username'}</th><th>{languages[locale].name}</th><th>{languages[locale].status}</th></tr></thead><tbody>
          {users.map(user => <tr key={user.id}><td dir="ltr">{user.username}</td><td>{user.displayName}</td><td><span className={`status-chip ${user.status === 'active' ? 'status-active' : 'status-disabled'}`}>{user.status === 'active' ? (fa ? 'فعال' : 'Active') : (fa ? 'غیرفعال' : 'Disabled')}</span></td></tr>)}
        </tbody></table></div> : <Empty/>}
      </Panel>
      <Panel title={fa ? 'افزودن کاربر' : 'Add user'}>
        <form className="form-grid" onSubmit={createUser}>
          <Field label={fa ? 'نام کاربری' : 'Username'}>{id => <input id={id} dir="ltr" autoComplete="off" required value={username} onChange={e => setUsername(e.target.value)}/>}</Field>
          <Field label={languages[locale].name}>{id => <input id={id} required value={displayName} onChange={e => setDisplayName(e.target.value)}/>}</Field>
          <Field label={fa ? 'گذرواژه اولیه' : 'Initial password'}>{id => <input id={id} type="password" autoComplete="new-password" required value={password} onChange={e => setPassword(e.target.value)}/>}</Field>
          <div className="form-actions"><Submit busy={busy}>{languages[locale].create}</Submit></div>
        </form>
        <p className="muted fine-print">{fa ? 'پس از ایجاد کاربر، نقش دسترسی او را در بخش زیر تعیین کنید.' : 'Assign a role after creating the user.'}</p>
      </Panel>
      <Panel title={fa ? 'نقش‌های دسترسی' : 'Role assignments'}>
        <form className="form-grid" onSubmit={grant}>
          <Field label={fa ? 'کاربر' : 'User'}>{id => <select id={id} required value={selectedUser} onChange={e => setSelectedUser(e.target.value)}><option value="">—</option>{users.map(user => <option value={user.id} key={user.id}>{user.displayName} · {user.username}</option>)}</select>}</Field>
          <Field label={fa ? 'نقش' : 'Role'}>{id => <select id={id} required value={roleId} onChange={e => setRoleId(e.target.value)}><option value="">—</option>{roles.map(role => <option value={role.id} key={role.id}>{role.name}</option>)}</select>}</Field>
          <div className="form-actions"><Submit busy={busy}>{fa ? 'اختصاص نقش' : 'Assign role'}</Submit></div>
        </form>
        {selectedUser && <div className="table-wrap" style={{marginTop:'1.2rem'}}><table><thead><tr><th>{fa ? 'نقش‌های فعلی' : 'Current roles'}</th><th>{languages[locale].actions}</th></tr></thead><tbody>
          {assignments.map(assignment => <tr key={assignment.id}><td>{assignment.role_code}</td><td>
            <button className="secondary small" type="button" disabled={busy} onClick={() => {
              if (!window.confirm(fa ? 'این دسترسی لغو شود؟' : 'Revoke this role?')) return
              void perform(async () => { await call('/api/roles/revoke', { assignmentId: assignment.id }); await loadAssignments(selectedUser) })
            }}>{fa ? 'لغو نقش' : 'Revoke'}</button>
          </td></tr>)}
        </tbody></table></div>}
      </Panel>
    </>}
  </Page>
}
