#!/bin/bash

if ! docker ps >/dev/null 2>&1; then
    echo "Dockerd not running, fix that please"
    exit 2
fi

if ! docker-machine >/dev/null 2>&1; then
    echo "docker-machine not found"
    exit 3
fi

IROHA_HOME="$(dirname "${CURDIR}")"
IMAGE="$IROHA_HOME/build/iroha-dev.tar"
PREFIX=peer

if [ ! -f "$IMAGE" ]; then
    echo "docker image(tar) file not found"
#    exit 4
    echo "skip copy and load docker image."
fi
# set up peers where instance-tag 'Name=tag-key,Values=iroha' 'Name=tag-value,Values=peer'
i=0

aws ec2 describe-instances --instance-ids $instance_id --output text --query 'Reservations[*].Instances[*].PrivateIpAddress' --filters 'Name=tag-key,Values=iroha' 'Name=tag-value,Values=peer' | sed -e "s/\t/\n/g" | while read -r nodeip
do
    echo "set up $i : $nodeip"
    docker-machine create --driver generic \
      --generic-ip-address=${nodeip} \
      --generic-ssh-user ubuntu \
      "$PREFIX$i";

    if [ -f "$IMAGE" ]; then
        docker-machine ssh "$PREFIX$i" -n "sudo chmod 777 /mnt"
        docker-machine scp "$IMAGE" "$PREFIX$i":/mnt
        echo "loading image ..."
        docker-machine ssh "$PREFIX$i" -n "sudo docker load -i /mnt/iroha-dev.tar"
    fi

    echo "swarm setup"
    if [ "$i" -eq 0 ]; then
        INVITE=$(docker-machine ssh ${PREFIX}0 -n 'sudo docker swarm init --advertise-addr=${nodeip}' | egrep -o 'docker\sswarm\sjoin\s.*$')
    else
        docker-machine ssh "$PREFIX$i" -n "sudo $INVITE"
        # only for tests, consider ~3 manager nodes in production
        docker-machine ssh ${PREFIX}0 -n "sudo docker node promote $PREFIX$i"
        docker-machine ssh "$PREFIX$i" -n "sudo docker node ls"
    fi

    echo "done $i : $nodeip"
    let i++
done
