import { PassThrough, type Readable } from "node:stream";
import { constants, createBrotliCompress, createGzip } from "node:zlib";
import { createReadableStreamFromReadable } from "@react-router/node";
import { isbot } from "isbot";
import { renderToPipeableStream } from "react-dom/server";
import { ServerRouter, type EntryContext } from "react-router";
import { contentSecurityPolicy, newNonce, SECURITY_HEADERS } from "./csp.ts";

export const streamTimeout = 5_000;

/**
 * The HTML document is on every page's critical path (LCP budget, ADR 0005): compress it like the static
 * assets. Flushing per chunk keeps the shell streaming.
 */
function compressed(request: Request, headers: Headers, body: PassThrough): Readable {
  const accept = request.headers.get("accept-encoding") ?? "";
  headers.append("Vary", "Accept-Encoding");
  if (/\bbr\b/.test(accept)) {
    headers.set("Content-Encoding", "br");
    return body.pipe(createBrotliCompress({ flush: constants.BROTLI_OPERATION_FLUSH, params: { [constants.BROTLI_PARAM_QUALITY]: 5 } }));
  }
  if (/\bgzip\b/.test(accept)) {
    headers.set("Content-Encoding", "gzip");
    return body.pipe(createGzip({ flush: constants.Z_SYNC_FLUSH }));
  }
  return body;
}

export default function handleRequest(
  request: Request,
  status: number,
  headers: Headers,
  routerContext: EntryContext,
) {
  return new Promise<Response>((resolve, reject) => {
    let shellRendered = false;
    const nonce = newNonce();
    const ua = request.headers.get("user-agent");
    // Crawlers wait for the whole document; shoppers get the shell streamed.
    const readyOption = ua && isbot(ua) ? "onAllReady" : "onShellReady";

    const { pipe, abort } = renderToPipeableStream(<ServerRouter context={routerContext} url={request.url} nonce={nonce} />, {
      nonce,
      [readyOption]() {
        shellRendered = true;
        const body = new PassThrough();
        headers.set("Content-Type", "text/html; charset=utf-8");
        headers.set("Content-Security-Policy", contentSecurityPolicy(nonce));
        for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v);
        resolve(new Response(createReadableStreamFromReadable(compressed(request, headers, body)), { headers, status }));
        pipe(body);
      },
      onShellError(error: unknown) {
        reject(error);
      },
      onError(error: unknown) {
        status = 500;
        if (shellRendered) console.error(error instanceof Error ? error.message : "render error");
      },
    });
    setTimeout(abort, streamTimeout + 1000);
  });
}
