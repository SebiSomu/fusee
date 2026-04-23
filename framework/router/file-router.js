import { defineAsyncComponent } from '../core/component.js';

export function generateRoutesFromFiles(globResults, options = {}) {
    const routes = [];

    for (const path of Object.keys(globResults)) {
        const loader = globResults[path];

        let routePath = path
            .replace(/^\.?\/?app\/pages\//, '')
            .replace(/^\.?\/?pages\//, '')
            .replace(/\.[jt]sx?$/, '')
            .replace(/\[\.\.\.([^\]]+)\]/g, '*')
            .replace(/\[([^\]]+)\]/g, ':$1');

        if (routePath === 'index') {
            routePath = '/';
        } else if (routePath === '*') {
        } else if (routePath.endsWith('/index')) {
            routePath = '/' + routePath.slice(0, -6);
        } else {
            routePath = '/' + routePath.replace(/\/+/g, '/');
            if (!routePath.startsWith('/')) routePath = '/' + routePath;
        }

        routes.push({
            path: routePath,
            component: defineAsyncComponent({
                loader,
                loadingComponent: options.loadingComponent
            })
        });
    }

    return routes.sort((a, b) => {
        if (a.path === '*' && b.path !== '*') return 1;
        if (a.path !== '*' && b.path === '*') return -1;
        if (a.path.endsWith('/*') && !b.path.endsWith('/*')) return 1;
        if (!a.path.endsWith('/*') && b.path.endsWith('/*')) return -1;

        const aDynamic = a.path.includes(':');
        const bDynamic = b.path.includes(':');

        if (aDynamic && !bDynamic) return 1;
        if (!aDynamic && bDynamic) return -1;

        const aSegments = a.path.split('/').filter(Boolean).length;
        const bSegments = b.path.split('/').filter(Boolean).length;
        if (aSegments !== bSegments) return bSegments - aSegments;
        return b.path.length - a.path.length;
    });
}
