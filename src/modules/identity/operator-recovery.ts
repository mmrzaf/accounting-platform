import {randomUUID} from 'node:crypto'
import type {DatabaseSync} from 'node:sqlite'
import {rowAs} from '../../platform/database/rows.ts'
import {hashPassword} from './passwords.ts'
import {code} from './validation.ts'
import {missing} from './errors.ts'

/** Trusted local installation CLI only. Never exposed through HTTP or AI. */
export async function recoverCompanyAdministrator(db:DatabaseSync,{username,newPassword}:{username:string;newPassword:string}) {
  username=code(username,'Username')
  const target=rowAs<{company_id:string;user_id:string}>(db.prepare(`SELECT u.company_id,u.id AS user_id FROM users u
    JOIN user_role_assignments a ON a.company_id=u.company_id AND a.user_id=u.id
    JOIN roles r ON r.company_id=a.company_id AND r.id=a.role_id
    WHERE u.username=? AND r.code='company-admin'`).get(username))
  if(!target) throw missing()
  const hash=await hashPassword(newPassword)
  db.exec('BEGIN IMMEDIATE')
  try {
    const result=db.prepare("UPDATE users SET password_hash=?,auth_version=auth_version+1,status='active' WHERE id=? AND company_id=?")
      .run(hash,target.user_id,target.company_id)
    if(result.changes!==1) throw missing()
    db.prepare('UPDATE sessions SET revoked_at=? WHERE company_id=? AND user_id=? AND revoked_at IS NULL')
      .run(new Date().toISOString(),target.company_id,target.user_id)
    db.prepare('DELETE FROM login_throttles WHERE username=?').run(username)
    db.prepare(`INSERT INTO security_audit(id,company_id,actor_user_id,action,outcome,subject_type,subject_id,details)
      VALUES(?,?,?,?,?,?,?,?)`).run(randomUUID(),target.company_id,null,'operator.admin_recovery','success','user',target.user_id,'{"via":"local_cli"}')
    db.exec('COMMIT')
    return {ok:true,username,sessionsRevoked:true}
  }catch(error){db.exec('ROLLBACK');throw error}
}
