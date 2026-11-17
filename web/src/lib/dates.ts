/** Presentation-only date formatting. Storage and API contracts remain Gregorian ISO dates. */
export function displayDate(value:string,locale:'fa'|'en') {
  if(!/^\d{4}-\d{2}-\d{2}$/u.test(value))return value
  const date=new Date(`${value}T12:00:00Z`)
  if(Number.isNaN(date.getTime())||date.toISOString().slice(0,10)!==value)return value
  return new Intl.DateTimeFormat(locale==='fa'?'fa-IR-u-ca-persian':'en-GB',
    {year:'numeric',month:'short',day:'numeric',timeZone:'UTC'}).format(date)
}
