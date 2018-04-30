const helper = require('../app/helper');
exports.invokeAsync= (channel, richPeers, { chaincodeId, fcn, args }, client = channel._clientContext) => {
	const txId = client.newTransactionID();

	const request = {
		chaincodeId,
		fcn,
		args,
		txId,
		targets: richPeers //optional: use channel.getPeers() as default
	};
	return channel.sendTransactionProposal(request).
	then(([responses, proposal])=>{
		return channel.sendTransaction({
			proposalResponses: responses, proposal,
		})
	})
};
exports.invokeProposal= (channel, richPeers, { chaincodeId, fcn, args }, client = channel._clientContext) => {
	const txId = client.newTransactionID();

	const request = {
		chaincodeId,
		fcn,
		args,
		txId,
		targets: richPeers //optional: use channel.getPeers() as default
	};
	return channel.sendTransactionProposal(request)
};