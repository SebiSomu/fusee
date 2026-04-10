import { createRouter, mountOutlet, defineAsyncComponent } from '../framework/index.js'
import type { Route } from '../framework/types/index.js'
import { Loading } from './components/Loading.js'

const routes: Route[] = [
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
]

createRouter(routes)

const outlet = document.getElementById('app')
if (!outlet) throw new Error('[app] #app element not found in DOM')
mountOutlet(outlet)
