import { createRouter, mountOutlet, generateRoutes } from '../framework/index.js'
import { Loading } from './components/Loading.js'
import { AuthRoutes } from './routes/AuthRoutes.js'

directive('focus', {
    mounted(el) {
        el.focus()
    }
})

directive('highlight', {
    mounted(el, binding) {
        el.style.backgroundColor = binding.value || '#ffff0033'
        el.style.transition = 'background-color 0.3s'
    },
    updated(el, binding) {
        el.style.backgroundColor = binding.value || '#ffff0033'
    }
})

const pages = import.meta.glob('./pages/**/*.{js,ts}')
const routes = generateRoutes(pages, {
    loadingComponent: Loading
})

// Add manual route with array paths - component won't re-render when switching between /login and /register
routes.push({
    path: ['/login', '/register'],
    component: AuthRoutes
})

createRouter(routes)

const outlet = document.getElementById('app')
if (!outlet) throw new Error('[app] #app element not found in DOM')
mountOutlet(outlet)
