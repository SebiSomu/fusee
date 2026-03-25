import { createRouter, mountOutlet } from '../framework/index.js'
import type { Route } from '../framework/types/index.js'
import { Home } from './routes/Home.js'
import { About } from './routes/About.js'

const routes: Route[] = [
  { path: '/', component: Home },
  { path: '/about', component: About },
]

createRouter(routes)

const outlet = document.getElementById('app') as HTMLElement
mountOutlet(outlet)
