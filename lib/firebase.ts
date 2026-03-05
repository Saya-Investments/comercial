import type { Firestore } from 'firebase-admin/firestore'

let _firestore: Firestore | null = null

function getFirestoreInstance(): Firestore {
  if (_firestore) return _firestore

  const { initializeApp, getApps, cert } = require('firebase-admin/app')
  const { getFirestore } = require('firebase-admin/firestore')

  const credentials = JSON.parse(process.env.FIREBASE_CREDENTIALS || '{}')

  if (!getApps().length) {
    initializeApp({
      credential: cert(credentials),
    })
  }

  _firestore = getFirestore()
  return _firestore!
}

export const firestore = new Proxy({} as Firestore, {
  get(_target, prop) {
    const instance = getFirestoreInstance()
    const value = (instance as Record<string | symbol, unknown>)[prop]
    if (typeof value === 'function') {
      return value.bind(instance)
    }
    return value
  },
})
