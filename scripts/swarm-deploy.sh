#!/bin/bash
irohad=irohad
cli=iroha-cli

CURDIR="$(cd "$(dirname "$0")"; pwd)"
IROHA_HOME="$(dirname "${CURDIR}")"
WORK_DIR="$IROHA_HOME"/work

mkdir ${WORK_DIR}
export COMPOSE_FILE=${IROHA_HOME}/docker/docker-compose-swarm.yml

# create empty file for list of peers
> ${WORK_DIR}/peers.list
# append each peer to the file
COUNT=$(docker-machine ls -f "{{.Name}}" | wc -l)
((COUNT--))
#for i in $(seq 0 ${COUNT})
#do
#    echo "iroha${i}_node_1:10001" | cat >> ${WORK_DIR}/peers.list
#done

# create overlay network
eval $(docker-machine env $(docker-machine ls -f "{{.Name}}" | head -1))
docker network create --driver overlay --attachable iroha_network

# start up peers
i=0
while read -r node
do
    # switch docker daemon
    eval $(docker-machine env ${node})
    export COMPOSE_PROJECT_NAME=iroha${i}

    # copy entrypoint.sh
    docker-machine scp $IROHA_HOME/docker/script/entrypoint.sh "$node":/tmp

    # create services
    docker-compose up -d

    # wait for postgres start
    until [ "$(docker inspect -f {{.State.Running}} ${COMPOSE_PROJECT_NAME}_postgres_1)" == "true" ]
    do
        sleep 0.1;
    done

    # wait for postgres accepting connections
    until docker exec ${COMPOSE_PROJECT_NAME}_postgres_1 pg_isready
    do
        sleep 0.1;
    done

    # generate peers
    docker inspect --format '{{ .NetworkSettings.Networks.iroha_network.IPAddress }}' ${COMPOSE_PROJECT_NAME}_node_1 | sed -e 's/$/\:10001/' >> ${WORK_DIR}/peers.list

    ((i++))
done < <(docker-machine ls -f "{{.Name}}")

# set up peers
i=0
while read -r node
do
    # switch docker daemon
    eval $(docker-machine env ${node})
    export COMPOSE_PROJECT_NAME=iroha${i}

    # generate config
    # TODO 22/08/17 Lebedev: replace with environment variables IR-502
    echo "{
      \"block_store_path\" : \"/tmp/block_store/\",
      \"torii_port\" : 50051,
      \"internal_port\" : 10001,
      \"pg_opt\" : \"host=${COMPOSE_PROJECT_NAME}_postgres_1 port=5432 user=iroha password=helloworld\",
      \"max_proposal_size\" : 1000,
      \"proposal_delay\" : 5000,
      \"vote_delay\" : 100,
      \"load_delay\" : 5000
    }" > ${WORK_DIR}/iroha.conf

    # copy list of peers
    docker cp ${WORK_DIR}/peers.list ${COMPOSE_PROJECT_NAME}_node_1:/
    # copy config
    docker cp ${WORK_DIR}/iroha.conf ${COMPOSE_PROJECT_NAME}_node_1:/

    if [ "$i" -eq 0 ]; then
        # generate genesis block based on list of peers
        docker exec ${COMPOSE_PROJECT_NAME}_node_1 $cli --genesis_block --peers_address /peers.list
        docker cp ${COMPOSE_PROJECT_NAME}_node_1:/opt/iroha_data/genesis.block ${WORK_DIR}/
        docker cp ${COMPOSE_PROJECT_NAME}_node_1:/opt/iroha_data/admin@test.priv ${WORK_DIR}/
        docker cp ${COMPOSE_PROJECT_NAME}_node_1:/opt/iroha_data/admin@test.pub ${WORK_DIR}/
        docker cp ${COMPOSE_PROJECT_NAME}_node_1:/opt/iroha_data/test@test.priv ${WORK_DIR}/
        docker cp ${COMPOSE_PROJECT_NAME}_node_1:/opt/iroha_data/test@test.pub ${WORK_DIR}/
        for j in $(seq 0 ${COUNT})
        do
            docker cp ${COMPOSE_PROJECT_NAME}_node_1:/opt/iroha_data/node${j}.priv ${WORK_DIR}/
            docker cp ${COMPOSE_PROJECT_NAME}_node_1:/opt/iroha_data/node${j}.pub ${WORK_DIR}/
        done
    else
        docker cp ${WORK_DIR}/genesis.block ${COMPOSE_PROJECT_NAME}_node_1:/opt/iroha_data/
        #docker cp ${WORK_DIR}/admin@test.priv ${COMPOSE_PROJECT_NAME}_node_1:/opt/iroha_data/
        docker cp ${WORK_DIR}/admin@test.pub ${COMPOSE_PROJECT_NAME}_node_1:/opt/iroha_data/
        docker cp ${WORK_DIR}/node${i}.priv ${COMPOSE_PROJECT_NAME}_node_1:/opt/iroha_data/
        #docker cp ${WORK_DIR}/node${i}.pub ${COMPOSE_PROJECT_NAME}_node_1:/opt/iroha_data/
        for j in $(seq 0 ${COUNT})
        do
            #docker cp ${WORK_DIR}/node${j}.priv ${COMPOSE_PROJECT_NAME}_node_1:/opt/iroha_data/
            docker cp ${WORK_DIR}/node${j}.pub ${COMPOSE_PROJECT_NAME}_node_1:/opt/iroha_data/
        done
    fi

    # run irohad with output redirection to iroha.log, wait postgres port listen.
    sleep 5
    docker exec -d ${COMPOSE_PROJECT_NAME}_node_1 /bin/bash -c "$irohad --config /iroha.conf --genesis_block /opt/iroha_data/genesis.block --keypair_name node${i} > /iroha.log"
    sleep 1
    docker exec ${COMPOSE_PROJECT_NAME}_node_1 tail /iroha.log

    ((i++))
done < <(docker-machine ls -f "{{.Name}}")


# cleanup
mv ${WORK_DIR}/peers.list ${WORK_DIR}/peers.list.bk
mv ${WORK_DIR}/iroha.conf ${WORK_DIR}/iroha.conf.bk
