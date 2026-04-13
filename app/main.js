import { createRouter, mountOutlet, defineAsyncComponent } from '../framework/index.js'
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

const routes = [
    { 
        path: '/', 
        component: defineAsyncComponent({
            loader: () => import('./routes/Home.js'),
            loadingComponent: Loading
        }) 
    },
    { 
        path: '/about', 
        component: defineAsyncComponent({
            loader: () => import('./routes/About.js'),
            loadingComponent: Loading
        }) 
    },
    { 
        path: '/test-for', 
        component: defineAsyncComponent({
            loader: () => import('./routes/TestFor.js'),
            loadingComponent: Loading
        }) 
    },
    { 
        path: '/dynamic', 
        component: defineAsyncComponent({
            loader: () => import('./routes/TestDynamic.js'),
            loadingComponent: Loading
        }) 
    },
    {
        path: '/composables',
        component: defineAsyncComponent({
            loader: () => import('./routes/TestComposables.js'),
            loadingComponent: Loading
        })
    },
]

createRouter(routes)

const outlet = document.getElementById('app')
if (!outlet) throw new Error('[app] #app element not found in DOM')
mountOutlet(outlet)
