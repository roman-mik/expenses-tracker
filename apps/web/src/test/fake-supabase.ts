/**
 * A minimal in-memory stand-in for the Supabase server client, faithful enough
 * to the PostgREST query-builder surface actually used in
 * `src/lib/queries/*` and `src/lib/mutations/*` (`.eq`, `.in`, `.gte`, `.lt`,
 * `.order`, `.limit`, `.single`, `.maybeSingle`, `.insert`, `.update`,
 * `.delete`, `.upsert`, `.rpc`) to exercise those functions by injection —
 * every one of them already takes the client as its first argument, so no
 * module mocking is needed.
 *
 * Not a PostgREST reimplementation: filters are a simple predicate chain
 * (AND-combined `.eq`/`.in`/`.gte`/`.lt`), matching every call site in this
 * codebase. If a future query needs `.or()` or embedded joins, extend here.
 */
import type { SupabaseServerClient } from '@/lib/supabase/types';

export type Row = Record<string, unknown>;
type PGError = { message: string; code?: string } | null;
type PGResult<T> = { data: T; error: PGError };

/** Table name -> row array. Mutate directly in tests via `db.seed(...)`. */
export class FakeDb {
  tables = new Map<string, Row[]>();
  /** table -> mode ('select'|'insert'|'update'|'delete'|'upsert') -> forced error message */
  errors = new Map<string, string>();
  rpcHandlers = new Map<
    string,
    (args: Record<string, unknown>) => PGResult<unknown>
  >();

  seed(table: string, rows: Row[]) {
    this.tables.set(
      table,
      rows.map((r) => ({ ...r }))
    );
    return this;
  }

  rows(table: string): Row[] {
    if (!this.tables.has(table)) this.tables.set(table, []);
    return this.tables.get(table)!;
  }

  /** Force the next call against `table` (any mode) to error with `message`. */
  failNext(table: string, message: string) {
    this.errors.set(table, message);
  }

  onRpc(
    name: string,
    handler: (args: Record<string, unknown>) => PGResult<unknown>
  ) {
    this.rpcHandlers.set(name, handler);
  }

  private takeError(table: string): string | null {
    const msg = this.errors.get(table);
    if (msg) this.errors.delete(table);
    return msg ?? null;
  }

  query(table: string) {
    return new FakeQueryBuilder(this, table);
  }

  rpc(
    name: string,
    args: Record<string, unknown> = {}
  ): Promise<PGResult<unknown>> {
    const handler = this.rpcHandlers.get(name);
    if (!handler) {
      throw new Error(`FakeDb: no rpc handler registered for "${name}"`);
    }
    return Promise.resolve(handler(args));
  }

  errorFor(table: string) {
    return this.takeError(table);
  }
}

type Filter = (row: Row) => boolean;
type Mode = 'select' | 'insert' | 'update' | 'delete' | 'upsert';

class FakeQueryBuilder implements PromiseLike<PGResult<unknown>> {
  private filters: Filter[] = [];
  private orderCols: { col: string; ascending: boolean }[] = [];
  private limitN?: number;
  private mode: Mode = 'select';
  private payload?: Row | Row[];
  private onConflictCols?: string[];
  private singleFlag = false;
  private maybeSingleFlag = false;

  constructor(
    private db: FakeDb,
    private table: string
  ) {}

  select(_cols?: string) {
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push((r) => r[col] === val);
    return this;
  }
  in(col: string, vals: unknown[]) {
    this.filters.push((r) => vals.includes(r[col]));
    return this;
  }
  gte(col: string, val: string) {
    this.filters.push((r) => String(r[col]) >= val);
    return this;
  }
  lt(col: string, val: string) {
    this.filters.push((r) => String(r[col]) < val);
    return this;
  }
  /** Matches PostgREST: repeated .order() calls add secondary sort keys. */
  order(col: string, opts?: { ascending?: boolean }) {
    this.orderCols.push({ col, ascending: opts?.ascending ?? true });
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  insert(payload: Row | Row[]) {
    this.mode = 'insert';
    this.payload = payload;
    return this;
  }
  update(payload: Row) {
    this.mode = 'update';
    this.payload = payload;
    return this;
  }
  delete() {
    this.mode = 'delete';
    return this;
  }
  upsert(payload: Row | Row[], opts?: { onConflict?: string }) {
    this.mode = 'upsert';
    this.payload = payload;
    this.onConflictCols = opts?.onConflict?.split(',').map((s) => s.trim());
    return this;
  }
  maybeSingle() {
    this.maybeSingleFlag = true;
    return this;
  }
  single() {
    this.singleFlag = true;
    return this;
  }

  then<TResult1 = PGResult<unknown>, TResult2 = never>(
    onfulfilled?:
      ((value: PGResult<unknown>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private applyOrderLimit(rows: Row[]): Row[] {
    let out = rows;
    if (this.orderCols.length > 0) {
      out = [...out].sort((a, b) => {
        for (const { col, ascending } of this.orderCols) {
          const av = a[col] as string | number;
          const bv = b[col] as string | number;
          if (av < bv) return ascending ? -1 : 1;
          if (av > bv) return ascending ? 1 : -1;
        }
        return 0;
      });
    }
    if (this.limitN !== undefined) out = out.slice(0, this.limitN);
    return out;
  }

  private finish(rows: Row[]): PGResult<unknown> {
    if (this.singleFlag) {
      return rows.length === 1
        ? { data: rows[0], error: null }
        : { data: null, error: { message: 'Row not found' } };
    }
    if (this.maybeSingleFlag) {
      return { data: rows[0] ?? null, error: null };
    }
    return { data: rows, error: null };
  }

  private async execute(): Promise<PGResult<unknown>> {
    const forced = this.db.errorFor(this.table);
    if (forced) return { data: null, error: { message: forced } };

    const store = this.db.rows(this.table);

    if (this.mode === 'insert') {
      const incoming = Array.isArray(this.payload)
        ? this.payload
        : [this.payload!];
      const inserted = incoming.map((r) => {
        const row: Row = {
          id: `fake-${store.length}-${Math.random().toString(36).slice(2, 8)}`,
          ...r,
        };
        store.push(row);
        return row;
      });
      return this.finish(inserted);
    }

    if (this.mode === 'upsert') {
      const payloads = Array.isArray(this.payload)
        ? this.payload
        : [this.payload as Row];
      const matchCols = this.onConflictCols;
      const upserted = payloads.map((payload) => {
        // With `onConflict`, match exactly those columns (matching real
        // upsert semantics for composite keys, e.g. `horizon_fx_rates` on
        // `(base_code, quote_code, as_of_date)`). Without it, fall back to
        // "shares any key" — sufficient for this codebase's other,
        // single-key upserts (e.g. `budget_settings` on `household_id`).
        const existing = store.find((r) =>
          matchCols
            ? matchCols.every((k) => r[k] === payload[k])
            : Object.keys(payload).some(
                (k) => r[k] !== undefined && r[k] === payload[k]
              )
        );
        if (existing) {
          Object.assign(existing, payload);
          return existing;
        }
        const row: Row = { id: `fake-${store.length}`, ...payload };
        store.push(row);
        return row;
      });
      return this.finish(upserted);
    }

    const matched = () => store.filter((r) => this.filters.every((f) => f(r)));

    if (this.mode === 'update') {
      const rows = matched();
      rows.forEach((r) => Object.assign(r, this.payload));
      return this.finish(this.applyOrderLimit(rows));
    }

    if (this.mode === 'delete') {
      const rows = matched();
      const remaining = store.filter((r) => !rows.includes(r));
      this.db.tables.set(this.table, remaining);
      return this.finish(rows);
    }

    // select
    return this.finish(this.applyOrderLimit(matched()));
  }
}

/**
 * Builds a fake client shaped enough like `SupabaseServerClient` to satisfy
 * every query/mutation function's actual usage (`.from(...)`, `.rpc(...)`).
 * Cast through `unknown` — it deliberately doesn't implement the full
 * supabase-js surface, only what this codebase calls.
 */
export function fakeSupabase(db: FakeDb = new FakeDb()): {
  client: SupabaseServerClient;
  db: FakeDb;
} {
  const client = {
    from: (table: string) => db.query(table),
    rpc: (name: string, args?: Record<string, unknown>) => db.rpc(name, args),
  } as unknown as SupabaseServerClient;
  return { client, db };
}
