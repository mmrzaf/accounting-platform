import type { ReactNode, SVGProps } from 'react'

export type IconName = 'home'|'contacts'|'invoice'|'payment'|'ledger'|'inventory'|'assistant'|'settings'|'users'|'search'|'menu'|'close'|'chevron'|'arrow'|'logout'|'plus'|'check'|'sun'|'globe'|'keyboard'|'refresh'
const paths: Record<IconName, ReactNode> = {
  home:<><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
  contacts:<><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M5.5 16c.8-2 6.2-2 7 0M15 9h4M15 13h4M15 17h3"/></>,
  invoice:<><path d="M5 3h11l3 3v15l-3-2-3 2-3-2-3 2-2-2V3Z"/><path d="M9 9h6M9 13h6"/></>,
  payment:<><rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18M7 16h4M8 6V4h10"/></>,
  ledger:<><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 3v18M12 8h5M12 12h5M12 16h3"/></>,
  inventory:<><path d="m3 7 9-4 9 4v10l-9 4-9-4V7Zm0 0 9 4 9-4M12 11v10M7.5 5l9 4"/></>,
  assistant:<><path d="m12 2 2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2L12 2Z"/><path d="M19 3v4M17 5h4"/></>,
  settings:<><path d="M9.5 3.5h5l.6 2.3 1.8 1 2.3-.6 2.5 4.3-1.7 1.7v2l1.7 1.7-2.5 4.3-2.3-.6-1.8 1-.6 2.3h-5l-.6-2.3-1.8-1-2.3.6-2.5-4.3 1.7-1.7v-2L2.3 10.5l2.5-4.3 2.3.6 1.8-1 .6-2.3Z"/><circle cx="12" cy="13" r="3"/></>,
  users:<><circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M17 5a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 5"/></>,
  search:<><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/></>,
  menu:<path d="M4 7h16M4 12h16M4 17h16"/>,
  close:<path d="M5 5l14 14M19 5 5 19"/>,
  chevron:<path d="m9 18 6-6-6-6"/>,
  arrow:<path d="M5 12h14m-6-6 6 6-6 6"/>,
  logout:<><path d="M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5"/><path d="M13 16l4-4-4-4m-7 4h11"/></>,
  plus:<path d="M12 4v16M4 12h16"/>,
  check:<path d="m5 12 4 4L19 6"/>,
  sun:<><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.4 1.4m11.34 11.34 1.4 1.4M2 12h2m16 0h2M4.93 19.07l1.4-1.4M17.67 6.33l1.4-1.4"/></>,
  globe:<><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2c6 5 6 15 0 20M12 2c-6 5-6 15 0 20"/></>,
  keyboard:<><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M10 13h.01M14 13h.01M18 13h.01M7 16h10"/></>,
  refresh:<path d="M20 7v5h-5M4 17v-5h5M6 9a7 7 0 0 1 12-2l2 5M4 12l2 5a7 7 0 0 0 12-2"/>,
}
export function Icon({name,size=19,...props}: {name:IconName;size?:number} & Omit<SVGProps<SVGSVGElement>,'children'>) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>{paths[name]}</svg>
}
