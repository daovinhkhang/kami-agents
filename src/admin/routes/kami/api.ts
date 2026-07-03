import type { Row } from "./types"

/* ------------------------------------------------------------------ */
/*  Fetch helpers                                                      */
/* ------------------------------------------------------------------ */

export const getJson = async <T,>(path: string): Promise<T> => {
  const r = await fetch(path, { credentials: "include" })
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
  return r.json()
}

export const postJson = async <T,>(path: string, body: Row): Promise<T> => {
  const r = await fetch(path, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
  return r.json()
}

export const patchJson = async <T,>(path: string, body: Row): Promise<T> => {
  const r = await fetch(path, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
  return r.json()
}

export const deleteJson = async <T,>(path: string): Promise<T> => {
  const r = await fetch(path, {
    method: "DELETE",
    credentials: "include",
  })
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
  return r.json()
}
