import { AsyncLocalStorage } from "node:async_hooks";

import { Injectable } from "@nestjs/common";

export interface RequestContextStore {
  requestId: string;
  userId?: string;
  idempotencyKey?: string;
}

/**
 * AsyncLocalStorage-backed request context.
 * Anywhere downstream of the request middleware can read the current
 * requestId / userId / idempotencyKey without explicit propagation.
 */
@Injectable()
export class RequestContextService {
  private readonly als = new AsyncLocalStorage<RequestContextStore>();

  run<T>(store: RequestContextStore, fn: () => T): T {
    return this.als.run(store, fn);
  }

  getStore(): RequestContextStore | undefined {
    return this.als.getStore();
  }

  getRequestId(): string | undefined {
    return this.als.getStore()?.requestId;
  }

  getUserId(): string | undefined {
    return this.als.getStore()?.userId;
  }

  getIdempotencyKey(): string | undefined {
    return this.als.getStore()?.idempotencyKey;
  }

  setIdempotencyKey(key: string): void {
    const store = this.als.getStore();
    if (store) store.idempotencyKey = key;
  }

  setUserId(userId: string): void {
    const store = this.als.getStore();
    if (store) store.userId = userId;
  }
}
