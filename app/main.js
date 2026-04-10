import { createRouter, defineAsyncComponent } from '../framework/index.js'
import { Home } from './routes/Home.js'
import { Loading } from './components/Loading.js'

createRouter([
    { path: '/', component: Home },
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
])

const outlet = document.getElementById('app')
mountOutlet(outlet)
