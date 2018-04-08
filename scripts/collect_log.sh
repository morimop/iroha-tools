#!/bin/bash
irohad=irohad
cli=iroha-cli

CURDIR="$(cd "$(dirname "$0")"; pwd)"
IROHA_HOME="$(dirname "${CURDIR}")"
WORK_DIR="$IROHA_HOME"/work

i=0
while read -r node
do
    # switch docker daemon
    eval $(docker-machine env ${node})
    export COMPOSE_PROJECT_NAME=iroha${i}

    docker cp ${COMPOSE_PROJECT_NAME}_node_1:/iroha.log ${WORK_DIR}/peer${i}_iroha.log
    ((i++))
done < <(docker-machine ls -f "{{.Name}}")

ls ${WORK_DIR}
 
