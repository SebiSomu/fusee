import { counterLogic, mouseTracker } from '../composables/demo.js'
import { useFetch } from '../composables/useFetch.js'
import { useLocalStorage } from '../composables/useLocalStorage.js'

export const TestComposables = defineComponent({
    setup() {
        // ── 1. counterLogic — pure signal composable, no context needed ──────
        const counter = counterLogic(0, 1)
        const bigCounter = counterLogic(100, 10)

        // ── 2. mouseTracker — lifecycle composable (needs setup context) ─────
        const mouse = mouseTracker()

        // ── 3. useLocalStorage — persists across page reloads ────────────────
        const theme = useLocalStorage('demo-theme', 'dark')
        const nickname = useLocalStorage('demo-nickname', '')

        const toggleTheme = () => theme(theme() === 'dark' ? 'light' : 'dark')

        // ── 4. useFetch — reactive data fetching ─────────────────────────────
        const { data: posts, loading, error } = useFetch(
            'https://jsonplaceholder.typicode.com/posts?_limit=3'
        )

        return {
            // counter
            count: counter.count,
            doubled: counter.doubled,
            isEven: counter.isEven,
            increment: counter.increment,
            decrement: counter.decrement,
            reset: counter.reset,

            // big counter
            bigCount: bigCounter.count,
            bigIncrement: bigCounter.increment,
            bigDecrement: bigCounter.decrement,

            // mouse
            mouseX: mouse.x,
            mouseY: mouse.y,

            // localStorage
            theme,
            nickname,
            toggleTheme,

            // fetch
            posts,
            loading,
            error,

            template: `
                <div class="page">
                    <h1>🧩 Composables Demo</h1>
                    <p style="color:#888; margin-bottom: 2rem;">
                        Each section below is powered by a <code style="color:#ff3333">defineComposable()</code> function.
                        No naming rules — just reactive logic.
                    </p>

                    <!-- ── 1. counterLogic ─────────────────────────────────────── -->
                    <section class="demo-card">
                        <h2>📦 counterLogic(0, step=1)</h2>
                        <p class="demo-desc">Pure signal composable — works without setup() context.</p>
                        <div class="counter-display">
                            <span class="big-num" :class="isEven ? 'even' : 'odd'">{{ count }}</span>
                            <span class="derived-label">× 2 = {{ doubled }}</span>
                        </div>
                        <div class="btn-row">
                            <button @click="decrement" class="cmp-btn minus">−</button>
                            <button @click="reset"     class="cmp-btn reset">↺</button>
                            <button @click="increment" class="cmp-btn plus">+</button>
                        </div>
                        <p class="badge" :class="isEven ? 'badge-blue' : 'badge-red'">{{ isEven ? 'Even' : 'Odd' }}</p>
                    </section>

                    <!-- ── 1b. Second independent counter (step=10) ───────────── -->
                    <section class="demo-card">
                        <h2>📦 counterLogic(100, step=10)</h2>
                        <p class="demo-desc">Same composable, different instance. Fully isolated state.</p>
                        <div class="counter-display">
                            <span class="big-num">{{ bigCount }}</span>
                        </div>
                        <div class="btn-row">
                            <button @click="bigDecrement" class="cmp-btn minus">−10</button>
                            <button @click="bigIncrement" class="cmp-btn plus">+10</button>
                        </div>
                    </section>

                    <!-- ── 2. mouseTracker ────────────────────────────────────── -->
                    <section class="demo-card">
                        <h2>🖱️ mouseTracker()</h2>
                        <p class="demo-desc">Lifecycle composable — registers window listener on mount, cleans up on unmount.</p>
                        <div class="mouse-display">
                            <span>X: <strong>{{ mouseX }}</strong></span>
                            <span>Y: <strong>{{ mouseY }}</strong></span>
                        </div>
                    </section>

                    <!-- ── 3. useLocalStorage ─────────────────────────────────── -->
                    <section class="demo-card">
                        <h2>💾 useLocalStorage()</h2>
                        <p class="demo-desc">State persists across page reloads. Try changing the nickname, then refresh.</p>
                        <div style="margin-bottom: 12px;">
                            <input f-model="nickname"
                                   class="cmp-input"
                                   placeholder="Your nickname…" />
                            <p style="margin-top: 8px; color: #888; font-size: 0.85rem;">
                                Stored: <strong style="color:#ff3333">{{ nickname || '(empty)' }}</strong>
                            </p>
                        </div>
                        <button @click="toggleTheme" class="cmp-btn reset">
                            Theme: {{ theme }}
                        </button>
                    </section>

                    <!-- ── 4. useFetch ────────────────────────────────────────── -->
                    <section class="demo-card">
                        <h2>🌐 useFetch()</h2>
                        <p class="demo-desc">Fetches from JSONPlaceholder. Loading state handled reactively.</p>
                        <div f-if="loading">
                            <p style="color: #888;">⏳ Loading posts…</p>
                        </div>
                        <div f-elif="error">
                            <p style="color: #ff6b6b;">❌ {{ error }}</p>
                        </div>
                        <div f-else>
                            <div f-for="post in posts" style="margin-bottom: 10px; padding: 10px; background:#1a1a24; border-radius:6px; border-left: 3px solid #ff3333;">
                                <strong style="color:#ff9999">{{ post.title }}</strong>
                                <p style="margin-top: 4px; font-size: 0.8rem; color: #666;">{{ post.body }}</p>
                            </div>
                        </div>
                    </section>


                </div>
            `
        }
    }
})
