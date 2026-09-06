// Stand-in for a supabase-js client. `from(table)` returns a chainable,
// thenable query builder: every builder method records its call and returns
// the builder; awaiting the builder resolves to the canned response for that
// table. A table's response is one { data, error, count } object, or an array
// of them consumed in order (the last one repeats).
export function makeSupabaseMock() {
  const responses = {}
  const calls = []
  const METHODS = [
    'select', 'insert', 'update', 'delete', 'upsert',
    'eq', 'neq', 'in', 'is', 'not', 'gt', 'gte', 'lt', 'lte', 'ilike', 'like',
    'order', 'limit', 'range', 'maybeSingle', 'single',
  ]

  function respond(table) {
    const r = responses[table]
    if (Array.isArray(r)) return r.length > 1 ? r.shift() : (r[0] || { data: null, error: null })
    return r || { data: null, error: null }
  }

  function from(table) {
    const call = { table, ops: [] }
    calls.push(call)
    const chain = {}
    for (const m of METHODS) {
      chain[m] = (...args) => { call.ops.push([m, ...args]); return chain }
    }
    chain.then = (resolve, reject) => Promise.resolve(respond(table)).then(resolve, reject)
    return chain
  }

  // Every recorded call of `name` against `table`, e.g. ops('bills', 'in').
  function ops(table, name) {
    return calls.filter((c) => c.table === table).flatMap((c) => c.ops.filter((o) => o[0] === name))
  }

  function tables() { return calls.map((c) => c.table) }

  function reset() {
    for (const k of Object.keys(responses)) delete responses[k]
    calls.length = 0
  }

  return { from, responses, calls, ops, tables, reset }
}
