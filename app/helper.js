/**
 * Copyright 2017 IBM All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an 'AS IS' BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */
'use strict';

const logger = require('./util/logger').new('Helper');
const path = require('path');
const fs = require('fs-extra');
const globalConfig = require('../config/orgs.json');

const companyConfig = globalConfig;
const orgsConfig = companyConfig.orgs;
const CRYPTO_CONFIG_DIR = companyConfig.docker.volumes.CACRYPTOROOT.dir;
const channelsConfig = companyConfig.channels;
const COMPANY_DOMAIN = companyConfig.domain;
const chaincodeConfig = require('../config/chaincode.json');
const sdkUtils = require('fabric-client/lib/utils');
const nodeConfig = require('./config.json');
const ClientUtil = require('./util/client');
const EventHubUtil = require('./util/eventHub');
const Orderer = require('fabric-client/lib/Orderer');

// set up the client and channel objects for each org
const GPRC_protocol = companyConfig.TLS ? 'grpcs://' : 'grpc://';  // FIXME: assume using TLS
const gen_tls_cacerts = (orgName, peerIndex) => {
	const org_domain = `${orgName}.${COMPANY_DOMAIN}`;// bu.delphi.com
	const peer_hostName_full = `peer${peerIndex}.${org_domain}`;
	const tls_cacerts = `${CRYPTO_CONFIG_DIR}/peerOrganizations/${org_domain}/peers/${peer_hostName_full}/tls/ca.crt`;
	return {org_domain, peer_hostName_full, tls_cacerts};
};
exports.newPeer = ({peerPort, tls_cacerts, peer_hostName_full}) => {
	if (companyConfig.TLS) {
		return require('./util/peer').new({peerPort, tls_cacerts, peer_hostName_full});
	} else {
		return require('./util/peer').new({peerPort, peer_hostName_full});
	}
};

// peerConfig: "portMap": [{	"host": 8051,		"container": 7051},{	"host": 8053,		"container": 7053}]
const preparePeer = (orgName, peerIndex, peerConfig) => {
	const {peer_hostName_full, tls_cacerts} = gen_tls_cacerts(orgName, peerIndex);
	let peerPort;
	let eventHubPort;
	for (const portMapEach of peerConfig.portMap) {
		if (portMapEach.container === 7051) {
			peerPort = portMapEach.host;
		}
		if (portMapEach.container === 7053) {
			eventHubPort = portMapEach.host;
		}
	}
	if (!peerPort) {
		logger.warn(`Could not find port mapped to 7051 for peer host==${peer_hostName_full}`);
		throw new Error(`Could not find port mapped to 7051 for peer host==${peer_hostName_full}`);
	}
	const peer = module.exports.newPeer({peerPort, tls_cacerts, peer_hostName_full});
	//NOTE append more info
	peer.peerConfig = peerConfig;

	peer.peerConfig.eventHub = {
		port: eventHubPort,
		clientPromise: objects.user.admin.select(orgName, ClientUtil.new()),
	};
	peer.peerConfig.orgName = orgName;
	peer.peerConfig.peerIndex = peerIndex;
	return peer;
};

const ordererConfig = companyConfig.orderer;

const OrdererUtil = require('./util/orderer');
/**

 * @param client
 * @param channelName
 * @param isRenew
 */
exports.prepareChannel = (channelName, client, isRenew) => {

	const channelConfig = channelsConfig[channelName];
	const channelname = channelName.toLowerCase();

	if (isRenew) {
		delete client._channels[channelname];
	} else {
		if (client._channels[channelname]) return client._channels[channelname];
	}

	const channel = client.newChannel(channelname);//NOTE throw exception if exist
	const newOrderer = (ordererName, domain, ordererSingleConfig) => {

		const ordererPort = ordererSingleConfig.portHost;
		if (companyConfig.TLS) {
			const orderer_hostName_full = `${ordererName}.${domain}`;
			const tls_cacerts = path.resolve(CRYPTO_CONFIG_DIR,
				'ordererOrganizations', domain, 'orderers', orderer_hostName_full, 'tls', 'ca.crt');
			return OrdererUtil.new({
				ordererPort,
				tls_cacerts,
				orderer_hostName_full
			});
		} else {
			return OrdererUtil.new({ordererPort});
		}

	};
	if (ordererConfig.type === 'kafka') {
		for (const ordererOrgName in ordererConfig.kafka.orgs) {
			const ordererOrgConfig = ordererConfig.kafka.orgs[ordererOrgName];
			for (const ordererName in ordererOrgConfig.orderers) {
				const ordererSingleConfig = ordererOrgConfig.orderers[ordererName];
				const orderer = newOrderer(ordererName, ordererOrgName, ordererSingleConfig);
				channel.addOrderer(orderer);
			}

		}
	} else {
		const orderer = newOrderer(ordererConfig.solo.container_name, COMPANY_DOMAIN, ordererConfig.solo);
		channel.addOrderer(orderer);
	}

	for (const orgName in channelConfig.orgs) {
		const orgConfigInChannel = channelConfig.orgs[orgName];
		for (const peerIndex of orgConfigInChannel.peerIndexes) {
			const peerConfig = orgsConfig[orgName].peers[peerIndex];

			const peer = preparePeer(orgName, peerIndex, peerConfig);
			channel.addPeer(peer);

		}
	}
	channel.eventWaitTime = channelsConfig[channelName].eventWaitTime;
	channel.orgs = channelsConfig[channelName].orgs;
	return channel;
};

const getStateDBCachePath = () => {
//state DB is designed for caching heavy-weight User object,
// client.getUserContext() will first query existence in cache first
	return nodeConfig.stateDBCacheDir;
};

exports.newPeers = (peerIndexes, orgName) => {

// work as a data adapter, containerNames: array --> orgname,peerIndex,peerConfig for each newPeer
	const targets = [];
	// find the peer that match the urls
	for (const index of peerIndexes) {

		const peerConfig = orgsConfig[orgName].peers[index];
		if (!peerConfig) continue;
		const peer = preparePeer(orgName, index, peerConfig);
		targets.push(peer);
	}
	return targets;

};

const bindEventHub = (richPeer, client) => {
	// NOTE newEventHub binds to clientContext, eventhub error { Error: event message must be properly signed by an identity from the same organization as the peer: [failed deserializing event creator: [Expected MSP ID PMMSP, received BUMSP]]

	const eventHubPort = richPeer.peerConfig.eventHub.port;
	const pem = richPeer.pem;
	const peer_hostName_full = richPeer._options['grpc.ssl_target_name_override'];
	return EventHubUtil.new(client, {eventHubPort, pem, peer_hostName_full});

};
/**
 * NOTE just static getter
 * @param orgName
 */
const getMspID = (orgName) => {

	const mspid = orgsConfig[orgName].MSP.id;
	return mspid;
};
//NOTE have to do this since filename for private Key file would be as : a4fbafa51de1161a2f82ffa80cf1c34308482c33a9dcd4d150183183d0a3e0c6_sk
const getKeyFilesInDir = (dir) => {
	const files = fs.readdirSync(dir);
	return files.filter((fileName) => fileName.endsWith('_sk')).map((fileName) => path.resolve(dir, fileName));
};

const rawAdminUsername = globalConfig.cryptogenSkip ? 'admin' : 'Admin';
const objects = {};

objects.user = {
	tlsCreate: (tlsDir, username, orgName, mspid = getMspID(orgName), skipPersistence = false, client) => {
		const privateKey = path.join(tlsDir, 'server.key');
		const signedCert = path.join(tlsDir, 'server.crt');
		const createUserOpt = {
			username: formatUsername(username, orgName),
			mspid,
			cryptoContent: {privateKey, signedCert},
			skipPersistence,
		};
		if (skipPersistence) {
			return client.createUser(createUserOpt);
		} else {
			return sdkUtils.newKeyValueStore({
				path: getStateDBCachePath(orgName),
			}).then((store) => {
				client.setStateStore(store);
				return client.createUser(createUserOpt);
			});
		}
	},
	mspCreate: (client,
				{keystoreDir, signcertFile, username, orgName, mspid = getMspID(orgName), skipPersistence = false}) => {
		const keyFile = getKeyFilesInDir(keystoreDir)[0];
		// NOTE:(jsdoc) This allows applications to use pre-existing crypto materials (private keys and certificates) to construct user objects with signing capabilities
		// NOTE In client.createUser option, two types of cryptoContent is supported:
		// 1. cryptoContent: {		privateKey: keyFilePath,signedCert: certFilePath}
		// 2. cryptoContent: {		privateKeyPEM: keyFileContent,signedCertPEM: certFileContent}

		const createUserOpt = {
			username,
			mspid,
			cryptoContent: {privateKey: keyFile, signedCert: signcertFile},
			skipPersistence,
		};
		if (skipPersistence) {
			return client.createUser(createUserOpt);
		} else {
			return sdkUtils.newKeyValueStore({
				path: getStateDBCachePath(orgName),
			}).then((store) => {
				client.setStateStore(store);
				return client.createUser(createUserOpt);
			});
		}
	},
	/**
	 * search in stateStore first, if not exist, then query state db to get cached user object
	 * @param username
	 * @param orgName
	 * @param client
	 * @return {Promise.<TResult>}
	 */
	get: (username, orgName, client) => {
		const newKVS = () => sdkUtils.newKeyValueStore({
			path: getStateDBCachePath(orgName),
		}).then((store) => {
			client.setStateStore(store);
			return client.getUserContext(formatUsername(username, orgName), true);
		});
		if (client.getStateStore()) {
			return client.loadUserFromStateStore(formatUsername(username, orgName)).then(user => {
				if (user) return user;
				return newKVS();
			});
		} else {
			return newKVS();
		}
	},
	createIfNotExist: (keystoreDir, signcertFile, username, orgName, client) =>
		objects.user.get(username, orgName, client).then(user => {
			if (user) return client.setUserContext(user, false);
			return objects.user.mspCreate(client, {
				keystoreDir, signcertFile,
				username: formatUsername(username, orgName)
				, orgName
			});
		}),
	select: (keystoreDir, signcertFile, username, orgName) => {
		const client = ClientUtil.new();
		return objects.user.createIfNotExist(keystoreDir, signcertFile, username, orgName, client);
	},

};
exports.formatPeerName = (peerName, orgName) => `${peerName}.${orgName}.${COMPANY_DOMAIN}`;
const formatUsername = (username, orgName) => `${username}@${orgName}.${COMPANY_DOMAIN}`;
objects.user.admin = {
	orderer: {
		select: (ordererContainerName = 'ordererContainerName') => {

			const ordererUser_name_full = `${rawAdminUsername}@${COMPANY_DOMAIN}`;
			const keystoreDir = path.join(CRYPTO_CONFIG_DIR,
				'ordererOrganizations', COMPANY_DOMAIN, 'users', ordererUser_name_full, 'msp', 'keystore');
			const signcertFile = path.join(CRYPTO_CONFIG_DIR,
				'ordererOrganizations', COMPANY_DOMAIN, 'users', ordererUser_name_full, 'msp', 'signcerts',
				`${ordererUser_name_full}-cert.pem`);
			const ordererMSPID = ordererConfig.MSP.id;
			const client = ClientUtil.new();

			return objects.user.get(ordererUser_name_full, ordererContainerName, client).then(user => {
				if (user) return client.setUserContext(user, false);
				return objects.user.mspCreate(client, {
					keystoreDir, signcertFile,
					username: ordererUser_name_full,
					orgName: COMPANY_DOMAIN,
					mspid: ordererMSPID,
				});
			}).then(() => Promise.resolve(client));
		},
	}
	,
	get: (orgName, client) => objects.user.get(rawAdminUsername, orgName, client),
	create: (orgName, client) => {

		const org_domain = `${orgName}.${COMPANY_DOMAIN}`;// BU.Delphi.com


		const admin_name_full = `${rawAdminUsername}@${org_domain}`;
		const keystoreDir = path.join(CRYPTO_CONFIG_DIR, 'peerOrganizations', org_domain, 'users', admin_name_full,
			'msp', 'keystore');

		const signcertFile = path.join(CRYPTO_CONFIG_DIR,
			'peerOrganizations', org_domain, 'users', admin_name_full, 'msp', 'signcerts',
			`${admin_name_full}-cert.pem`);

		return objects.user.mspCreate(client, {
			keystoreDir, signcertFile,
			username: formatUsername(rawAdminUsername, orgName),
			orgName
		});
	},
	createIfNotExist: (orgName, client) => objects.user.admin.get(orgName, client).then(user => {
		if (user) return client.setUserContext(user, false);
		return objects.user.admin.create(orgName, client);
	}),
	select: (orgName) => {
		const client = ClientUtil.new();
		return objects.user.admin.createIfNotExist(orgName, client).then(() => Promise.resolve(client));
	},
};

// TODO: TypeError: Path must be a string. Received undefined
exports.setGOPATH = () => {
	process.env.GOPATH = chaincodeConfig.GOPATH;
};

exports.chaincodeProposalAdapter = (actionString, validator) => {
	const _validator = validator ? validator : ({response}) => {
		return {isValid: response && response.status === 200, isSwallowed: false};
	};
	return ([responses, proposal, header]) => {

		let errCounter = 0; // NOTE logic: reject only when all bad
		let swallowCounter = 0;
		for (const i in responses) {
			const proposalResponse = responses[i];
			const {isValid, isSwallowed} = _validator(proposalResponse);
			if (isValid) {
				logger.info(`${actionString} was good for [${i}]`, proposalResponse);
				if (isSwallowed) {
					swallowCounter++;
				}
			} else {
				logger.error(`${actionString} was bad for [${i}]`, proposalResponse);
				errCounter++;
			}
		}

		return Promise.resolve({
			errCounter,
			swallowCounter,
			nextRequest: {
				proposalResponses: responses, proposal,
			},
		});

	};
};

exports.globalConfig = globalConfig;
exports.gen_tls_cacerts = gen_tls_cacerts;
exports.preparePeer = preparePeer;
exports.userAction = objects.user;
exports.bindEventHub = bindEventHub;
exports.getOrgAdmin = objects.user.admin.select;
exports.formatUsername = formatUsername;
exports.findKeyfiles = getKeyFilesInDir;