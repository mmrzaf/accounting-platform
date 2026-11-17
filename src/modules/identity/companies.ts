import {rowAs} from '../../platform/database/rows.ts'
import {requiredString} from './validation.ts'
import {missing} from './errors.ts'
import {publicCompany} from './presenters.ts'
import type {CompanyRow,AuthInput} from './types.ts'
import type {IdentityContext} from './context.ts'

export function createCompanyService(ctx:IdentityContext) {
  const {db,requireActor,audit,transaction}=ctx
  function readCompany({sessionToken}:AuthInput) {
    const a=requireActor(sessionToken,'company.read')
    const company=rowAs<CompanyRow>(db.prepare('SELECT id,name,status FROM companies WHERE id=?').get(a.companyId))
    if (!company) throw missing()
    return publicCompany(company)
  }
  function renameCompany({sessionToken,name}:AuthInput & {name:string}) {
    name=requiredString(name,'Company name')
    return transaction(db,()=>{
      const a=requireActor(sessionToken,'company.manage')
      db.prepare('UPDATE companies SET name=? WHERE id=?').run(name,a.companyId)
      audit({companyId:a.companyId,actorId:a.userId,action:'company.rename',subjectType:'company',subjectId:a.companyId})
      return {id:a.companyId,name}
    })
  }
  return Object.freeze({readCompany,renameCompany})
}
