import test from 'node:test'
import assert from 'node:assert/strict'
import {encodeCsv} from '../../web/src/lib/export.ts'

test('CSV retains exact monetary strings and escapes spreadsheet formulas',()=>{
  const csv=encodeCsv([
    ['Account','Amount','Currency'],
    ['Bank','900719925474099312345.00','IRR'],
    ['=1+1','+SUM(A1:A2)','-1000'],
    ['Name "quoted"','line\nbreak','حساب بانکی'],
  ])
  assert.ok(csv.startsWith('\uFEFF'))
  assert.match(csv,/"900719925474099312345\.00"/u)
  assert.match(csv,/"'=1\+1"/u)
  assert.match(csv,/"'\+SUM\(A1:A2\)"/u)
  assert.match(csv,/"-1000"/u)
  assert.match(csv,/"Name ""quoted"""/u)
  assert.match(csv,/"line\nbreak"/u)
  assert.match(csv,/حساب بانکی/u)
  assert.ok(csv.endsWith('\r\n'))
})
