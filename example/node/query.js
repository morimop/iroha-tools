/**
 * query asset
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

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

var p = new Promise((resolve, reject) => {
  console.log('Query transaction...')
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
      console.log(name)
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

p
  .then(() => {
    let query = queryBuilder
      .creatorAccountId(creator)
      .createdTime(Date.now())
      .queryCounter(startQueryCounter)
      .getAccountAssets('test@test','coin#test')
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
          console.log(name)
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

function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
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
