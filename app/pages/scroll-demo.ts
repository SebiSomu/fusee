import { defineComponent, currentRoute } from '../../framework/index.js'

/**
 * Scroll Demo - demonstrates router scroll behavior
 */
export default defineComponent({
    setup() {
        const route = currentRoute

        return {
            template: `
                <div class="content-wrap">
                    <h1>🔽 Scroll Behavior Demo</h1>
                    <p>This page demonstrates the router's scroll behavior. Click the navigation links to jump to sections.</p>

                    <!-- Navigation -->
                    <div class="demo-section">
                        <h2>Navigation</h2>
                        <div class="controls">
                            <a href="/scroll-demo#intro" f-link class="cmp-btn">Introduction</a>
                            <a href="/scroll-demo#features" f-link class="cmp-btn">Features</a>
                            <a href="/scroll-demo#examples" f-link class="cmp-btn">Examples</a>
                            <a href="/scroll-demo#api" f-link class="cmp-btn">API</a>
                            <a href="/scroll-demo#bottom" f-link class="cmp-btn">Bottom</a>
                        </div>
                    </div>

                    <!-- Scroll indicator -->
                    <div class="info-section">
                        <h2>Current Route</h2>
                        <p><strong>Scroll Features:</strong></p>
                        <ul>
                            <li>✓ scrollToTop</li>
                            <li>✓ saveScrollPosition</li>
                            <li>✓ custom scroll function</li>
                        </ul>
                    </div>

                    <!-- Sections -->
                    <div style="display: flex; flex-direction: column; gap: 2rem; margin-top: 2rem;">
                        <section id="intro" class="demo-section" style="min-height: 40vh; scroll-margin-top: 100px;">
                            <h2>Introduction</h2>
                            <p>Welcome to the scroll behavior demo! Navigate between sections using the links below.</p>
                            <div style="opacity: 0.5; margin-top: 1rem;">
                                <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
                                <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
                                <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
                            </div>
                        </section>

                        <section id="features" class="demo-section" style="min-height: 40vh; scroll-margin-top: 100px;">
                            <h2>Features</h2>
                            <p>Smooth scrolling, anchor navigation, and scroll position restoration are all supported by the Fusee router.</p>
                            <div style="opacity: 0.5; margin-top: 1rem;">
                                <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
                                <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
                                <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
                            </div>
                        </section>

                        <section id="examples" class="demo-section" style="min-height: 40vh; scroll-margin-top: 100px;">
                            <h2>Examples</h2>
                            <p>Click on any section link to see smooth scroll to anchor. Use browser back/forward to see scroll position restore.</p>
                            <div style="opacity: 0.5; margin-top: 1rem;">
                                <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
                                <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
                                <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
                            </div>
                        </section>

                        <section id="api" class="demo-section" style="min-height: 40vh; scroll-margin-top: 100px;">
                            <h2>API</h2>
                            <p>Configure scroll behavior in createRouter(): scrollToTop, saveScrollPosition, or custom function.</p>
                            <div style="opacity: 0.5; margin-top: 1rem;">
                                <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
                                <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
                                <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
                            </div>
                        </section>

                        <section id="bottom" class="demo-section" style="min-height: 40vh; scroll-margin-top: 100px;">
                            <h2>Bottom Section</h2>
                            <p>You made it to the bottom! The scroll behavior automatically scrolls to anchors when navigating with #hash URLs.</p>
                            <div style="opacity: 0.5; margin-top: 1rem;">
                                <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
                                <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
                                <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
                            </div>
                        </section>
                    </div>

                    <!-- Back to top -->
                    <div style="text-align: center; margin-top: 3rem; padding: 2rem;">
                        <a href="/scroll-demo" f-link class="action-btn btn-primary">
                            ⬆️ Back to Top
                        </a>
                    </div>
                </div>
            `
        }
    }
})
