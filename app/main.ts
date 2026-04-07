import { createRouter, provide, inject } from '../framework/index.js'
import type { Route } from '../framework/types/index.js'
import { Home } from './routes/Home.js'
import { About } from './routes/About.js'
import { TestFor } from './routes/TestFor.js'

const routes: Route[] = [
    { path: '/', component: Home },
    { path: '/about', component: About },
    { path: '/test-for', component: TestFor },
]

createRouter(routes)

const outlet = document.getElementById('app')
if (!outlet) throw new Error('[app] #app element not found in DOM')
mountOutlet(outlet)
