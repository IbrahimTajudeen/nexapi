import type { QueryClient, OptimisticTransaction } from "./client.js";
import type { QueryKey } from "./key.js";
import type { QueryFilter } from "./types.js";
import { isTransientError, noop, sleep } from "./util.js";

export type MutationStatus = "idle" | "pending" | "success" | "error";

export interface MutationState<TData, TError, TVariables, TContext> {
  readonly status: MutationStatus;
  readonly data: TData | undefined;
  readonly error: TError | null;
  readonly variables: TVariables | undefined;
  readonly context: TContext | undefined;
  readonly failureCount: number;
  readonly submittedAt: number;
}

export interface MutationHelpers {
  readonly client: QueryClient;
  /**
   * Apply an optimistic update to matching cached queries. The returned transaction is
   * managed for you: rolled back if the mutation fails, committed if it succeeds.
   * (You may still call `rollback()`/`commit()` yourself.)
   */
  readonly optimistic: <T>(
    target: QueryKey | QueryFilter,
    updater: (old: T | undefined) => T | undefined,
  ) => OptimisticTransaction;
}

/**
 * Retrying a mutation can apply it twice. It is therefore never on by default, and enabling it
 * requires the caller to assert the operation is safe to repeat (`idempotent: true`), e.g.
 * because the server deduplicates on an idempotency key.
 */
export interface MutationRetryPolicy<TError> {
  idempotent: true;
  /** Maximum number of retries after the first attempt. */
  attempts: number;
  delay?: number | ((attempt: number) => number);
  /** Defaults to transient failures only (network, timeout, 408/429/5xx). */
  when?: (error: TError, attempt: number) => boolean;
}

export type InvalidationTargets = readonly (QueryKey | QueryFilter)[];

export interface MutationConfig<TData, TError = Error, TVariables = void, TContext = unknown> {
  mutationKey?: QueryKey;
  /** Mutations sharing a scope id run their network calls one after another, in submit order. */
  scope?: { id: string };
  onMutate?: (variables: TVariables, helpers: MutationHelpers) => TContext | Promise<TContext>;
  onSuccess?: (
    data: TData,
    variables: TVariables,
    context: TContext | undefined,
    helpers: MutationHelpers,
  ) => unknown;
  onError?: (
    error: TError,
    variables: TVariables,
    context: TContext | undefined,
    helpers: MutationHelpers,
  ) => unknown;
  onSettled?: (
    data: TData | undefined,
    error: TError | null,
    variables: TVariables,
    context: TContext | undefined,
    helpers: MutationHelpers,
  ) => unknown;
  retry?: MutationRetryPolicy<TError>;
  /** Invalidated (and active ones refetched, awaited) after `onSuccess`. */
  invalidates?: InvalidationTargets | ((data: TData, variables: TVariables) => InvalidationTargets);
  meta?: Readonly<Record<string, unknown>>;
}

export interface MutationOptions<
  TData,
  TError = Error,
  TVariables = void,
  TContext = unknown,
> extends MutationConfig<TData, TError, TVariables, TContext> {
  mutationFn: (variables: TVariables) => Promise<TData>;
  queryClient?: QueryClient;
}

type Listener = () => void;

/** Tracks in-flight mutations and serializes those that share a scope. */
export class MutationCache {
  readonly #active = new Set<Mutation<never, never, never, never>>();
  readonly #tails = new Map<string, Promise<void>>();
  readonly #listeners = new Set<Listener>();

  get size(): number {
    return this.#active.size;
  }
  getAll(): readonly Mutation<never, never, never, never>[] {
    return [...this.#active];
  }
  subscribe(listener: Listener): () => void {
    this.#listeners.add(listener);
    return () => void this.#listeners.delete(listener);
  }
  /** @internal */
  _track(mutation: Mutation<never, never, never, never>, active: boolean): void {
    if (active) this.#active.add(mutation);
    else this.#active.delete(mutation);
    this.notify();
  }
  /** @internal */
  notify(): void {
    for (const l of [...this.#listeners]) l();
  }
  /** @internal Reserve a place in the scope's queue synchronously, at submit time. */
  _enter(id: string): { ready: Promise<void>; release: () => void } {
    const previous = this.#tails.get(id) ?? Promise.resolve();
    let release = noop;
    const mine = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => mine);
    this.#tails.set(id, tail);
    return {
      ready: previous,
      release: () => {
        release();
        void tail.then(() => {
          if (this.#tails.get(id) === tail) this.#tails.delete(id);
        });
      },
    };
  }
}

export class Mutation<TData, TError, TVariables, TContext> {
  state: MutationState<TData, TError, TVariables, TContext> = {
    status: "idle",
    data: undefined,
    error: null,
    variables: undefined,
    context: undefined,
    failureCount: 0,
    submittedAt: 0,
  };
  readonly #client: QueryClient;
  readonly #options: MutationOptions<TData, TError, TVariables, TContext>;
  readonly #listeners = new Set<Listener>();
  readonly #transactions: OptimisticTransaction[] = [];
  readonly #helpers: MutationHelpers;

  constructor(client: QueryClient, options: MutationOptions<TData, TError, TVariables, TContext>) {
    const policy = options.retry as { idempotent?: unknown; attempts?: unknown } | undefined;
    if (policy !== undefined && (policy.idempotent !== true || typeof policy.attempts !== "number"))
      throw new TypeError(
        "Mutation retry requires { idempotent: true, attempts: number }: retrying can apply a mutation twice, so you must opt in explicitly.",
      );
    this.#client = client;
    this.#options = options;
    this.#helpers = {
      client,
      optimistic: (target, updater) => {
        const tx = client.optimistic(target, updater);
        this.#transactions.push(tx);
        return tx;
      },
    };
  }

  subscribe(listener: Listener): () => void {
    this.#listeners.add(listener);
    return () => void this.#listeners.delete(listener);
  }

  #dispatch(patch: Partial<MutationState<TData, TError, TVariables, TContext>>): void {
    this.state = { ...this.state, ...patch };
    for (const l of [...this.#listeners]) l();
    this.#client.mutationCache.notify();
  }

  async execute(variables: TVariables): Promise<TData> {
    const o = this.#options;
    const h = this.#helpers;
    const slot = o.scope ? this.#client.mutationCache._enter(o.scope.id) : undefined;
    this.#client.mutationCache._track(this as never, true);
    this.#dispatch({ status: "pending", variables, submittedAt: Date.now(), failureCount: 0 });

    let context: TContext | undefined;
    let outcome: { ok: true; data: TData } | { ok: false; error: unknown };
    try {
      // Runs immediately so optimistic UI is instant even if the network call must queue.
      context = await o.onMutate?.(variables, h);
      this.#dispatch({ context });
      await slot?.ready;
      const data = await this.#attempt(variables);
      for (const tx of this.#transactions) tx.commit();
      await o.onSuccess?.(data, variables, context, h);
      const targets =
        typeof o.invalidates === "function" ? o.invalidates(data, variables) : o.invalidates;
      if (targets) await Promise.all(targets.map((t) => this.#client.invalidateQueries(t)));
      outcome = { ok: true, data };
    } catch (error) {
      for (const tx of this.#transactions) tx.rollback(); // no-op for already committed ones
      outcome = { ok: false, error };
    } finally {
      slot?.release();
    }

    try {
      if (outcome.ok) await o.onSettled?.(outcome.data, null, variables, context, h);
      else {
        await o.onError?.(outcome.error as TError, variables, context, h);
        await o.onSettled?.(undefined, outcome.error as TError, variables, context, h);
      }
    } catch (error) {
      if (outcome.ok) outcome = { ok: false, error };
    }

    this.#client.mutationCache._track(this as never, false);
    if (outcome.ok) {
      this.#dispatch({ status: "success", data: outcome.data, error: null });
      return outcome.data;
    }
    this.#dispatch({ status: "error", error: outcome.error as TError });
    throw outcome.error;
  }

  async #attempt(variables: TVariables): Promise<TData> {
    const policy = this.#options.retry;
    let retries = 0;
    for (;;) {
      try {
        return await this.#options.mutationFn(variables);
      } catch (error) {
        if (!policy || retries >= policy.attempts) throw error;
        retries++;
        const when = policy.when ?? ((e: TError) => isTransientError(e));
        if (!when(error as TError, retries)) throw error;
        this.#dispatch({ failureCount: retries });
        const delay =
          typeof policy.delay === "function"
            ? policy.delay(retries)
            : (policy.delay ?? 500 * retries);
        await sleep(delay);
      }
    }
  }
}

export interface MutationResult<TData, TError, TVariables> {
  readonly status: MutationStatus;
  readonly data: TData | undefined;
  readonly error: TError | null;
  readonly variables: TVariables | undefined;
  readonly isIdle: boolean;
  readonly isPending: boolean;
  readonly isSuccess: boolean;
  readonly isError: boolean;
  readonly failureCount: number;
  /** Fire and forget: errors are reflected in state, never thrown. */
  mutate: (variables: TVariables, callbacks?: MutateCallbacks<TData, TError, TVariables>) => void;
  /** Returns the promise; rejects on failure. */
  mutateAsync: (variables: TVariables) => Promise<TData>;
  reset: () => void;
}

export interface MutateCallbacks<TData, TError, TVariables> {
  onSuccess?: (data: TData, variables: TVariables) => void;
  onError?: (error: TError, variables: TVariables) => void;
  onSettled?: (data: TData | undefined, error: TError | null, variables: TVariables) => void;
}

/** Tracks the most recent mutation started through it. Concurrent `mutate` calls all run. */
export class MutationObserver<TData, TError = Error, TVariables = void, TContext = unknown> {
  readonly #client: QueryClient;
  #options: MutationOptions<TData, TError, TVariables, TContext>;
  #current: Mutation<TData, TError, TVariables, TContext> | undefined;
  #unsubscribe: (() => void) | undefined;
  readonly #listeners = new Set<Listener>();
  #result: MutationResult<TData, TError, TVariables>;
  readonly #mutate: MutationResult<TData, TError, TVariables>["mutate"];
  readonly #mutateAsync: MutationResult<TData, TError, TVariables>["mutateAsync"];
  readonly #reset: () => void;

  constructor(client: QueryClient, options: MutationOptions<TData, TError, TVariables, TContext>) {
    this.#client = client;
    this.#options = options;
    this.#mutateAsync = (variables) => this.#start(variables);
    this.#mutate = (variables, callbacks) => {
      const mutation = this.#startMutation(variables);
      mutation.promise.then(
        (data) => {
          if (this.#current !== mutation.mutation) return;
          callbacks?.onSuccess?.(data, variables);
          callbacks?.onSettled?.(data, null, variables);
        },
        (error: unknown) => {
          if (this.#current !== mutation.mutation) return;
          callbacks?.onError?.(error as TError, variables);
          callbacks?.onSettled?.(undefined, error as TError, variables);
        },
      );
    };
    this.#reset = () => {
      this.#detach();
      this.#current = undefined;
      this.#refresh();
    };
    this.#result = this.#compute(undefined);
  }

  getResult(): MutationResult<TData, TError, TVariables> {
    return this.#result;
  }

  setOptions(options: MutationOptions<TData, TError, TVariables, TContext>): void {
    this.#options = options;
  }

  subscribe(listener: Listener): () => void {
    this.#listeners.add(listener);
    return () => void this.#listeners.delete(listener);
  }

  #start(variables: TVariables): Promise<TData> {
    return this.#startMutation(variables).promise;
  }

  #startMutation(variables: TVariables): {
    mutation: Mutation<TData, TError, TVariables, TContext>;
    promise: Promise<TData>;
  } {
    const mutation = new Mutation(this.#client, this.#options);
    this.#detach();
    this.#current = mutation;
    this.#unsubscribe = mutation.subscribe(() => this.#refresh());
    const promise = mutation.execute(variables);
    promise.catch(noop); // the failure is in state; callers of mutateAsync still see the rejection
    this.#refresh();
    return { mutation, promise };
  }

  #detach(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = undefined;
  }

  #refresh(): void {
    const next = this.#compute(this.#result);
    if (next === this.#result) return;
    this.#result = next;
    for (const l of [...this.#listeners]) l();
  }

  #compute(
    previous: MutationResult<TData, TError, TVariables> | undefined,
  ): MutationResult<TData, TError, TVariables> {
    const s = this.#current?.state;
    const status: MutationStatus = s?.status ?? "idle";
    if (
      previous &&
      previous.status === status &&
      previous.data === s?.data &&
      previous.error === (s?.error ?? null) &&
      previous.variables === s?.variables &&
      previous.failureCount === (s?.failureCount ?? 0)
    )
      return previous;
    return {
      status,
      data: s?.data,
      error: s?.error ?? null,
      variables: s?.variables,
      isIdle: status === "idle",
      isPending: status === "pending",
      isSuccess: status === "success",
      isError: status === "error",
      failureCount: s?.failureCount ?? 0,
      mutate: this.#mutate,
      mutateAsync: this.#mutateAsync,
      reset: this.#reset,
    };
  }
}
