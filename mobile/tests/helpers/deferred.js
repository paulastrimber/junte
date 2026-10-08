/**
 * Promesa controlable desde el test, para observar estados intermedios (p. ej. "cargando").
 * @returns {{ promise: Promise<any>, resolve: (value: any) => void, reject: (reason: any) => void }}
 */
export function deferred () {
  let resolve
  let reject
  const promise = new Promise((_resolve, _reject) => {
    resolve = _resolve
    reject = _reject
  })
  return { promise, resolve, reject }
}
