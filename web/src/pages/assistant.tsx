import { useState, type FormEvent } from 'react'
import { useApplication } from '../app/context'
import { Alert, Page, Panel, Submit } from '../components/ui'
import { newRequestKey, request } from '../lib/api'
import { languages } from '../lib/i18n'
interface Turn { id?: string; reply?: string; status?: string; action?: { id: string; tool: string; input: unknown; fingerprint: string; state: string; result: unknown } | null; [key: string]: unknown }
export function Assistant(){
  const {companyId,session,locale}=useApplication()
  const [message,setMessage]=useState('')
  const [result,setResult]=useState<Turn|null>(null)
  const [error,setError]=useState<string|null>(null)
  const [busy,setBusy]=useState(false)
  const [mode,setMode]=useState<'review'|'auto'>('review')
  async function send(e:FormEvent<HTMLFormElement>){e.preventDefault();setBusy(true);setError(null)
    try{const turn=await request<Turn>('/api/ai/turns',session?.csrfToken,{companyId,message,clientRequestId:newRequestKey(),executionMode:mode});setResult(turn);setMessage('')}
    catch(cause){setError(cause instanceof Error?cause.message:String(cause))}finally{setBusy(false)} }
  async function decide(decision: 'approve' | 'reject') {
    if (!result?.action || result.action.state !== 'awaiting_approval') return
    setBusy(true); setError(null)
    try {
      await request(`/api/ai/actions/${result.action.id}/${decision}`, session?.csrfToken,
        { companyId, expectedFingerprint: result.action.fingerprint })
      const updated = await request<Turn>(`/api/ai/turns/${result.id}?companyId=${encodeURIComponent(companyId)}`)
      setResult(updated)
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setBusy(false) }
  }
  return <Page title={languages[locale].assistant} description={locale==='fa'?'دستیار هوشمند در چارچوب مجوزهای همین کاربر عمل می‌کند.':'AI actions use the same permissions and services as the manual interface.'}>
    <Alert text={error}/>
    <Panel title={locale==='fa'?'درخواست جدید':'New request'}><form className="stack" onSubmit={e=>void send(e)}>
      <label htmlFor="assistant-message">{locale==='fa'?'چه کاری انجام شود؟':'What would you like to do?'}</label>
      <textarea id="assistant-message" rows={5} value={message} onChange={e=>setMessage(e.target.value)} required maxLength={4000} placeholder={locale==='fa'?'مثلاً فاکتورهای پرداخت‌نشده را پیدا کن.':'For example, find unpaid invoices.'}/>
      <label htmlFor="assistant-mode">{locale==='fa'?'شیوه اجرا':'Execution policy'}</label>
      <select id="assistant-mode" value={mode} onChange={e=>setMode(e.target.value as 'review'|'auto')}>
        <option value="review">{locale==='fa'?'بازبینی قبل از اجرا':'Review before execution'}</option>
        <option value="auto">{locale==='fa'?'اجرای عملیات مجاز':'Execute permitted operations'}</option>
      </select>
      <div><Submit busy={busy}>{locale==='fa'?'ارسال':'Send'}</Submit></div>
    </form></Panel>
    {result&&<Panel title={locale==='fa'?'نتیجه':'Result'}><div className="ai-result" role="status">
      <p>{result.reply ?? (locale==='fa'?'پاسخ ساخت‌یافته دریافت شد.':'Structured result received.')}</p>
      {result.status&&<p className="muted">{result.status}</p>}
      {result.action?.state==='awaiting_approval'&&<div className="ai-approval">
        <p><strong>{locale==='fa'?'عملیات پیشنهادی':'Proposed operation'}:</strong> {result.action.tool}</p>
        <pre>{JSON.stringify(result.action.input,null,2)}</pre>
        <div className="toolbar"><button disabled={busy} onClick={()=>void decide('approve')}>{locale==='fa'?'تأیید و اجرا':'Approve and execute'}</button>
          <button className="secondary" disabled={busy} onClick={()=>void decide('reject')}>{locale==='fa'?'رد عملیات':'Reject'}</button></div>
      </div>}
      <details><summary>{locale==='fa'?'جزئیات فنی نتیجه':'Technical details'}</summary><pre>{JSON.stringify(result,null,2)}</pre></details>
    </div></Panel>}
    <p className="muted fine-print">{locale==='fa'?'دستیار بانک واقعی را کنترل نمی‌کند. ثبت پرداخت در نرم‌افزار به معنی انتقال پول نیست.':'The assistant records accounting operations; it does not transfer actual bank funds.'}</p>
  </Page>
}
