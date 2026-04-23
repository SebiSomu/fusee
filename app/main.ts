import { createRouter, mountOutlet, generateRoutesFromFiles } from '../framework/index.js'
import { Loading } from './components/Loading.js'

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
const routes = generateRoutesFromFiles(pages, {
    loadingComponent: Loading
})

createRouter(routes)

const outlet = document.getElementById('app')
if (!outlet) throw new Error('[app] #app element not found in DOM')
mountOutlet(outlet)
