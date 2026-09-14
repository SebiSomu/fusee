import { createSSRStreamResponse } from './stream.js'
import { withSignalScope } from '../core/signal-scope.js'
import { renderDehydrationScript } from '../core/hydration.js'

const ROOT_SCOPE_ID = '__root__'

export function renderPageToStream(renderShell, opts = {}) {
    const rootScopeId = opts.rootScopeId ?? ROOT_SCOPE_ID

    return createSSRStreamResponse(() => withSignalScope(rootScopeId, renderShell),
        {
            ...opts,
            tail: opts.dehydrate === false ? undefined : () => renderDehydrationScript()
        }
    )
}