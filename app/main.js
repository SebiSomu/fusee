import { createRouter, mountOutlet, generateRoutes, directive, provideGlobal } from '../framework/index.js'
import { APP_CONFIG, LoggerService } from './services.js'

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

const pages = typeof import.meta.glob === 'function'
    ? import.meta.glob('./pages/**/*.js')
    : {
        './pages/index.js': () => import('./pages/index.js'),
        './pages/about.js': () => import('./pages/about.js'),
        './pages/ssr-demo.js': () => import('./pages/ssr-demo.js'),
        './pages/_layout.js': () => import('./pages/_layout.js')
    }

const routes = generateRoutes(pages, {
    loadingComponent: Loading
})

provideGlobal(LoggerService);

provideGlobal({
    provide: APP_CONFIG,
    useValue: {
        title: 'Fusee v2 App',
        version: '2.0.0-beta'
    }
});

// Scroll behavior configuration
createRouter(routes, {
    scrollBehavior: {
        scrollToTop: true,
        scrollToAnchor: true,
        saveScrollPosition: true
    }
})

const outlet = document.getElementById('app')
if (!outlet) throw new Error('[app] #app element not found in DOM')

mountOutlet(outlet)
