import type { Problem } from "./types.ts";

/** The ONLY backend base the browser bundle knows (ADR 0002, sensor no-network-url-in-bundle). */
export const API_BASE = "/api/storefront";

export class ApiError extends Error {
  readonly status: number;
  readonly problem: Problem | null;
  constructor(status: number, problem: Problem | null) {
    super(problem?.title ?? `HTTP ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.problem = problem;
  }
  /** The short problem slug, e.g. "session-required" from /problems/session-required. */
  get slug(): string {
    return this.problem?.type.split("/").pop() ?? "";
  }
}

export interface CallOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  actionId?: string;
  signal?: AbortSignal;
  /** Server-side rendering only: an absolute base plus the forwarded cookie. */
  base?: string;
  cookie?: string;
  fetchImpl?: typeof fetch;
}

export interface CallResult<T> {
  status: number;
  data: T;
  setCookie: string[];
}

function parseProblem(text: string): Problem | null {
  try {
    const p = JSON.parse(text) as Partial<Problem>;
    return typeof p.type === "string" && typeof p.title === "string" && typeof p.status === "number" ? (p as Problem) : null;
  } catch {
    return null;
  }
}

/** One BFF call. Throws ApiError carrying the RFC 9457 problem on any non-2xx answer. */
export async function callRaw<T>(path: string, o: CallOptions = {}): Promise<CallResult<T>> {
  const headers: Record<string, string> = { Accept: "application/json, application/problem+json" };
  if (o.body !== undefined) headers["Content-Type"] = "application/json";
  if (o.actionId) headers["X-Action-Id"] = o.actionId;
  if (o.cookie) headers["Cookie"] = o.cookie;
  const doFetch = o.fetchImpl ?? fetch;
  const init: RequestInit = { method: o.method ?? "GET", headers, credentials: "same-origin" };
  if (o.body !== undefined) init.body = JSON.stringify(o.body);
  if (o.signal) init.signal = o.signal;
  const res = await doFetch(`${o.base ?? API_BASE}${path}`, init);
  const text = await res.text();
  if (!res.ok) throw new ApiError(res.status, parseProblem(text));
  const data = (text ? JSON.parse(text) : null) as T;
  return { status: res.status, data, setCookie: res.headers.getSetCookie?.() ?? [] };
}

export async function call<T>(path: string, o: CallOptions = {}): Promise<T> {
  return (await callRaw<T>(path, o)).data;
}

/** Path segment for an upstream id: encoded, so an id can never alter the route. */
export function seg(id: string): string {
  return encodeURIComponent(id);
}

export function query(params: Record<string, string | number | boolean | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}
