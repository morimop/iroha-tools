/**
 * transfer asset, wait status
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'
process.on('unhandledRejection', console.dir);

function blob2array (blob) {
  var bytearray = new Uint8Array(blob.size())
  for (let i = 0; i < blob.size(); ++i) {
    bytearray[i] = blob.get(i)
  }
  return bytearray
}

var toriiNode = ""
if (process.argv.length > 2) {
  toriiNode = process.argv[2];
} else {
  toriiNode = "localhost";
}
const loopCount = (process.argv.length > 3) ? process.argv[3] : 10
const delayMilisec = (process.argv.length > 4) ? process.argv[4] : 100
console.log('['+Date.now()+'] START client > ' +
  'number of tx:',loopCount,', delay',delayMilisec,' milisec.')

var iroha = require('iroha-lib')
var txBuilder = new iroha.ModelTransactionBuilder()
var queryBuilder = new iroha.ModelQueryBuilder()
var crypto = new iroha.ModelCrypto()
var protoTxHelper = new iroha.ModelProtoTransaction()
var protoQueryHelper = new iroha.ModelProtoQuery()
var fs = require('fs')
var adminPriv = fs.readFileSync('../admin@test.priv').toString()
var adminPub = fs.readFileSync('../admin@test.pub').toString()

var keys = crypto.convertFromExisting(adminPub, adminPriv)

var currentTime = Date.now()
var startTxCounter = 1
var startQueryCounter = 1
var creator = 'admin@test'

var grpc = require('grpc')
var endpointGrpc = require('iroha-lib/pb/endpoint_grpc_pb.js')
var client = new endpointGrpc.CommandServiceClient(
  toriiNode+':50051',
  grpc.credentials.createInsecure()
)
// create status request
var endpointPb = require('iroha-lib/pb/endpoint_pb.js')
var stsRequest = new endpointPb.TxStatusRequest()

const descriptionStr = ''
let txHash = ''
let hashForLog = ''

var p = new Promise((res, rej) => {
  console.log('start loop')
  function loop(i) {
    return new Promise((resolve, reject) => {
      // build transaction
      var tx = txBuilder
        .creatorAccountId(creator)
        .txCounter(i)
        .createdTime(Date.now())
        .transferAsset('admin@test','test@test','coin#test',descriptionStr,'0.01')
        .build()

      // sign transaction and get its binary representation (Blob)
      var txblob = protoTxHelper.signAndAddSignature(tx, keys).blob()
      var txArray = blob2array(txblob)
      // create proto object and send to iroha
      var blockTransaction = require('iroha-lib/pb/block_pb.js').Transaction // block_pb2.Transaction()
      var protoTx = blockTransaction.deserializeBinary(txArray)
      
      txHash = blob2array(tx.hash().blob())
      hashForLog = tx.hash()

      console.log('['+Date.now()+'],'+hashForLog+'[loop]Submit transaction...:'+i)
      client.torii(protoTx, (err, data) => {
        if (err) {
          console.log('[loop]ERROR occured at submitting transaction')
          reject(new Error("submit error"))
        } else {
          console.log('[loop]Submitted transaction successfully')
          resolve(i)
        }
      })
    }).then((count) => {
      return sleep(delayMilisec,count)
    }).then((ct) => {
      return new Promise((resolve, reject) => {
        function waitStatus() {
          stsRequest.setTxHash(txHash)
          client.status(stsRequest, (err, response) => {
            if (err) {
              reject(err)
            } else {
              let status = response.getTxStatus()
              if (status == 4) { // COMMITTED: 4
                // next
                console.log('['+Date.now()+'],'+hashForLog+'[loop]transaction comitted')
                resolve(ct)
              } else if (status == 0 || status == 2 || status == 6) { // STATELESS_VALIDATION_FAILED: 0,STATEFUL_VALIDATION_FAILED: 2, NOT_RECEIVED: 6
                reject(new Error("Unexpected Status:" + status))
              } else {
                // wait delayMilisec
                //setTimeout(()=>{waitStatus()},delayMilisec)
                waitStatus()
              }
            }
          })
        }
        waitStatus()
      })
    }).then((count)=>{
      if(count >= loopCount) {
        res()
      } else {
        loop(count+1)
      }
    })
  }
  loop(1)
})

p
  .then(() => {
    console.log('Sleep 5 seconds...')
    return sleep(5000,0)
  })
  .then(() => {
    console.log('Send transaction status request...')
    return new Promise((resolve, reject) => {
      // create status request
      var endpointPb = require('iroha-lib/pb/endpoint_pb.js')
      var request = new endpointPb.TxStatusRequest()
      request.setTxHash(txHash)
      client.status(request, (err, response) => {
        if (err) {
          reject(err)
        } else {
          let status = response.getTxStatus()
          let TxStatus = require('iroha-lib/pb/endpoint_pb.js').TxStatus
          let statusName = getProtoEnumName(
            TxStatus,
            'iroha.protocol.TxStatus',
            status
          )
          console.log('Got transaction status: ' + statusName + '=' + status)
          if (statusName !== 'COMMITTED') {
            reject(new Error("Your transaction wasn't committed"))
          } else {
            resolve()
          }
        }
      })
    })
  })
  .then(() => {
    console.log('Query transaction...')
    let query = queryBuilder
      .creatorAccountId(creator)
      .createdTime(Date.now())
      .queryCounter(startQueryCounter)
      .getAccountAssets('admin@test','coin#test')
      .build()
    let queryBlob = protoQueryHelper.signAndAddSignature(query, keys).blob()
    let pbQuery = require('iroha-lib/pb/queries_pb.js').Query
    let queryArray = blob2array(queryBlob)
    let protoQuery = pbQuery.deserializeBinary(queryArray)
    let client = new endpointGrpc.QueryServiceClient(
      toriiNode+':50051',
      grpc.credentials.createInsecure()
    )
    return new Promise((resolve, reject) => {
      client.find(protoQuery, (err, response) => {
        if (err) {
          reject(err)
        } else {
          console.log('Submitted transaction successfully')
          let type = response.getResponseCase()
          let responsePb = require('iroha-lib/pb/responses_pb.js')
          let name = getProtoEnumName(
            responsePb.QueryResponse.ResponseCase,
            'iroha.protocol.QueryResponse',
            type
          )
          if (name !== 'ACCOUNT_ASSETS_RESPONSE') {
            reject(new Error('Query response error'))
          } else {
            let accountAsset = response.getAccountAssetsResponse().getAccountAsset()
            console.log(
              'Asset Id = ' +
                accountAsset.getAssetId() +
                ' , Account Id = ' +
                accountAsset.getAccountId()+
                ' , Balance = ' +
                accountAsset.getBalance()
            )
            resolve()
          }
        }
      })
    })
  })
  .then(() => {
    console.log('done!')
  })
  .catch(err => {
    console.log(err)
  })

function sleep (ms,count) {
  return new Promise(resolve => setTimeout(()=>{resolve(count)}, ms))
}

var protoEnumName = {}
function getProtoEnumName (obj, key, value) {
  if (protoEnumName.hasOwnProperty(key)) {
    if (protoEnumName[key].length < value) {
      return 'unknown'
    } else {
      return protoEnumName[key][value]
    }
  } else {
    protoEnumName[key] = []
    for (var k in obj) {
      let idx = obj[k]
      if (isNaN(idx)) {
        console.log(
          'getProtoEnumName:wrong enum value, now is type of ' +
            typeof idx +
            ' should be integer'
        )
      } else {
        protoEnumName[key][idx] = k
      }
    }
    return getProtoEnumName(obj, key, value)
  }
}
