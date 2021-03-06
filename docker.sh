#!/usr/bin/env bash
set -e
CURRENT=$(cd $(dirname ${BASH_SOURCE}) && pwd)

function down() {
	node -e "require('./dockerode-bootstrap').down()"
}
function up() {
	prepareNetwork
	node app/testChannel
	node app/crossCCInstall
	node app/crossCCInvoke
}

function prepareNetwork() {
	node -e "require('./dockerode-bootstrap').up()"
}

function restart() {
	down
	up
}

if [ -z "$1" ]; then
	restart
else
	$1
fi
