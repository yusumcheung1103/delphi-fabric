const config = require('./config');
const swarmBaseUrl = `${config.swarmServer.url}:${config.swarmServer.port}`;
const Request = require('request');
const logger = require('../../common/nodejs/logger').new('api caller');
const serverClient = require('../../common/nodejs/express/serverClient');
const {errHandler} = serverClient;
const {ConfigFactory}= require('../../common/nodejs/configtxlator');
exports.globalConfig = () => new Promise((resolve, reject) => {
	Request.get(`${swarmBaseUrl}/config/orgs`, errHandler(resolve, reject, true));
});
exports.touch = () => new Promise((resolve, reject) => {
	Request.get(swarmBaseUrl, errHandler(resolve, reject));
});
exports.leader = () => serverClient.leader.info(swarmBaseUrl);

exports.block = (filePath) => serverClient.block(swarmBaseUrl, filePath);
exports.newOrg = async (cryptoPath, nodeType, channelName, orgName) => {
	let orgConfig;
	const {msp} = cryptoPath.OrgFile(nodeType);
	const admins = [msp.admincerts];
	const root_certs = [msp.cacerts];
	const tls_root_certs = [msp.tlscacerts];

	if (nodeType === 'orderer') {
		orgConfig = config.orderer.orgs[orgName];
	} else {
		orgConfig = config.orgs[orgName];
	}
	const MSPID = orgConfig.MSP.id;
	const MSPName = orgConfig.MSP.name;

	const respNewOrg = await serverClient.newOrg(swarmBaseUrl, channelName, MSPID, MSPName, nodeType, {
		admins,
		root_certs,
		tls_root_certs
	});
	const newConfig = new ConfigFactory(respNewOrg);
	logger.debug('/newOrg',newConfig.getOrg(MSPName,nodeType));
};
exports.newOrderer = (ordererHostName) => {
	const address = `${ordererHostName}:7050`;

	return new Promise((resolve, reject) => {
		const form = {
			address
		};
		Request.post({url: `${swarmBaseUrl}/channel/newOrderer`, form}, errHandler(resolve, reject));
	});
};