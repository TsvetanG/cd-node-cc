/*
Copyright Chaindigit.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

		 http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/
// DO NOT USE IN PRODUCTION

const shim = require('fabric-shim');

//Used to log
var logger = shim.newLogger('nodepdcc');
// The log level can be set by 'CORE_CHAINCODE_LOGGING_SHIM' to CRITICAL, ERROR, WARNING, DEBUG
logger.level = 'debug';

var Chaincode = class {
	async Init(stub) {
		logger.info('ChainCode Initialize');
		let par = stub.getFunctionAndParameters();

		let accountA, accountB;
		let balanceA, balanceB;
		let args = par.params;


		if (args.length === 4) {
			accountA = args[0];
			accountB = args[2];

			logger.info(`Account A = ${accountA} , Account B = ${accountB}`);

			balanceA = parseInt(args[1]);
			if (isNaN(balanceA)) {
				return shim.error('Integer expected' + args[1]);
			}
			balanceB = parseInt(args[3]);
			if (isNaN(balanceB)) {
				return shim.error('Integer expected' + args[3]);
			}

			logger.info(`Account ${accountA} balance  = ${balanceA}, Account ${accountB} balance = ${balanceB}`);

			try {
				//Store the balance of the accounts on the chain and the world state
				await stub.putState(accountA, Buffer.from(balanceA.toString()));
				await stub.putState(accountB, Buffer.from(balanceB.toString()));
				return shim.success();
			} catch (e) {
				return shim.error(e);
			}
		} else {
			return shim.error('Initialization requries 4 parameters [AccountAName, AccountABalance, AccountBName, AccountBBalance]');
		}
	}

	async Invoke(stub) {
		logger.info('ChainCode Invoke');
		let fap = stub.getFunctionAndParameters();
		let func = fap.fcn;
		let args = fap.params;

		logger.info('Invoke function' + func);

		if (func === 'query') {
			return this.query(stub, args);
		}

		if (func === 'move') {
			return this.move(stub, args);
		}

		logger.Errorf(`Unknown action: ${func}`);
		return shim.error(`Unknown action: ${func}`);
	}

	async move(stub, args) {
		logger.info("Initiate balance transfer from host public balance to target account private balance");

		logger.info("Number of parameters: " + args.length);

		if (args.length != 0) {
			return shim.error('Expecting only one parameter');
		}
		//read the trasnfer balance and target account from transient map passed by the client
		//This is needed to hide the details of the trasnaction from any other organization on the same channel
		let transMap = stub.getTransient();

		let collection = transMap.get('collection');//the name of the private data collection
		collection = collection.toString('utf8');
		logger.info("Private collection name: " + collection);

		let transferAmount = transMap.get('amount');//the balance to be trasnferred
		transferAmount = transferAmount.toString('utf8');
		transferAmount = parseInt(transferAmount);
		logger.info("Transfer request balance: " + transferAmount);
		let accountA = transMap.get('fromAccount');//the name of the host account
		accountA = accountA.toString('utf8');
		let accountB = transMap.get('toAccount');//the name of the target account
		accountB = accountB.toString('utf8');

		let targetAccountBalance = await stub.getPrivateData(collection, accountB);
		logger.info("Private data: " + targetAccountBalance);
		if (!targetAccountBalance) {
			targetAccountBalance = parseInt("0");
			logger.info("No private data. Assume zero balance.");
		} else {
			targetAccountBalance = targetAccountBalance.toString('utf8');
			logger.info("Private data available: " + targetAccountBalance);
			if (!targetAccountBalance) {
				targetAccountBalance = '0';
			}

			targetAccountBalance = parseInt(targetAccountBalance);

			logger.info("Private data available: " + targetAccountBalance);
		}

		logger.info("Private balance for account: " + accountB + " balance: " + targetAccountBalance);

		let balanceA = await stub.getState(accountA);
		balanceA = balanceA.toString();
		balanceA = parseInt(balanceA);

		let bal = balanceA - transferAmount;
		logger.info("Host account simulated balance: " + bal);

		let tBal = targetAccountBalance + transferAmount;
		logger.info("Target account private simulated balance: " + tBal);

		await stub.putPrivateData(collection, accountB, Buffer.from(tBal.toString()));
		await stub.putState(accountA, Buffer.from(bal.toString()));
		logger.info("Trasnfer completed!");
		return shim.success(Buffer.from('move succeed'));
	}

	async query(stub, args) {

		let trans = stub.getTransient();
		let collection;
		if (trans != null) {
			collection = trans.get("collection");
			collection = collection.toString('utf8');
		}

		let account = args[0];
		let privateBalance = 'N/A';
		if (args.length === 2) {
			collection = args[1];
		}
		let balance;
		// Get the state from the ledger
		try {
			let balBytes = await stub.getState(account);
			if (!balBytes) {
				return shim.error('Account not found: ' + account);
			}
			balance = balBytes.toString();
		} catch (e) {
			return shim.error('Cannot get state of account: ' + account);
		}

		try {
			if (collection != null) {
				//Read from the private data collection
				let prvBal = await stub.getPrivateData(collection, account);
				privateBalance = prvBal.toString('utf8');
			}
		} catch (e) {

		}

		let jsonResp = {
			Name: account,
			Balance: balance,
			PrivateBalance: privateBalance
		};

		logger.info('Response to query:%s\n', JSON.stringify(jsonResp));

		return shim.success(Buffer.from(JSON.stringify(jsonResp)));
	}

};

//start the chaincode process
shim.start(new Chaincode());