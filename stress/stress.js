//query test;
const queryChaincode = require('../app/invoke-chaincode').query;
const { invoke } = require('../app/invoke-chaincode');
const { invokeAsync, invokeProposal } = require('./chaincode');
const channelName = 'delphiChannel';
const chaincodeId = 'stress';
const args = [];
const fcn = '';
const helper = require('../app/helper');

exports.start = (orgName,peerIndex) => helper.getOrgAdmin(orgName).then((client) => {
	const channel = helper.prepareChannel(channelName, client);
	let startTime = new Date().getTime();
	console.log('stack start', new Date().getTime());
	let promise = Promise.resolve();

	let times = 1000;


	/////////


	// promise = promise.then(() => {
	// 	times = 10;
	// 	logger.info('invoke', 'start', times);
	// 	startTime = new Date().getTime();
	// 	const BU0promise = new Promise((resolve) => {
	// 		const peers = helper.newPeers([0], 'BU');
	// 		let _promise = Promise.resolve();
	// 		for (let i = 0; i < times; i++) {
	// 			_promise = _promise.then((result) => {
	// 				return invoke(channel, peers, {chaincodeId, fcn, args});
	// 			});
	// 		}
	// 		_promise.then(() => {
	// 			logger.info('invoke', 'end', (new Date().getTime() - startTime));
	// 			resolve();
	// 		});
	// 	});
	// 	return BU0promise;
	// });

	///////////


	promise = promise.then(() => {
		times = 100;
		console.log('invoke async', 'start',orgName,peerIndex, times);
		const peers = helper.newPeers([peerIndex], orgName);
		startTime = new Date().getTime();
		let _promise = Promise.resolve();
		for (let i = 0; i < times; i++) {
			_promise = _promise.then((result) => {
				return invokeAsync(channel, peers, { chaincodeId, fcn, args });
			});
		}
		_promise.then(() => {
			console.log('invoke async', 'end',orgName,peerIndex, (new Date().getTime() - startTime));
			resolve();
		});
		return _promise;
	});



	// promise = promise.then(() => {
	// 	times = 1000;
	// 	logger.info('query BU1 promise chain', 'start', times);
	// 	startTime = new Date().getTime();
	// 	const BU1promise = new Promise((resolve) => {
	// 		const peers = helper.newPeers([1], 'BU');
	// 		let _promise = Promise.resolve();
	// 		for (let i = 0; i < times; i++) {
	// 			_promise = _promise.then((result) => {
	// 				return queryChaincode(channel, peers, {chaincodeId, fcn, args});
	// 			});
	// 		}
	// 		_promise.then(() => resolve());
	// 	});
	// 	return BU1promise.then(() => {
	// 		logger.info('query BU1 promise chain', 'end', (new Date().getTime() - startTime));

	// 	});
	// });

	// promise = promise.then(() => {
	// 	times = 1000;
	// 	const peers = helper.newPeers([0], 'BU');
	// 	logger.info('query promise chain', 'start', times);
	// 	startTime = new Date().getTime();
	// 	return new Promise((resolve => {
	// 		let _promise = Promise.resolve();

	// 		for (let i = 0; i < times; i++) {
	// 			_promise = _promise.then((result) => {
	// 				return queryChaincode(channel, peers, {chaincodeId, fcn, args});
	// 			});
	// 		}
	// 		_promise.then(() => {
	// 			logger.info('query promise chain', 'end', (new Date().getTime() - startTime));
	// 			resolve();
	// 		});
	// 	}));
	// });






	// promise = promise.then(()=>{
	// 	times =1000;
	// 	logger.info('invoke Proposal', 'start', times);
	// 	startTime = new Date().getTime();

	// 	const BU0promise = new Promise((resolve) => {
	// 		const peers = helper.newPeers([0], 'BU');
	// 		let _promise = Promise.resolve();
	// 		for (let i = 0; i < times; i++) {
	// 			_promise = _promise.then((result) => {
	// 				return invokeProposal(channel, peers, {chaincodeId, fcn, args});
	// 			});
	// 		}
	// 		_promise.then(() => resolve());
	// 	});

	// 	return BU0promise.then(()=>{
	// 		logger.info('invoke Proposal', 'end', (new Date().getTime() - startTime));
	// 	})

	// })

	return promise.then(() => {
		console.log('stack end', new Date().getTime());
	});


});
