import { defineRouteMiddleware, navigateTo } from '../../framework/index.js'

export default defineRouteMiddleware((to, from) => {
    console.log(`[auth middleware] Checking access to ${to.path}`)
    
    // Simulate authentication check
    const isAuthenticated = localStorage.getItem('fake_auth_token') === 'true'
    
    if (!isAuthenticated && to.path !== '/login') {
        console.log('[auth middleware] Not authenticated, redirecting to /login')
        return navigateTo('/login')
    }
})
