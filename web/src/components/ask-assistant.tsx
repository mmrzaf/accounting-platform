import { useApplication } from '../app/context'
import { Icon } from './icons'
export function AskAssistant({prompt,label}:{prompt:string;label?:string}){
  const {locale,openAssistant}=useApplication()
  return <button type="button" className="secondary assistant-context-action" onClick={()=>openAssistant(prompt)}>
    <Icon name="assistant" size={16}/>{label??(locale==='fa'?'از دستیار بپرسید':'Ask assistant')}
  </button>
}
