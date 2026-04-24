import { defineComponent } from '../../framework/index.js'

export const RootLayout = defineComponent({
    setup() {
        return {
            template: `
                <div class="root-layout">
                    <nav>
                        <a href="/" f-link>Home</a>
                        <a href="/about" f-link>About</a>
                        <a href="/test-for" f-link>Loops Test</a>
                        <a href="/dynamic" f-link style="color: #ec4899;">Dynamic Components</a>
                        <a href="/composables" f-link style="color: #34d399;">Composables</a>
                        <a href="/users" f-link style="color: #f59e0b;">👥 Users (Nested)</a>
                        <a href="/router-example" f-link style="color: #8b8bff;">🔗 Router Example</a>
                    </nav>
                    
                    <main class="content-wrap">
                        <!-- This is where all pages will be rendered -->
                        <div data-router-view></div>
                    </main>
                </div>
            `
        }
    }
})
