import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';

const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.wasm': 'application/wasm'
};

export async function resolveStaticFile(distDir, pathname) {
    if (!pathname) pathname = '/';

    const cleanPathname = pathname.split('?')[0].split('#')[0];
    let normalizedPath = cleanPathname || '/';

    if (normalizedPath.length > 1 && normalizedPath.endsWith('/')) {
        normalizedPath = normalizedPath.slice(0, -1);
    }

    try {
        normalizedPath = decodeURIComponent(normalizedPath);
    } catch (err) {
        return null;
    }

    const absoluteDistDir = path.resolve(distDir);
    const requestedPath = path.join(absoluteDistDir, normalizedPath);

    if (!requestedPath.startsWith(absoluteDistDir + path.sep) && requestedPath !== absoluteDistDir) {
        return null;
    }

    try {
        const stats = await fsPromises.stat(requestedPath);
        if (stats.isFile()) {
            return requestedPath;
        }
    } catch (err) {
        return null;
    }

    return null;
}

export async function serveStaticFile(resolvedPath, request, response) {
    const ext = path.extname(resolvedPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    const filename = path.basename(resolvedPath);
    const isHashedAsset = /\.[a-f0-9]{8,}\.[a-z0-9]+$/i.test(filename);

    const cacheControl = isHashedAsset
        ? 'public, max-age=31536000, immutable'
        : 'public, max-age=0, must-revalidate';

    const headers = {
        'Content-Type': contentType,
        'Cache-Control': cacheControl
    };

    const acceptEncoding = request?.headers?.['accept-encoding'] || '';
    let encoding = null;

    if (acceptEncoding.includes('br')) {
        encoding = 'br';
    } else if (acceptEncoding.includes('gzip')) {
        encoding = 'gzip';
    }

    let streamPipeline = null;

    if (encoding) {
        headers['Vary'] = 'Accept-Encoding';
        const precompressedExt = encoding === 'br' ? '.br' : '.gz';
        const precompressedPath = `${resolvedPath}${precompressedExt}`;

        try {
            const stats = await fsPromises.stat(precompressedPath);
            if (stats.isFile()) {
                headers['Content-Encoding'] = encoding;
                streamPipeline = fs.createReadStream(precompressedPath);
            }
        } catch (err) {
        }

        if (!streamPipeline) {
            headers['Content-Encoding'] = encoding;
            const compressor = encoding === 'br'
                ? zlib.createBrotliCompress()
                : zlib.createGzip();

            streamPipeline = fs.createReadStream(resolvedPath).pipe(compressor);
        }
    } else {
        streamPipeline = fs.createReadStream(resolvedPath);
    }

    return new Promise((resolve, reject) => {
        streamPipeline.on('error', (err) => {
            console.error(`Error serving file ${resolvedPath}:`, err);
            if (!response.headersSent && (!response.statusCode || response.statusCode !== 500)) {
                response.writeHead(500, { 'Content-Type': 'text/plain' });
                response.end('Internal Server Error');
            }
            resolve();
        });

        response.on('finish', resolve);
        response.on('error', reject);

        response.writeHead(200, headers);
        streamPipeline.pipe(response);
    });
}