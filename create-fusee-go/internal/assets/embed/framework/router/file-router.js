import { defineAsyncComponent } from '../core/component.js';

export function generateRoutes(globResults, options = {}) {
    const entries = _parseGlobEntries(globResults, options);
    const tree = _buildRouteTree(entries, false);
    _sortRoutesRecursive(tree);
    return tree;
}

function _parseGlobEntries(globResults, options) {
    const entries = [];

    for (const filePath of Object.keys(globResults)) {
        const loader = globResults[filePath];

        let cleanPath = filePath
            .replace(/^\.?\/?app\/pages\//, '')
            .replace(/^\.?\/?pages\//, '')
            .replace(/\.[jt]sx?$/, '');

        const parts = cleanPath.split('/');
        const rawFileName = parts.pop();
        const rawDirSegments = parts;

        const dirSegments = rawDirSegments.map(_transformSegment);
        const fileName = _transformSegment(rawFileName);

        const isIndex = rawFileName === 'index';
        const isCatchAll = /^\[\.\.\./.test(rawFileName);

        entries.push({
            filePath,
            loader,
            dirSegments,
            fileName,
            isIndex,
            isCatchAll,
            component: defineAsyncComponent({
                loader,
                loadingComponent: options.loadingComponent
            })
        });
    }

    return entries;
}

function _transformSegment(seg) {
    return seg
        .replace(/\[\.\.\.([^\]]+)\]/g, '*')
        .replace(/\[([^\]]+)\]/g, ':$1');
}

function _buildRouteTree(entries, isChild) {
    const filesHere = new Map();
    const grouped = new Map();

    for (const entry of entries) {
        if (entry.dirSegments.length === 0) {
            filesHere.set(entry.fileName, entry);
        } else {
            const firstDir = entry.dirSegments[0];
            if (!grouped.has(firstDir)) grouped.set(firstDir, []);
            grouped.get(firstDir).push(entry);
        }
    }

    let rootLayoutEntry = null;
    if (filesHere.has('_layout')) {
        rootLayoutEntry = filesHere.get('_layout');
        filesHere.delete('_layout');
    }

    const routes = [];
    const usedAsLayout = new Set();

    for (const [dirName, dirEntries] of grouped) {
        const layoutEntry = filesHere.get(dirName);

        if (layoutEntry) {
            usedAsLayout.add(dirName);

            const childEntries = dirEntries.map(e => ({
                ...e,
                dirSegments: e.dirSegments.slice(1)
            }));

            const children = _buildRouteTree(childEntries, true);

            routes.push({
                path: isChild ? dirName : '/' + dirName,
                component: layoutEntry.component,
                children
            });
        } else {
            for (const entry of dirEntries) {
                const segments = [...entry.dirSegments];
                if (!entry.isIndex) segments.push(entry.fileName);

                const routePath = isChild
                    ? segments.join('/')
                    : '/' + segments.join('/');

                routes.push({
                    path: routePath,
                    component: entry.component
                });
            }
        }
    }

    for (const [name, entry] of filesHere) {
        if (usedAsLayout.has(name)) continue;

        if (entry.isIndex) {
            routes.push({ path: isChild ? '' : '/', component: entry.component });
        } else if (entry.isCatchAll || name === '*') {
            routes.push({ path: '*', component: entry.component });
        } else {
            routes.push({
                path: isChild ? name : '/' + name,
                component: entry.component
            });
        }
    }

    if (rootLayoutEntry) {
        return [{
            path: '',
            component: rootLayoutEntry.component,
            children: routes
        }];
    }

    return routes;
}

function _sortRoutesRecursive(routes) {
    routes.sort(_compareRoutes);
    for (const route of routes) {
        if (route.children) _sortRoutesRecursive(route.children);
    }
}

function _getPathArray(path) {
    return Array.isArray(path) ? path : [path];
}

function _compareRoutes(a, b) {
    const aPaths = _getPathArray(a.path);
    const bPaths = _getPathArray(b.path);
    
    const aPath = aPaths[0];
    const bPath = bPaths[0];
    
    if (aPath === '*' && bPath !== '*') return 1;
    if (aPath !== '*' && bPath === '*') return -1;

    const aWild = aPath.endsWith('/*');
    const bWild = bPath.endsWith('/*');
    if (aWild && !bWild) return 1;
    if (!aWild && bWild) return -1;

    const aDynamic = aPath.includes(':');
    const bDynamic = bPath.includes(':');
    if (aDynamic && !bDynamic) return 1;
    if (!aDynamic && bDynamic) return -1;

    if (a.children && !b.children) return -1;
    if (!a.children && b.children) return 1;

    const aSegs = aPath.split('/').filter(Boolean).length;
    const bSegs = bPath.split('/').filter(Boolean).length;
    if (aSegs !== bSegs) return bSegs - aSegs;

    return bPath.length - aPath.length;
}
