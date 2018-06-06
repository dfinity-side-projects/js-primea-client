const crypto = require('crypto')
const tape = require('tape')
const fs = require('fs')
const path = require('path')
const cbor = require('borc')
const DfinityTx = require('dfinity-tx')
const { wasm2json, json2wasm } = require('wasm-json-toolkit')

const { Message, decoder } = require('primea-objects')
const { actorPathToId } = require('primea-objects/utils')
const PrimeaClient = require('../')
const WasmContainer = require('primea-wasm-container')

const WASM_PATH = __dirname
const primea = new PrimeaClient()
primea.logger.on('execution:error', e => console.error('logged:', e))
primea.logger.on('error', e => console.error('logged:', e))
// primea.logger.on('done', e => console.log(`done ${e._fromId.id.toString('hex')} ${e.funcRef.identifier[1]}`))

const sk = Buffer.from('78d783b89b0de774b8fcf465d9644fb1f739875876ec3f9cad8f56947e27d141', 'hex')
let nonce = 0

const resetToRoot = async () => {
  await primea.resetDatastore()
  nonce = 0

  const root = fs.readFileSync(WASM_PATH + '/root.wasm')
  const tx1 = new DfinityTx({
    nonce: nonce++,
    ticks: 100000,
    args: [root]
  })
  const actor = decoder.decodeFirst(await primea.ingress(tx1.sign(sk)))

  const stateRoot = await primea.getStateRoot()
  return actor
}

tape('counter', async t => {
  const rootActor = await resetToRoot()
  t.plan(1)

  const wasm = fs.readFileSync(WASM_PATH + '/counter.wasm')

  const tx0 = new DfinityTx({
    nonce: nonce++,
    ticks: 12000,
    funcName: rootActor.getFuncRef('make'),
    args: [wasm]
  })
  primea.ingress(tx0.sign(sk))
  await primea.getStateRoot()

  const actorId = actorPathToId([1, 1])
  const encodedActorId = cbor.encode(actorId)

  const tx1 = new DfinityTx({
    nonce: nonce++,
    ticks: 5000,
    actorId,
    funcName: 'main',
  })
  const signedTx1 = tx1.sign(sk)
  await primea.ingress(signedTx1)

  const tx2 = new DfinityTx({
    nonce: nonce++,
    ticks: 5000,
    actorId,
    funcName: 'main',
  })
  const signedTx2 = tx2.sign(sk)
  await primea.ingress(signedTx2)

  const stateRoot = await primea.getStateRoot()
  const storage = decoder.decodeFirst(await primea.getStorage(encodedActorId))

  t.deepEqual(storage[0], 2, `expected storage`)
})
