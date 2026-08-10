type RpcError = { message: string; code?: string };

export type RpcClient = {
  rpc<T = unknown>(
    functionName: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: T | null; error: RpcError | null }>;
};

/**
 * The maintained Database type predates generated Relationships metadata, so the current Supabase
 * client's RPC generic resolves to `never`. Keep the escape hatch isolated until types are regenerated.
 */
export function getRpcClient(client: unknown): RpcClient {
  return client as RpcClient;
}
