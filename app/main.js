import { createRouter, mountOutlet } from '../framework/index.js'
import { Home } from './routes/Home.js'
import { About } from './routes/About.js'

createRouter([
  { path: '/', component: Home },
  { path: '/about', component: About },
])

const outlet = document.getElementById('app')
mountOutlet(outlet)
