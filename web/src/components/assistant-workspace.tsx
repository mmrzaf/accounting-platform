import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Link, useLocation } from '@tanstack/react-router'
import { useApplication } from '../app/context'
import { ApiError, money, newRequestKey } from '../lib/api'
import { Icon } from './icons'
import { Alert } from './ui'

interface BusinessLink {kind:'invoice'|'payment'|'contact';id:string;label:string;path:string}
interface ActionPreview {
  title:string;description:string;risk:'draft'|'financial';
  fields:{label:string;value:string}[];
  lines?:{description:string;quantity:string;unitPriceMinor:string;totalMinor:string}[];
  currency?:string;decimals?:number;totalMinor?:string;paymentMinor?:string;outstandingMinor?:string
}
interface AssistantAction {id:string;fingerprint:string;state:'awaiting_approval'|'executing'|'completed'|'failed'|'rejected';preview:ActionPreview;links:BusinessLink[];errorCode?:string|null}
interface AssistantTurn {id:string;conversationId:string;message:string;reply:string|null;status:'processing'|'completed'|'awaiting_approval'|'failed';createdAt:string;action:AssistantAction|null}
interface Conversation {id:string;title:string;createdAt:string;updatedAt:string;archived?:boolean;turns?:AssistantTurn[]}
interface ConversationList {items:Conversation[]}

function DocumentLinks({links,onNavigate}:{links:BusinessLink[];onNavigate?:()=>void}) {
  return <div className="assistant-record-links">{links.map(link=>{
    const label=<><Icon name={link.kind==='contact'?'contacts':link.kind==='payment'?'payment':'invoice'} size={16}/>{link.label}</>
    return link.kind==='invoice'?<Link key={`${link.kind}:${link.id}`} to="/invoices" search={{record:link.id}} onClick={onNavigate} className="assistant-record-link">{label}</Link>:
      link.kind==='payment'?<Link key={`${link.kind}:${link.id}`} to="/payments" search={{record:link.id}} onClick={onNavigate} className="assistant-record-link">{label}</Link>:
      <Link key={`${link.kind}:${link.id}`} to="/contacts" search={{record:link.id}} onClick={onNavigate} className="assistant-record-link">{label}</Link>
  })}</div>
}
const persianTitles:Record<string,string>={
  'Record sale':'ثبت فروش','Record purchase':'ثبت خرید','Record receipt':'ثبت دریافت','Record payment':'ثبت پرداخت',
  'Create contact':'ایجاد طرف حساب','Post invoice':'ثبت قطعی فاکتور','Post payment':'ثبت قطعی پرداخت',
  'Allocate payment':'تخصیص پرداخت','Prepare invoice':'تهیه پیش‌نویس فاکتور','Prepare payment':'تهیه پیش‌نویس پرداخت',
}
const persianFields:Record<string,string>={
  'Contact':'طرف حساب','Invoice date':'تاریخ فاکتور','Payment date':'تاریخ پرداخت',
  'Description':'شرح','Bank / cash account':'حساب بانک یا صندوق','Name':'نام',
}
function localizedPreview(value:string,locale:'fa'|'en',dictionary:Record<string,string>){
  return locale==='fa'?(dictionary[value]??value):value
}
function ApprovalCard({action,locale,busy,onDecision,onNavigate}:{action:AssistantAction;locale:'fa'|'en';busy:boolean;
  onDecision:(decision:'approve'|'reject')=>void;onNavigate?:()=>void}) {
  const fa=locale==='fa',preview=action.preview,decimals=preview.decimals??0
  const amount=(value:string)=>money(value,decimals,locale,preview.currency)
  return <section className="assistant-operation" aria-label={fa?'عملیات حسابداری':'Business operation'}>
    <div className="assistant-operation-heading"><strong>{fa?'عملیات آماده':'Prepared operation'} · {localizedPreview(preview.title,locale,persianTitles)}</strong>
      <span className="status-chip">{action.state==='awaiting_approval'?(fa?'در انتظار بررسی':'Needs review'):
        action.state==='completed'?(fa?'انجام‌شده':'Completed'):
        action.state==='rejected'?(fa?'لغوشده':'Cancelled'):
        action.state==='failed'?(fa?'ناموفق':'Failed'):(fa?'در حال اجرا':'Executing')}</span></div>
    <p className="muted">{preview.description}</p>
    <dl className="assistant-fields">{preview.fields.map((field,index)=><div key={`${field.label}:${index}`}><dt>{localizedPreview(field.label,locale,persianFields)}</dt><dd>{field.value}</dd></div>)}</dl>
    {preview.lines&&<div className="assistant-preview-lines"><div className="assistant-preview-line assistant-preview-header"><span>{fa?'شرح':'Description'}</span><span>{fa?'مقدار':'Qty'}</span><span>{fa?'جمع':'Total'}</span></div>
      {preview.lines.map((line,index)=><div className="assistant-preview-line" key={`${index}:${line.description}`}>
        <span>{line.description}</span><span dir="ltr">{line.quantity}</span><strong dir="ltr">{amount(line.totalMinor)}</strong>
      </div>)}</div>}
    {preview.totalMinor&&<dl className="assistant-amounts"><div><dt>{fa?'مبلغ کل':'Total'}</dt><dd dir="ltr">{amount(preview.totalMinor)}</dd></div>
      {preview.paymentMinor&&<div><dt>{fa?'پرداخت ثبت‌شده':'Recorded payment'}</dt><dd dir="ltr">{amount(preview.paymentMinor)}</dd></div>}
      {preview.outstandingMinor&&<div><dt>{fa?'مانده':'Outstanding'}</dt><dd dir="ltr">{amount(preview.outstandingMinor)}</dd></div>}</dl>}
    {!preview.totalMinor&&preview.paymentMinor&&<p className="assistant-money" dir="ltr">{amount(preview.paymentMinor)}</p>}
    {action.state==='awaiting_approval'&&<div className="assistant-approval-controls"><button type="button" disabled={busy} onClick={()=>onDecision('approve')}>{fa?'تأیید و ثبت':'Confirm and record'}</button>
      <button type="button" className="secondary" disabled={busy} onClick={()=>onDecision('reject')}>{fa?'لغو':'Cancel'}</button></div>}
    {action.state==='completed'&&<DocumentLinks links={action.links} {...(onNavigate?{onNavigate}:{})}/>}
    {action.state==='failed'&&<p className="muted">{fa?'این عملیات ثبت نشد.':'The operation was not recorded.'}</p>}
    {preview.risk==='financial'&&<p className="muted fine-print">{fa?'ثبت دریافت/پرداخت فقط ثبت رویداد مالی در نرم‌افزار است؛ انتقال بانکی انجام نمی‌شود.':'Recording a receipt/payment only updates the books; it never transfers funds.'}</p>}
  </section>
}
function currentPage(path:string): 'overview'|'contacts'|'invoices'|'payments'|'ledger'|'inventory'|'settings'|'assistant' {
  const page=path.slice(1)
  if(page==='contacts'||page==='invoices'||page==='payments'||page==='ledger'||page==='inventory'||page==='settings'||page==='assistant')return page
  return 'overview'
}

export function AssistantWorkspace({compact=false,onNavigate}:{compact?:boolean;onNavigate?:()=>void}) {
  const {call,locale,assistantDraft,consumeAssistantDraft,assistantSelection}=useApplication()
  const location=useLocation()
  const fa=locale==='fa'
  const [conversations,setConversations]=useState<Conversation[]>([])
  const [conversationId,setConversationId]=useState<string|null>(null)
  const [turns,setTurns]=useState<AssistantTurn[]>([])
  const [message,setMessage]=useState('')
  const [executionMode]=useState<'review'|'auto'>('auto')
  const [busy,setBusy]=useState(false)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState<string|null>(null)
  const [disabled,setDisabled]=useState(false)
  const [restricted,setRestricted]=useState(false)
  const scrollRef=useRef<HTMLDivElement>(null)
  const conversationRef=useRef<string|null>(null)
  const requestKeyRef=useRef<string|null>(null)
  const activePage=currentPage(location.pathname)
  const contextPage=compact ? activePage : assistantSelection?.page??'assistant'
  const record=assistantSelection?.page===contextPage?assistantSelection.record:undefined
  const assistantContext={page:contextPage,...(record?{record}:{})}
  const refreshList=useCallback(async()=>{
    const data=await call<ConversationList>('/api/ai/conversations')
    setConversations(data.items)
  },[call])
  const selectConversation=useCallback(async(id:string)=>{
    setError(null)
    requestKeyRef.current=null
    const conversation=await call<Conversation>(`/api/ai/conversations/${id}`)
    setConversationId(conversation.id)
    conversationRef.current=conversation.id
    setTurns(conversation.turns??[])
  },[call])
  const initialPromptRef=useRef(assistantDraft)
  useEffect(()=>{let active=true
    void call<{ready:boolean}>('/api/ai/status').then(async status=>{
      if(!active)return
      setDisabled(!status.ready)
      const data=await call<ConversationList>('/api/ai/conversations')
      if(!active)return
      setConversations(data.items)
      if(status.ready&&!initialPromptRef.current && data.items[0] && !conversationRef.current) await selectConversation(data.items[0].id)
      if(active)setLoading(false)
    }).catch(cause=>{if(active){setLoading(false);if(cause instanceof ApiError && cause.status===403){setRestricted(true);setDisabled(true)}else if(cause instanceof ApiError && (cause.code==='AI_DISABLED'||cause.code==='CONFIGURATION_REQUIRED'||cause.status===503||cause.status===404))setDisabled(true);else setError(cause instanceof Error?cause.message:String(cause))}})
    return()=>{active=false}
  },[call,selectConversation])
  useEffect(()=>{if(assistantDraft){setMessage(assistantDraft);consumeAssistantDraft()}},[assistantDraft,consumeAssistantDraft])
  useEffect(()=>{scrollRef.current?.scrollIntoView({block:'end',behavior:'auto'})},[turns.length,busy])
  async function send(event?:FormEvent<HTMLFormElement>){event?.preventDefault();const prompt=message.trim();if(!prompt||busy)return
    const requestKey=requestKeyRef.current??newRequestKey();requestKeyRef.current=requestKey
    setError(null);setBusy(true)
    try{
      const result=await call<AssistantTurn>('/api/ai/turns',{message:prompt,clientRequestId:requestKey,
        ...(conversationRef.current?{conversationId:conversationRef.current}:{}),context:assistantContext,executionMode})
      requestKeyRef.current=null
      setMessage('')
      await selectConversation(result.conversationId)
      await refreshList()
    }catch(cause){
      if(cause instanceof ApiError&&cause.code==='AI_DISABLED')setDisabled(true)
      setError(cause instanceof Error?cause.message:String(cause))
    }finally{setBusy(false)}
  }
  function composerKey(event:KeyboardEvent<HTMLTextAreaElement>){
    if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();void send()}
  }
  async function decide(action:AssistantAction,decision:'approve'|'reject'){
    if(busy)return;setBusy(true);setError(null)
    try{
      await call(`/api/ai/actions/${action.id}/${decision}`,{expectedFingerprint:action.fingerprint})
      if(conversationRef.current)await selectConversation(conversationRef.current)
      await refreshList()
    }catch(cause){setError(cause instanceof Error?cause.message:String(cause))}
    finally{setBusy(false)}
  }
  async function archive(id:string){if(busy)return;setBusy(true);setError(null)
    try{await call(`/api/ai/conversations/${id}`,{},'DELETE')
      if(conversationRef.current===id){conversationRef.current=null;setConversationId(null);setTurns([])}
      await refreshList()
    }catch(cause){setError(cause instanceof Error?cause.message:String(cause))}finally{setBusy(false)}
  }
  function newConversation(){conversationRef.current=null;setConversationId(null);setTurns([]);setError(null);requestKeyRef.current=null}
  const pending=turns.some(turn=>turn.status==='processing'||turn.status==='awaiting_approval')
  const suggestions=fa?['فاکتورهای پرداخت‌نشده را پیدا کن','مانده حساب‌ها را توضیح بده','یک خرید جدید ثبت کن']:
    ['Find unpaid invoices','Explain our account balances','Record a new purchase']
  return <section className={`assistant-workspace ${compact?'assistant-compact':''}`} aria-label={fa?'دستیار حسابداری':'Accounting assistant'}>
    <aside className="assistant-history" aria-label={fa?'گفتگوها':'Conversations'}>
      <button type="button" className="assistant-new" onClick={newConversation} disabled={busy}><Icon name="plus" size={17}/>{fa?'گفتگوی جدید':'New conversation'}</button>
      <div className="assistant-conversation-list">{conversations.map(c=><div className={`assistant-conversation-item ${conversationId===c.id?'is-active':''}`} key={c.id}>
        <button type="button" className="assistant-conversation-name" onClick={()=>void selectConversation(c.id)} disabled={busy}>{c.title}</button>
        <button type="button" className="assistant-archive" disabled={busy} aria-label={fa?'بایگانی گفتگو':'Archive conversation'} title={fa?'بایگانی':'Archive'} onClick={()=>void archive(c.id)}>×</button>
      </div>)}</div>
    </aside>
    <div className="assistant-main">
      <div className="assistant-main-heading"><div><h2>{fa?'دستیار مالی':'Financial assistant'}</h2>
        <p className="muted">{fa?'در همین محیط کار می‌کند؛ اسناد را پیدا می‌کند و عملیات مجاز را ثبت می‌کند.':'Works in your accounting workspace. Searches records and completes authorized operations.'}</p></div></div>
      <div className="assistant-transcript" role="log" aria-label={fa?'پیام‌های گفتگو':'Conversation messages'} aria-live="polite">
        {loading?<p className="muted">{fa?'بارگذاری…':'Loading…'}</p>:null}
        {disabled&&<div className="assistant-disabled-panel"><Icon name="assistant" size={28}/><h3>{restricted?(fa?'دسترسی به دستیار محدود است':'Assistant access is restricted'):(fa?'دستیار هنوز آماده نیست':'Assistant is not ready yet')}</h3><p>{restricted?(fa?'نقش کاربری شما مجوز استفاده از دستیار را ندارد. برای دسترسی با مدیر شرکت تماس بگیرید.':'Your role does not have assistant access. Contact your company administrator.'):(fa?'مدیر باید اتصال هوش مصنوعی را در سرور فعال و ارائه‌دهنده مدل را در تنظیمات تعریف کند. حسابداری بدون دستیار همچنان کار می‌کند.':'An administrator must enable AI on the server and configure a model in Settings. Accounting continues to work without AI.')}</p>{!restricted&&<><Link to="/settings" onClick={onNavigate} className="inline-action">{fa?'رفتن به تنظیمات':'Open Settings'} <Icon name="arrow" size={16}/></Link><p className="assistant-configuration-note">{fa?'کلید رمزنگاری را می‌توان با دستور pnpm run app:ai-initialize ساخت.':'Initialize the local encryption key with pnpm run app:ai-initialize.'}</p></>}</div>}
        {!disabled&&!loading&&turns.length===0&&<div className="assistant-welcome"><Icon name="assistant" size={25}/>
          <h3>{fa?'چه کاری باید انجام شود؟':'What should we work on?'}</h3>
          <p className="muted">{fa?'می‌توانید به زبان معمولی درباره خرید، فروش، تسویه و حساب‌ها سؤال کنید.':'Ask about purchases, sales, settlements, contacts, or the ledger in plain language.'}</p>
          <div className="assistant-suggestions">{suggestions.map(s=><button type="button" key={s} className="assistant-suggestion" onClick={()=>setMessage(s)}>{s}</button>)}</div>
        </div>}
        {!disabled&&turns.map(turn=><div className="assistant-exchange" key={turn.id}>
          <div className="assistant-bubble assistant-user-message">{turn.message}</div>
          <div className="assistant-bubble assistant-answer">
            <div className="assistant-answer-name"><Icon name="assistant" size={15}/>{fa?'دستیار':'Assistant'}</div>
            {turn.reply&&<p>{fa&&turn.action?.state==='completed'&&turn.reply.endsWith('The accounting records were updated successfully.') ? 'عملیات با موفقیت در حسابداری ثبت شد.' : turn.reply}</p>}
            {turn.action&&<ApprovalCard action={turn.action} locale={locale} busy={busy} onDecision={d=>void decide(turn.action!,d)} {...(onNavigate?{onNavigate}:{})}/>}
            {turn.status==='processing'&&<p className="muted">{fa?'در حال بررسی…':'Working on it…'}</p>}
          </div>
        </div>)}
        {busy&&<p className="assistant-pending muted" role="status">{fa?'در حال پردازش…':'Processing…'}</p>}
        <div ref={scrollRef}/>
      </div>
      {!disabled&&<form className="assistant-composer" onSubmit={event=>void send(event)}>
        {!disabled&&<Alert text={error}/>}
        <label className="sr-only" htmlFor={compact?'ai-drawer-prompt':'ai-page-prompt'}>{fa?'پیام به دستیار':'Message to assistant'}</label>
        <textarea id={compact?'ai-drawer-prompt':'ai-page-prompt'} rows={compact?3:4} value={message} onChange={e=>{setMessage(e.target.value);requestKeyRef.current=null}}
          onKeyDown={composerKey} placeholder={fa?'مثلاً: از علی ۲۰ عدد خریدیم، ۲۰ میلیون تومان پرداخت شد…':'Example: Record a purchase from Ali with a partial payment…'} maxLength={4000}
          disabled={busy||pending||disabled}/>
        <div className="assistant-composer-actions"><button type="submit" disabled={!message.trim()||busy||pending||disabled}>{fa?'ارسال':'Send'} <Icon name="arrow" size={16}/></button></div>
        <p className="assistant-trust-note">{fa?'دستیار فقط با مجوزهای شما و سیاست شرکت اقدام می‌کند. اطلاعات ضروری ممکن است به ارائه‌دهنده مدل ارسال شود.':'The assistant follows your permissions and company policy. Necessary context may be sent to the selected model.'}</p>
      </form>}
    </div>
  </section>
}
