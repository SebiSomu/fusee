import { defineComponent, signal, computed, onMount } from '../../framework/index.js'
import { defineAction, useAction } from '../../framework/server/actions.js'

// 1. Define Server Action client proxy
const submitFeedbackAction = defineAction('submitFeedback', {
    baseUrl: '/__fusee/actions'
})

export const SSRDemo = defineComponent({
    setup() {
        // Hydrate from window.__FUSEE_STATE__ if available, or use defaults
        const rawState = typeof window !== 'undefined' && window.__FUSEE_STATE__
        const initialCount = rawState?.signals?.count?.[0] ?? 0
        const initialStatus = rawState?.signals?.status?.[0] ?? 'Ready for SSR'

        const count = signal(Number(initialCount))
        const status = signal(String(initialStatus))
        const isHydrated = signal(false)
        const serverMessage = signal('')

        // Form inputs for Server Action demo
        const feedbackInput = signal('Fusee Go SSR is blazing fast!')
        const actionStatus = signal('Ready')

        const { execute: submitFeedback, pending: isSubmitting, data: actionResponse, error: actionError } = useAction(submitFeedbackAction, {
            onSuccess(res) {
                actionStatus(`Server responded: "${res?.received ?? 'OK'}" (Status: 200 OK)`)
            },
            onError(err) {
                actionStatus(`Action Error: ${err.message}`)
            }
        })

        const doubleCount = computed(() => count() * 2)
        const countParity = computed(() => (count() % 2 === 0 ? 'Even' : 'Odd'))

        const ssrFeatures = signal([
            { id: 1, title: '⚡ Go SSR Dispatcher', desc: 'Ultra-fast HTTP routing and static file bypassing' },
            { id: 2, title: '🦀 Rust AST Compiler', desc: 'Compiles templates into optimized AST tokens' },
            { id: 3, title: '🔄 Signal Hydration', desc: 'Zero-overhead hydration using DOM comments and data-f-id' },
            { id: 4, title: '🛡️ Server Actions', desc: 'Direct RPC-like POST actions with JSON validation and CSRF checks' },
            { id: 5, title: '🌊 Streaming & Suspense', desc: 'Out-of-order boundary streaming with template replacement' }
        ])

        onMount(() => {
            isHydrated(true)
            if (rawState) {
                serverMessage('✨ Hydrated successfully from Go server state!')
            } else {
                serverMessage('Client SPA mode (run "npm run ssr:go" to test full Go SSR)')
            }
        })

        function increment() {
            count(count() + 1)
        }

        function decrement() {
            count(count() - 1)
        }

        function reset() {
            count(0)
        }

        function updateFeedbackInput(e) {
            if (e && e.target) {
                feedbackInput(e.target.value)
            }
        }

        async function handleActionSubmit(e) {
            if (e && e.preventDefault) e.preventDefault()
            actionStatus('Sending action to Go server...')
            try {
                await submitFeedback({ message: feedbackInput() })
            } catch (err) {
                actionStatus(`Action Error: ${err.message}`)
            }
        }

        return {
            count,
            doubleCount,
            countParity,
            status,
            isHydrated,
            serverMessage,
            feedbackInput,
            actionStatus,
            isSubmitting,
            actionResponse,
            actionError,
            ssrFeatures,
            increment,
            decrement,
            reset,
            updateFeedbackInput,
            handleActionSubmit,
            template: `
                <div class="page ssr-demo-page">
                    <div class="ssr-header-card" style="margin-bottom: 1.5rem;">
                        <div class="badge-row" style="display: flex; gap: 0.5rem; margin-bottom: 0.5rem;">
                            <span class="badge badge-blue">🚀 SSR Module</span>
                            <span class="badge badge-red">Go Engine + Rust AST</span>
                        </div>
                        <h1 style="color: #60a5fa; margin-top: 0.25rem;">Fusee SSR & Hydration Demo</h1>
                        <p class="subtitle" style="color: #aaa;">{{ serverMessage }}</p>
                    </div>

                    <!-- 1. Reactive Hydrated Signals Demo -->
                    <div class="demo-card">
                        <h2>1. Reactive Hydrated Signals</h2>
                        <p class="demo-desc">This counter is rendered server-side and immediately hydrated on the client without UI flash.</p>
                        
                        <div class="counter-display">
                            <div class="big-num" style="color: #60a5fa;">{{ count }}</div>
                            <div class="derived-label">2x Value: <strong style="color: #34d399;">{{ doubleCount }}</strong> | Parity: <strong>{{ countParity }}</strong></div>
                        </div>

                        <div class="btn-row">
                            <button class="cmp-btn minus" @click="decrement">- Decrement</button>
                            <button class="cmp-btn reset" @click="reset">Reset</button>
                            <button class="cmp-btn plus" @click="increment">+ Increment</button>
                        </div>
                    </div>

                    <!-- 2. Server Actions RPC Demo -->
                    <div class="demo-card">
                        <h2>2. Server Action RPC (Go Backend)</h2>
                        <p class="demo-desc">Trigger a direct POST action to <code>/__fusee/actions/submitFeedback</code> handled by Go <code>ActionRegistry</code>.</p>

                        <div class="action-form" style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.75rem;">
                            <input 
                                type="text" 
                                class="cmp-input" 
                                style="flex: 1; min-width: 250px;" 
                                placeholder="Enter message for server..." 
                                :value="feedbackInput"
                                @input="updateFeedbackInput"
                            />
                            <button 
                                class="primary-btn" 
                                style="background: #3b82f6;" 
                                @click="handleActionSubmit"
                                :disabled="isSubmitting"
                            >
                                Send Action
                            </button>
                        </div>

                        <div class="status-box" style="padding: 0.75rem; background: #0f0f1a; border: 1px solid #2a2a3a; border-radius: 6px; font-size: 0.85rem; color: #aaa;">
                            <p style="margin: 0; color: #34d399;">Status: {{ actionStatus }}</p>
                        </div>
                    </div>

                    <!-- 3. Go SSR Architecture Features List -->
                    <div class="demo-card">
                        <h2>3. Go SSR Architecture Features</h2>
                        <p class="demo-desc">Rendered with template loop directives (<code>for</code>) and compiled AST tokens.</p>

                        <div class="feature-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 0.75rem; margin-top: 1rem;">
                            <div 
                                class="feature-item" 
                                style="padding: 1rem; background: #1a1a24; border: 1px solid #2a2a3a; border-radius: 8px;"
                                f-for="feat in ssrFeatures"
                            >
                                <h4 style="color: #60a5fa; margin-bottom: 0.35rem; font-size: 0.95rem;">{{ feat.title }}</h4>
                                <p style="font-size: 0.8rem; color: #888; margin: 0; line-height: 1.4;">{{ feat.desc }}</p>
                            </div>
                        </div>
                    </div>

                    <!-- 4. How to Test Manually -->
                    <div class="info-section">
                        <h2>📋 How to Test SSR Manually</h2>
                        <ul>
                            <li><strong>Run with Go SSR Engine:</strong> Run <code>npm run ssr:go</code> in your terminal and open <code>http://localhost:3000/ssr-demo</code>.</li>
                            <li><strong>View Page Source:</strong> Press <kbd>Ctrl+U</kbd> in your browser to verify pre-rendered HTML comments like <code>&lt;!--f-bind:N--&gt;</code> and <code>&lt;script id="__FUSEE_DATA__"&gt;</code>.</li>
                            <li><strong>Run with Vite Dev:</strong> Run <code>npm run dev</code> for client SPA hot-reloading.</li>
                            <li><strong>Run Tests:</strong> Run <code>npm run test:go</code> to execute the Go SSR test suite.</li>
                        </ul>
                    </div>
                </div>
            `
        }
    }
})
