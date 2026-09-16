import { createRequestContext, withRequestContext } from './index.js'
import { getStreamBoundaryStore } from '../core/async-context.js'

/** Creates a fallback placeholder and registers its async replacement boundary. */
export function renderSuspenseBoundary({ fetcher, render, fallback, onError, id } = {}) {
    if (typeof fetcher !== 'function' || typeof render !== 'function') {
        throw new Error('[fusee] renderSuspenseBoundary requires { fetcher, render } functions')
    }

    const store = getStreamBoundaryStore()
    const boundaryId = id ?? `f-boundary-${store.nextId++}`

    const entry = { id: boundaryId, status: 'pending' }
    entry.promise = Promise.resolve()
        .then(() => fetcher())
        .then(data => {
            entry.status = 'resolved'
            entry.html = render(data)
            return entry
        })
        .catch(err => {
            entry.status = 'rejected'
            entry.error = err
            entry.html = onError ? onError(err) : ''
            return entry
        })

    store.list.push(entry)

    const fallbackHtml = fallback ? fallback() : ''
    return `<div id="${boundaryId}" data-f-boundary>${fallbackHtml}</div>`
}

/** Streams the shell, resolved suspense chunks, and an optional tail in order. */
export function createSSRStreamResponse(renderShell, opts = {}) {
    const ctx = createRequestContext()
    const encoder = new TextEncoder()

    return new ReadableStream({
        async start(controller) {
            try {
                await withRequestContext(ctx, async () => {
                    const shellResult = renderShell()

                    if (isAsyncIterable(shellResult)) {
                        for await (const chunk of shellResult) {
                            controller.enqueue(encoder.encode(chunk))
                        }
                    } else {
                        controller.enqueue(encoder.encode(await shellResult))
                    }

                    const boundaries = ctx.streamBoundaries.list
                    if (boundaries.length > 0) {
                        await new Promise((resolveAll) => {
                            let remaining = boundaries.length
                            for (const entry of boundaries) {
                                entry.promise
                                    .then((resolvedEntry) => {
                                        controller.enqueue(encoder.encode(renderBoundaryChunk(resolvedEntry)))
                                    })
                                    .finally(() => {
                                        remaining--
                                        if (remaining === 0) resolveAll()
                                    })
                            }
                        })
                    }

                    if (typeof opts.tail === 'function') {
                        const tailChunk = await opts.tail()
                        if (tailChunk) controller.enqueue(encoder.encode(tailChunk))
                    }
                })
            } catch (err) {
                controller.error(err)
                return
            }
            controller.close()
        }
    })
}

/** Serializes one resolved boundary into a template plus client-side replacement script. */
function renderBoundaryChunk(entry) {
    const templateId = `tpl-${entry.id}`
    return (
        `<template id="${templateId}">${entry.html ?? ''}</template>` +
        `<script>(function(){` +
        `var t=document.getElementById(${JSON.stringify(templateId)});` +
        `var d=document.getElementById(${JSON.stringify(entry.id)});` +
        `if(t&&d&&d.parentNode){d.replaceWith(t.content);t.remove();}` +
        `var s=document.currentScript;if(s&&s.parentNode)s.parentNode.removeChild(s);` +
        `})();</script>`
    )
}

/** Reports whether a value implements the async iterable protocol. */
function isAsyncIterable(x) {
    return x != null && typeof x[Symbol.asyncIterator] === 'function'
}

/** Drains a readable byte stream into one decoded string for tests and adapters. */
export async function streamToString(stream) {
    const decoder = new TextDecoder()
    let out = ''
    for await (const chunk of stream) {
        out += decoder.decode(chunk, { stream: true })
    }
    out += decoder.decode()
    return out
}