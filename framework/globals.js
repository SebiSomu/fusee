// ─── Opt-in Globals ───────────────────────────────────────────────────────────
// `import 'fusee-framework/globals'` copies every fusée export onto globalThis, for code
// that calls the API without imports (plain <script> tags, quick demos). Apps built with
// Vite get auto-imports instead and should not load this: it keeps the whole framework
// in the bundle, since bundlers can no longer drop unused modules.
import * as signalModule from './core/signal.js'
import * as resourceModule from './core/resource.js'
import * as componentModule from './core/component.js'
import * as elementModule from './core/element.js'
import * as diModule from './core/di.js'
import * as routerModule from './router/router.js'
import * as fileRouterModule from './router/file-router.js'
import * as compilerModule from './core/compiler.js'
import * as composableModule from './core/composable.js'
import * as storeModule from './core/store.js'
import * as directivesModule from './core/directives.js'
import * as reconcileModule from './core/reconcile.js'
import * as actionsModule from './server/actions.js'
import * as appRegistryModule from './core/app-registry.js'
import * as pluginsModule from './core/plugins.js'
import { emit } from './index.js'

if (typeof globalThis !== 'undefined') {
    Object.assign(globalThis, {
        ...signalModule,
        ...resourceModule,
        ...componentModule,
        ...elementModule,
        ...diModule,
        ...routerModule,
        ...fileRouterModule,
        ...compilerModule,
        ...composableModule,
        ...storeModule,
        ...directivesModule,
        ...reconcileModule,
        ...actionsModule,
        ...appRegistryModule,
        ...pluginsModule,
        emit
    })
}
