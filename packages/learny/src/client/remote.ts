/** Shared adapter for generated Host results. */
export async function value<T>(promise: Promise<{ ok: true; value: T } | { ok: false; error: { message: string } }>): Promise<T> {
  const result = await promise
  if (!result.ok) throw new Error(result.error.message)
  return result.value
}
