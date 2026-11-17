import { test, expect, type Page } from '@playwright/test'

async function login(page:Page) {
  await page.goto('/')
  await page.locator('#login-locale').selectOption('en')
  await page.getByRole('textbox',{name:'Username'}).fill('e2eowner')
  await page.getByLabel('Password').fill('Browser E2E test credentials only 2026')
  await page.getByRole('button',{name:'Sign in'}).click()
  await expect(page.locator('.app-sidebar')).toContainText('Acceptance Company')
}

test('company is derived from user session with no tenant or company selector',async({page})=>{
  await login(page)
  await expect(page.locator('select[name="companyId"],input[name="organizationSlug"]')).toHaveCount(0)
  await expect(page.getByRole('link',{name:'Invoices'})).toBeVisible()
  await page.goto('/invoices')
  await expect(page.getByRole('button',{name:'New invoice'})).toBeVisible()
})

test('posted invoice balances appear in the ledger without technical posting inputs',async({page})=>{
  await login(page)
  await page.goto('/invoices')
  await page.getByRole('button',{name:'New invoice'}).click()
  await page.getByLabel('Contact',{exact:true}).selectOption({label:'Test Supplier'})
  await page.getByLabel('Invoice description').fill('Browser acceptance test invoice')
  await page.getByLabel('Line 1 description').fill('Consulting service')
  await page.getByLabel('Unit price').fill('2500')
  await page.getByRole('button',{name:'Post invoice'}).click()
  await expect(page.getByText('Invoice posted to the ledger.')).toBeVisible()
  await page.getByRole('button',{name:'Print / PDF'}).waitFor()
  await page.goto('/ledger')
  await expect(page.getByRole('heading',{name:'Trial balance'})).toBeVisible()
  await expect(page.getByRole('button',{name:'Export CSV'})).toBeEnabled()
})

test('Persian layout and contextual assistant work on a narrow viewport',async({page})=>{
  await page.setViewportSize({width:390,height:844})
  await page.goto('/')
  await page.locator('#login-locale').selectOption('fa')
  await expect(page.locator('.login-screen')).toHaveAttribute('dir','rtl')
  await page.getByLabel('نام کاربری').fill('e2eowner')
  await page.getByLabel('گذرواژه').fill('Browser E2E test credentials only 2026')
  await page.getByRole('button',{name:'ورود',exact:true}).click()
  await page.getByRole('button',{name:'باز کردن منو'}).click()
  await expect(page.locator('.app-sidebar')).toHaveClass(/is-open/u)
  await page.getByRole('button',{name:'بستن منو'}).click()
  await page.locator('.assistant-top-action').click()
  await expect(page.getByRole('dialog',{name:'دستیار مالی'})).toBeVisible()
})
