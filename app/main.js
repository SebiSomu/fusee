import { createRouter } from '../framework/index.js'
import { Home } from './routes/Home.js'
import { About } from './routes/About.js'
import { TestFor } from './routes/TestFor.js'

createRouter([
    { path: '/', component: Home },
    { path: '/about', component: About },
    { path: '/test-for', component: TestFor },
])

const outlet = document.getElementById('app')
mountOutlet(outlet)
