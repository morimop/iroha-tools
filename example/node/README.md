- index.js: 引数にToriiのIP/Hostを受け取るように修正
- `nodejs setup.js [torii ip or host] [add Amount(format #9.99)]`
    - admin@testのcoin#testに指定額を追加
- `nodejs query.js [torii ip or host]`
    - admin@test,test@testのcoin#testのBalanceを確認
- `nodejs transfer.js [torii ip or host] [# of tx] [wait ms per tx]`
    - admin@textからtest@testへ資金転送（金額固定）

# 以下は元のドキュメント
# NodeJS client library example

## Prerequisites

1. Make sure you have running iroha on your machine. You can follow [this](https://hyperledger.github.io/iroha-api/#run-the-daemon-irohad) guide to launch iroha daemon. Please use keys for iroha from *iroha/example* folder, since this example uses keys from there.

2. If you are a lucky owner of a processor with the x64 architecture, you can install **iroha-lib** from the NPM repository with a simple command:

```sh
npm install iroha-lib
```

In other cases, you need to download the complete Iroha repository (in which you are now), go to the *shared_model/packages/javascript* folder and build the package on your system manually using the instructions from **README.md**.
In such case, you need to change the import paths in this example to *shared_model/packages/javascript*.

## Launch example

Script `index.js` does the following:
1. Assemble transaction from several commands using tx builder
2. Sign it using keys from iroha/example folder
3. Send it to iroha
4. Wait 5 secs and check transaction's status using its hash
5. Assemble query using query builder
6. Send query to iroha
7. Read query response

Launch it:
```sh
node index.js
```
