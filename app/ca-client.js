const helper = require('./helper')
const logger = helper.getLogger('ca-test')
const orgName = 'BU'
const caService = helper.getCaService(orgName)
const fs = require('fs')
const fsExtra = require('fs-extra')
const caUtil = require('./util/ca')
const globalConfig = require('../config/orgs.json')
const COMPANY = 'delphi'
const companyConfig = globalConfig[COMPANY]
// caUtil.generateKey(client.getCryptoSuite()).then((result)=>{
const CRYPTO_CONFIG_DIR = companyConfig.docker.volumes.MSPROOT.dir
const COMPANY_DOMAIN = companyConfig.domain
const orgsConfig = companyConfig.orgs
const caConfig = orgsConfig[orgName].ca

const clientUtil = require('./util/client')

const path = require('path')
const client = helper.getClient()
clientUtil.setDefaultCryptoSuite(client)

const enrollAdmin = (orgName) => {
	//this admin is not generated by cryptogen
	const adminName = caConfig.admin.name
	const adminPass = caConfig.admin.pass
	const org_domain = `${orgName}.${COMPANY_DOMAIN}`
	const msp = `${CRYPTO_CONFIG_DIR}peerOrganizations/${org_domain}/users/${helper.formatUsername(adminName,
			orgName)}/msp`
	if (fs.existsSync(msp)) {
		//load from file
		const keystoreDir = path.join(msp, 'keystore')
		const signcertFile = path.join(msp, 'signcerts', `${helper.formatUsername(adminName, orgName)}-cert.pem`)
		const MSPID = orgsConfig[orgName].MSP.id
		return helper.userAction.create(keystoreDir, signcertFile, adminName, orgName, false, MSPID)
	} else {
		return caUtil.enroll(caService, { enrollmentID: adminName, password: adminPass }).then((result) => {
			fsExtra.ensureDirSync(msp)
			caUtil.user.toMSP(result, msp, { username: adminName, domain: org_domain })
			return caUtil.user.build(helper.formatUsername(adminName, orgName), result, orgName).then((user) => {

				return client.setUserContext(user, true)
			})
		})
	}

}

enrollAdmin(orgName).then((adminUser) => {

	const peerName = 'peerF'
	const org_domain = `${orgName}.${COMPANY_DOMAIN}`
	const mspDir = path.join(CRYPTO_CONFIG_DIR, 'peerOrganizations', org_domain, 'peers', helper.formatPeerName(peerName,
			orgName), 'msp')
	fsExtra.ensureDirSync(mspDir)
	const passwordFile = `${mspDir}/pwdFile` // fixme: file with password content security issue
	const affiliation = orgName.toLowerCase()
	return caUtil.peer.register(caService, { peerName, affiliation }, adminUser).then((password) => {
		fs.writeFileSync(passwordFile, password)
		return caUtil.peer.enroll(caService, { peerName, password })
	}).catch(err => {
		if (err.toString().includes('"code":0')) {
			logger.warn(err)
			const password = fs.readFileSync(passwordFile)
			//[[{"code":0,"message":"Identity 'peerF' is already registered"}]]
			return caUtil.peer.enroll(caService, { peerName, password })
		} else {
			return Promise.reject(err)
		}
	}).then((result) => {

		caUtil.peer.toMSP(result, mspDir, { peerName, org_domain })

		return Promise.resolve()
	})

}).catch((err) => {logger.error(err)})

