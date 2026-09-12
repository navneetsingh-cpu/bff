import { generateKeyPairSync, randomBytes } from 'node:crypto'

const { publicKey, privateKey } = generateKeyPairSync('ed25519')
const esc = (pem) => JSON.stringify(pem).slice(1, -1)

console.log(`INTERNAL_JWT_PRIVATE_KEY="${esc(privateKey.export({ type: 'pkcs8', format: 'pem' }))}"`)
console.log(`INTERNAL_JWT_PUBLIC_KEY="${esc(publicKey.export({ type: 'spki', format: 'pem' }))}"`)
console.log(`SESSION_ENC_KEY=${randomBytes(32).toString('base64')}`)
