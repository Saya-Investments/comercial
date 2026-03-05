import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const credentials = JSON.parse(process.env.FIREBASE_CREDENTIALS || '{}')

if (!getApps().length) {
  initializeApp({
    credential: cert(credentials),
  })
}

export const firestore = getFirestore()
