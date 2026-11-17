import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { ApplicationProvider } from './app/context'
import { Shell } from './app/shell'
import { Overview } from './pages/overview'
import { Contacts } from './pages/contacts'
import { Invoices } from './pages/invoices'
import { Payments } from './pages/payments'
import { Ledger } from './pages/ledger'
import { Inventory } from './pages/inventory'
import { Assistant } from './pages/assistant'
import { Settings } from './pages/settings'
import { Administration } from './pages/administration'
import './styles.css'

const root = createRootRoute({ component: Shell, notFoundComponent: () => <p>Page not found</p> })
const index = createRoute({ getParentRoute: () => root, path: '/', component: Overview })
const contacts = createRoute({ getParentRoute: () => root, path: '/contacts', component: Contacts })
const invoices = createRoute({ getParentRoute: () => root, path: '/invoices', component: Invoices })
const payments = createRoute({ getParentRoute: () => root, path: '/payments', component: Payments })
const ledger = createRoute({ getParentRoute: () => root, path: '/ledger', component: Ledger })
const inventory = createRoute({ getParentRoute: () => root, path: '/inventory', component: Inventory })
const assistant = createRoute({ getParentRoute: () => root, path: '/assistant', component: Assistant })
const administration = createRoute({ getParentRoute: () => root, path: '/administration', component: Administration })
const settings = createRoute({ getParentRoute: () => root, path: '/settings', component: Settings })
const routeTree = root.addChildren([index, contacts, invoices, payments, ledger, inventory, assistant, settings, administration])
const router = createRouter({ routeTree })
declare module '@tanstack/react-router' { interface Register { router: typeof router } }
const element = document.getElementById('root')
if (!element) throw Error('Missing application root')
createRoot(element).render(<StrictMode><ApplicationProvider><RouterProvider router={router}/></ApplicationProvider></StrictMode>)
