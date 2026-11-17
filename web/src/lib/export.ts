/** Spreadsheet-safe UTF-8 CSV. Values are strings so no financial precision is lost. */
export function encodeCsv(rows: readonly (readonly string[])[]): string {
  const escape = (input:string):string => {
    // Spreadsheet applications interpret leading formula metacharacters even
    // inside CSV quotes. Prefix a literal apostrophe for untrusted text.
    const guarded = /^[\s]*[=+@\-\t\r]/u.test(input) && !/^-?\d+(?:\.\d+)?$/u.test(input)
      ? `'${input}` : input
    return `"${guarded.replaceAll('"','""')}"`
  }
  return `\uFEFF${rows.map(row=>row.map(escape).join(',')).join('\r\n')}\r\n`
}
/** Explicit browser-only download; callers choose authoritative rows and scope. */
export function downloadCsv(filename:string, rows: readonly (readonly string[])[]):void {
  const name = filename.replace(/[^a-zA-Z0-9_.-]/gu,'_').slice(0,120)
  const blob = new Blob([encodeCsv(rows)],{type:'text/csv;charset=utf-8'})
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  try {
    anchor.href=url
    anchor.download=name.endsWith('.csv')?name:`${name}.csv`
    document.body.append(anchor)
    anchor.click()
  } finally {
    anchor.remove()
    // Do not revoke before the browser has begun the download.
    setTimeout(()=>URL.revokeObjectURL(url),1000)
  }
}
