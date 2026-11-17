import { useEffect, useState, type FormEvent } from 'react'
import { useApplication } from '../app/context'
import { ApiError } from '../lib/api'
import { Alert, Field, Panel, Submit } from './ui'

interface ProviderSettings {baseUrl:string;model:string;supportsTools:boolean;enabled:boolean;hasApiKey:boolean}
interface PolicySettings {autoDrafts:boolean;autoPost:boolean}
/** Administrative configuration. Credentials are write-only and never returned to the browser. */
export function AiSettings(){
  const {locale,call}=useApplication()
  const fa=locale==='fa'
  const [provider,setProvider]=useState<ProviderSettings|null>(null)
  const [policy,setPolicy]=useState<PolicySettings|null>(null)
  const [baseUrl,setBaseUrl]=useState('https://api.openai.com/v1')
  const [model,setModel]=useState('')
  const [apiKey,setApiKey]=useState('')
  const [supportsTools,setSupportsTools]=useState(true)
  const [enabled,setEnabled]=useState(false)
  const [autoDrafts,setAutoDrafts]=useState(true)
  const [autoPost,setAutoPost]=useState(false)
  const [available,setAvailable]=useState(true)
  const [restricted,setRestricted]=useState(false)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState<string|null>(null)
  const [notice,setNotice]=useState<string|null>(null)
  useEffect(()=>{
    let alive=true
    void call<ProviderSettings|null>('/api/ai/provider').then(result=>{
      if(!alive)return
      setProvider(result)
      if(result){setBaseUrl(result.baseUrl);setModel(result.model);setEnabled(result.enabled);setSupportsTools(result.supportsTools)}
      return call<PolicySettings>('/api/ai/policy').then(data=>{
        if(alive){setPolicy(data);setAutoDrafts(data.autoDrafts);setAutoPost(data.autoPost)}
      })
    }).catch(cause=>{if(!alive)return
      if(cause instanceof ApiError&&cause.status===403)setRestricted(true)
      else if(cause instanceof ApiError&&(cause.code==='AI_DISABLED'||cause.status===503))setAvailable(false)
      else setError(cause instanceof Error?cause.message:String(cause))
    })
    return()=>{alive=false}
  },[call])
  async function saveProvider(event:FormEvent<HTMLFormElement>){event.preventDefault();setError(null);setNotice(null);setBusy(true)
    try{const result=await call<ProviderSettings>('/api/ai/provider',{
      baseUrl,model,supportsTools,enabled,...(apiKey?{apiKey}:{})},'PUT')
      setProvider(result);setApiKey('');setNotice(fa?'ارائه‌دهنده ذخیره شد.':'Provider saved.')
    }catch(cause){setError(cause instanceof Error?cause.message:String(cause))}finally{setBusy(false)}
  }
  async function savePolicy(event:FormEvent<HTMLFormElement>){event.preventDefault();setError(null);setNotice(null);setBusy(true)
    try{const result=await call<PolicySettings>('/api/ai/policy',{autoDrafts,autoPost},'PUT')
      setPolicy(result);setNotice(fa?'سیاست اجرا ذخیره شد.':'Execution policy saved.')
    }catch(cause){setError(cause instanceof Error?cause.message:String(cause))}finally{setBusy(false)}
  }
  if(restricted)return <Panel title={fa?'تنظیمات هوش مصنوعی':'AI configuration'}>
    <p className="muted">{fa?'مدیر شرکت می‌تواند ارائه‌دهنده و سطح اختیار دستیار را تنظیم کند.':'The company administrator manages the assistant provider and autonomy policy.'}</p>
  </Panel>
  if(!available)return <Panel title={fa?'هوش مصنوعی':'AI assistant'}><p className="muted">{fa?'هوش مصنوعی برای این نصب هنوز فعال نشده است. مدیر سیستم باید کلید اصلی رمزنگاری را در پیکربندی سرور تنظیم کند.':'AI is not enabled for this installation. Set APP_AI_MASTER_KEY_BASE64 on the server, then configure a provider here.'}</p></Panel>
  return <Panel title={fa?'هوش مصنوعی و حریم خصوصی':'AI & privacy'}>
    <p className="muted">{fa?'دستیار اختیاری است. برای پاسخ، متن درخواست و تنها اطلاعات ضروری که ابزارهای مجاز بازیابی می‌کنند به ارائه‌دهنده انتخابی ارسال می‌شود.':'AI is optional. Requests and necessary permission-scoped business records may be sent to the configured provider.'}</p>
    <Alert text={error}/><Alert text={notice} type="success"/>
    <form className="stack" onSubmit={event=>void saveProvider(event)}>
      <div className="form-grid">
        <Field label={fa?'نشانی API سازگار با OpenAI':'OpenAI-compatible API base URL'}>{id=><input id={id} dir="ltr" type="url" required maxLength={512} value={baseUrl} onChange={e=>setBaseUrl(e.target.value)}/>}</Field>
        <Field label={fa?'مدل':'Model'}>{id=><input id={id} dir="ltr" required maxLength={128} value={model} onChange={e=>setModel(e.target.value)} placeholder="model-id"/>}</Field>
        <Field label={fa?'کلید API':'API key'} {...(provider?.hasApiKey?{hint:fa?'خالی بگذارید تا کلید فعلی حفظ شود.':'Leave blank to keep the existing key.'}:{})}>{id=><input id={id} dir="ltr" type="password" autoComplete="off" maxLength={4096} value={apiKey} onChange={e=>setApiKey(e.target.value)} required={!provider?.hasApiKey}/>}</Field>
      </div>
      <label className="assistant-check"><input type="checkbox" checked={supportsTools} onChange={e=>setSupportsTools(e.target.checked)}/>{fa?'مدل از فراخوانی ابزارها پشتیبانی می‌کند':'Model supports tool/function calling'}</label>
      <label className="assistant-check"><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/>{fa?'فعال‌کردن دستیار':'Enable assistant'}</label>
      <div><Submit busy={busy}>{fa?'ذخیره ارائه‌دهنده':'Save provider'}</Submit></div>
    </form>
    <div className="assistant-settings-divider"/>
    <h3>{fa?'اختیارات اجرا':'Execution permissions'}</h3>
    <p className="muted">{fa?'دستیار هیچ‌وقت مجوز بیشتر از کاربر ندارد. ثبت خودکار مالی تنها برای درخواست صریح کاربر و در صورت فعال‌بودن این سیاست است.':'AI never exceeds the user’s permissions. Automatic financial posting only applies to explicit requests when enabled here.'}</p>
    <form className="stack" onSubmit={event=>void savePolicy(event)}>
      <label className="assistant-check"><input type="checkbox" checked={autoDrafts} onChange={e=>setAutoDrafts(e.target.checked)}/>{fa?'ایجاد خودکار پیش‌نویس‌ها و طرف‌حساب‌ها':'Automatically create drafts and contacts'}</label>
      <label className="assistant-check"><input type="checkbox" checked={autoPost} onChange={e=>setAutoPost(e.target.checked)}/>{fa?'ثبت قطعی عملیات مالی مجاز بدون تأیید مجدد':'Allow explicit authorized financial requests to post without additional approval'}</label>
      {autoPost&&<p className="muted fine-print">{fa?'این تنظیم تنها برای کاربرانی اثر دارد که اجازه ثبت مالی دارند. برگشت اسناد، تغییر مجوزها و بستن دوره مالی برای AI فعال نیست.':'Only users who can post manually benefit. Reversals, permission changes and period closing remain unavailable to AI.'}</p>}
      <div><Submit busy={busy}>{fa?'ذخیره سیاست':'Save policy'}</Submit></div>
      {policy&&<p className="muted fine-print">{fa?'وضعیت فعلی سیاست از سرور بارگذاری شد.':'Current company policy loaded from the server.'}</p>}
    </form>
  </Panel>
}
