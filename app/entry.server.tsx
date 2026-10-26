import { PassThrough } from "node:stream";
import { createReadableStreamFromReadable } from "@react-router/node";
import { isbot } from "isbot";
import { renderToPipeableStream } from "react-dom/server";
import { ServerRouter, type EntryContext } from "react-router";
import { contentSecurityPolicy, newNonce, SECURITY_HEADERS } from "./csp.ts";

export const streamTimeout = 5_000;

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
        resolve(new Response(createReadableStreamFromReadable(body), { headers, status }));
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
