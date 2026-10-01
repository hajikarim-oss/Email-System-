// The root server/ runtime imports the `pg` driver directly and wraps it in
// its own narrow helper (server/pg.ts). The npm package ships no bundled
// types and @types/pg is not installed, so this ambient declaration covers
// exactly what the helper uses (a constructible Pool with query/connect).
// Same contract the api/server tsc sweep uses (strict off). This file must
// stay listed in tsconfig.node.json's include.
declare module "pg" {
    export interface PoolClient {
        query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
        release(): void;
    }

    export class Pool {
        constructor(config?: Record<string, unknown>);
        connect(): Promise<PoolClient>;
        query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
        end(): Promise<void>;
    }

    export class Client {
        constructor(config?: Record<string, unknown>);
        connect(): Promise<void>;
        query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
        end(): Promise<void>;
    }
}
