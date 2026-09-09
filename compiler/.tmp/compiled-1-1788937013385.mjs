import { escapeHtml, escapeAttr, renderClass, renderStyle, ssrEnumerate, renderComponentSSR, ssrVal } from '../../framework/core/ssr.js'

export async function renderSSR(_ctx, _components) {
    let __html = ''
    __html += '<div'
    __html += '>'
    __html += '<!--f-if:0-->'
    if (ssrVal(_ctx.loggedIn)) {
    __html += '<span'
    __html += '>'
    __html += "Welcome"
    __html += '</span>'
}
    else {
    __html += '<span'
    __html += '>'
    __html += "Guest"
    __html += '</span>'
}
    __html += '<!--/f-if:0-->'
    __html += '</div>'
    return __html
}