/**
 * Cloudflare Pages Functions & D1 Type Definitions
 */

export interface D1PreparedStatement {
  bind(...values: any[]): D1PreparedStatement;
  first<T = any>(colName?: string): Promise<T | null>;
  run(): Promise<{ success: boolean; meta: any }>;
  all<T = any>(): Promise<{ results: T[]; success: boolean; meta: any }>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  dump(): Promise<ArrayBuffer>;
  batch<T = any>(statements: D1PreparedStatement[]): Promise<Array<{ results: T[]; success: boolean }>>;
  exec(query: string): Promise<{ count: number; duration: number }>;
}

export interface EventContext<Env, P extends string, Data> {
  request: Request;
  functionPath: string;
  waitUntil: (promise: Promise<any>) => void;
  next: (input?: Request | string, init?: RequestInit) => Promise<Response>;
  env: Env;
  params: Record<P, string | string[]>;
  data: Data;
}

export type PagesFunction<
  Env = unknown,
  Params extends string = any,
  Data extends Record<string, unknown> = Record<string, unknown>
> = (context: EventContext<Env, Params, Data>) => Response | Promise<Response>;

export interface AppEnv {
  DB?: D1Database;
  ENVIRONMENT?: string;
}
