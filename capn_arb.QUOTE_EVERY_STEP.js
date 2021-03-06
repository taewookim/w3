//////////////////////////////////
// prevent duplicate execution
// https://stackoverflow.com/a/50588744/644566
//////////////////////////////////
const fs = require('fs');
const ini = require('ini');
const utils = require("./util.js");
const Web3 = require('web3');
const logger = require('logger-line-number')
const { ArgumentParser } = require('argparse');
const BigNumber = require('bignumber.js');
const { query_0x } = require('./zero_ex.js');
const { config, tokens } = require('./config.js');
const { wait, parse_web3_tx_error, banner, get_gecko_coin_price_in_usd } = require('./util.js');
const { ERC20 } = require('./erc20.js');



const RECONNECT= {
	"retry_max" 	: 3,
	"sleep_between": 1000
}

class CapnRab{

	constructor(){
		
		return (async () => {
			this.config 		= config;
			
			////////////////////////////////
			// setup web3/ account
			////////////////////////////////
		    
		   	// for(let i=0;i<RECONNECT.retry_max; i++){
		    	// console.log(`${i} - ${this.config.RPC_URL}`);
		    	this.web3    = new Web3(this.config.RPC_URL, {
					reconnect: {
						auto: true,
						delay: 1000, // ms
						maxAttempts: 5,
						onTimeout: false
					}
				});

		    	// this.web3 = new Web3(new Web3.providers.HttpProvider(this.config.RPC_UR));
		    // 	if(this.web3.eth.net.isListening()){
		    // 		break;
		    // 	}
		    // 	logger.log(`[attempt ${$i}] web3 not connected. trying after ${RECONNECT.sleep_between} ms"`);
		    // 	await wait(RECONNECT.sleep_between);

		    // 	if(i==RECONNECT.retry_max-1){
		    // 		throw new Error(`cannot connect to RPC: ${this.config.RPC_URL}`);
		    // 	}	
		    // }

		    this.account = this.web3.eth.accounts.privateKeyToAccount(
		    	'0x' + process.env.key
		    );
		    
		    
		    await this.web3.eth.accounts.wallet.add(this.account);
		    // console.log("r");
		    
		    const accounts  = await this.web3.eth.getAccounts();

		    // console.log(accounts);
		    // console.log("e");
		    this.web3.eth.defaultAccount = this.account.address;
		    
		    this.web3.eth.handleRevert = true;

			////////////////////////////////
			// setup smart contract - capn_rab
			////////////////////////////////
			
			// const ABI_CAPNRAB		= utils.read_json('./includes/abi_capnrab.json');
			// this.ADDRESS_CAPNRAB 	= this.config.CAPN_RAB;

			// this.CONTRACT_CAPNRAB 	= new this.web3.eth.Contract(
			// 	ABI_CAPNRAB, 
			// 	this.ADDRESS_CAPNRAB
			// );

		    ////////////////////////////////
			// setup smart contract - balance_oracle
			// for querying wallet
			// 
			// https://github.com/wbobeirne/eth-balance-checker
			////////////////////////////////

			const ABI_BALANCE_ORACLE		= utils.read_json('./includes/BalanceChecker.abi.json');
			const ADDRESS_BALANCE_ORACLE 	= this.config.BALANCE_ORACLE;
			this.CONTRACT_BALANCE_ORACLE 	= new this.web3.eth.Contract(
				ABI_BALANCE_ORACLE, 
				ADDRESS_BALANCE_ORACLE
			);

		    this.ADDRESS_0x  		= this.config.ALLOWANCE_TARGET_0X;
		    this.tokens				= tokens;
		    this.erc20 				= new ERC20(this.web3, this.account.address);

		    return this;
		})();
	}

	async get_gas_price(){
		const gas_in_wei = await this.web3.eth.getGasPrice();
		return gas_in_wei;

		// https://ethereum.stackexchange.com/questions/64530/web3-eth-getgasprice-always-return-1gwei
		// const data = contract.methods.transfer(
		// 	_receiver_address, 
		// 	web3.utils.toWei(amount, 'ether')
		// ).encodeAbi()

	}


	async bulk_approve(){
		const tokens = await this.get_tokens();

		const multiplier = Math.ceil(tokens.addresses.length / 2.0);
		// console.log(`tokens: ${tokens.addresses.length} | multiplier: ${multiplier}`);

		const send_params = await this.get_send_params({
			"multiply_gas" : multiplier
		});

	    const status = await this.CONTRACT_CAPNRAB.methods.bulk_approve(
	        tokens["addresses"],
	        this.ADDRESS_0x
	    ).send(send_params);

	    return status;
	}


	//////////////////////////////////////////////////////
	// BSC costs about 5 cents USD to approve 1 erc20
	//////////////////////////////////////////////////////
	
	async bulk_approve_wallet(){
				
		const send_params = await this.get_send_params({
			"multiply_gas" 			: 0.60
		});

		const tokens = await this.get_tokens();
		
		let allowance = []

		for (let i=0; i< tokens["symbols"].length; i++){
			
			const token 	= {
				"symbol" 	: tokens["symbols"][i],
				"address" 	: tokens["addresses"][i]
			}

			const allowed = await this.erc20.get_allowance({
				token 		: token, 
				spender 	: this.ADDRESS_0x
			});


			const do_approval = (allowed==0) ? "???? approving" : "???? not needed";
			console.log(`token: ${token["symbol"]} | ${do_approval} | allowance: ${allowed}`);

			if(allowed == 0){
				await this.erc20.set_allowance({
					"token" 		: token, 
					"spender" 		: this.ADDRESS_0x,
					"send_params" 	: send_params
				});
			}
		}

		

	    // const status = await this.CONTRACT_CAPNRAB.methods.bulk_approve(
	    //     tokens["addresses"],
	    //     this.ADDRESS_0x
	    // ).send(send_params);

	    // const weth = new web3.eth.Contract(WETH_ABI, argv.weth);



	    // return status;
	}



	async get_allowance(options={"human_digits" : false, "non_zero_only": false}){

		const tokens = await this.get_tokens(options);

	    const allowance = await this.CONTRACT_CAPNRAB.methods.get_combined_allowance(
	        tokens["addresses"],
	        this.ADDRESS_0x
	    ).call({"from" : this.account.address});

	    
	    return this.tokens.format_token_numbers(
	        tokens["symbols"],
	        allowance,
	        options
	    );
	}


	async get_tokens(options, include_eth=true){

		const token_addresses 	= this.tokens.get_tokens(options);
		const token_symbols 	= this.tokens.get_tokens({"symbols" : true});

		if(include_eth){
			///////////////////////////////////////////
			// this if using BalanceOracle.sol
			///////////////////////////////////////////
			// token_addresses.push("0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE");
			
			///////////////////////////////////////////
			// we use 0x0 b/c using smart contract
			// balance check using contracts deployed from
			// https://github.com/wbobeirne/eth-balance-checker
			///////////////////////////////////////////
			token_addresses.push("0x0000000000000000000000000000000000000000");
			token_symbols.push(this.config.NATIVE_COIN);
		}
		
		return {
			"addresses" : token_addresses,
			"symbols"	: token_symbols
		};

	}

	async get_balance(options={"human_digits" : false, "non_zero_only": false}){

		const tokens = await this.get_tokens(options);

	    const balance = await this.CONTRACT_CAPNRAB.methods.get_combined_balance(
	        tokens["addresses"]
	    ).call({
	    	"from" : this.account.address
	   	});

	    return this.tokens.format_token_numbers(
	        tokens["symbols"],
	        balance,
	        options
	    );

	}


	async get_allowance_wallet(options={"human_digits" : false, "non_zero_only": false}){

		const tokens = await this.get_tokens(options);
		

		let allowance = []

		for (let i=0; i< tokens["symbols"].length; i++){
			
			const token 	= {
				"symbol" 	: tokens["symbols"][i],
				"address" 	: tokens["addresses"][i]
			}

			const allowed = await this.erc20.get_allowance({
				token 		: token, 
				spender 	: this.ADDRESS_0x
			});

			console.log(`[erc20_query] token: ${token["symbol"]} | allowance: ${allowed}`)
			allowance.push(allowed);
		}

		console.log("WTF");	

		return this.tokens.format_token_numbers(
	        tokens["symbols"],
	        allowance,
	        options
	    );


		
	    // const allowance = await this.CONTRACT_BALANCE_ORACLE.methods.allowance(
	    //     tokens["addresses"],
	    //     this.account.address,
	    //     this.ADDRESS_0x
	    // ).call({"from" : this.account.address});

	    
	    // return this.tokens.format_token_numbers(
	    //     tokens["symbols"],
	    //     allowance,
	    //     options
	    // );
	}

	async get_balance_wallet(options={
		"human_digits" : false, 
		"non_zero_only": false,
		"print"		   : false
	}){


		const tokens = await this.get_tokens(options);
			

	    const balance = await this.CONTRACT_BALANCE_ORACLE.methods.balances(
	        [this.account.address],
	        tokens["addresses"]
	    ).call({
	    	// "from" : this.account.address
	   	});

	    const balance_formatted = this.tokens.format_token_numbers(
	        tokens["symbols"], 
	        balance,
	        {
	        	"human_digits" : options["human_digits"] || false,
	        	"non_zero_only" : options["non_zero_only"] || false
	        }
	        
	    );

	    const print_string = options["print"] || false;
	    if(print_string){
	    	console.log("*".repeat(50));
			console.log("Balance Wallet:");
			console.log(balance_formatted);
			console.log("*".repeat(50));
	    }

	    return balance_formatted;

	}



	async deposit_eth_to_capn(amount){
		
		const balance = await this.get_balance_wallet({"print": true});


		let enough_balance = false;

		if(this.config.NATIVE_COIN in balance){
			let bal = new BigNumber(balance[this.config.NATIVE_COIN]);
			if(bal.isGreaterThan(amount)){
				enough_balance = true;
			}
		}

		if(!enough_balance){
			throw new Error(`Amount ${amount} exceeds native token balance`);
			return;
		}

		const status = await this.web3.eth.sendTransaction({
            to      : this.ADDRESS_CAPNRAB, 
            from    : this.account, 
            value   : amount,
            gasLimit: 100000
        });

        return status
	}

	async withdraw_eth_from_capn(amount){

		const balance = await this.get_balance({"print": true});

		let enough_balance = false;

		let bal = null;
		if(this.config.NATIVE_COIN in balance){
			bal = new BigNumber(balance[this.config.NATIVE_COIN]);
			if(bal.isGreaterThanOrEqualTo(amount)){
				enough_balance = true;
			}
		}

		if(!enough_balance){
			throw new Error(`Amount ${amount} not enough - balance : ${bal}`);
			return;
		}


		const send_params = await this.get_send_params();
		
		const status = await this.CONTRACT_CAPNRAB.methods.withdraw(
			amount
		).send(
			send_params
		);
		return status;
	}

	async reset_wallet_to_eth(){

		const balance = await this.get_balance_wallet();
		const coins = ["DAI", "USDC"];

		for(let i=0; i<coins.length;i++){
			await this.test_single_swap({
				"sellToken" : coins[i],
				"buyToken"  : "WETH",
				"sellAmount": balance[  coins[i] ]
			});	
		}
	}


	async prep_contract(options={
		"deposit_erc20"  : true,
		// "bulk_approve" : true
	}){


		////////////////////////////////////////////////////////
		// no need to add eth (gas) since gas
		// paid from wallet,
		// await this.deposit_eth_to_capn('100000000000000000');
		////////////////////////////////////////////////////////

		const deposit_erc20 = options["deposit_erc20"] 	|| false;
		const bulk_approve 	= options["bulk_approve"] 	|| false;

		console.log(utils.banner(`[${this.config.CHAIN}] Contract Prep Steps:`));

		const token = JSON.parse(this.config.PREP_CONTRACT);



		if(deposit_erc20){
			const token_amount_eth = this.tokens.get_coin_value_human(
				token["symbol"], token["amount"]
			);
			console.log(`[ CapnRab deposit  ] token: ${token["symbol"]} | amount (eth / gwei): ${token_amount_eth} / ${token["amount"]}`);
		}
		
		if(bulk_approve){
			console.log(`[ CapnRab approval ] infinite to tokens in ${this.config.CHAIN}_coins.json.`);	
		}
		
		if(deposit_erc20 || bulk_approve){
			
			await utils.askQuestion(`Press Ctrl-C to cancel. Enter otherwise:\n`);	
		}
		
		if(deposit_erc20){
			console.log(utils.banner(`Depositing ${token["symbol"]}`));
			await this.deposit_erc20_to_capn(token["symbol"], token["amount"]);

			console.log(utils.banner(`CapbRab balance`));
			console.log(await this.get_balance());
		}

		if(bulk_approve){
			console.log(utils.banner(`Sending bulk approval`));
			await this.bulk_approve();
			
			console.log(utils.banner(`Allowance (owner: CapnRab | spender: ADDRESS_0x)`));	
			console.log(await this.get_allowance());	
		}	
	}

	async get_send_params(options={
		"multiply_gas" 			: null,
		"multiply_gas_price" 	: null
	}){

		////////////////////////////////////////////////////
		// test network = higher gas price
		////////////////////////////////////////////////////

		let gasPrice 		= new BigNumber(await this.get_gas_price());
		if(this.config.CHAIN=="ropsten"){		
			gasPrice = gasPrice.multipliedBy(3);
		}
		const multiply_gas 		= options.multiply_gas || 1;
		const multiply_gas_price= options.multiply_gas_price || 1;
		

		gasPrice = gasPrice.multipliedBy(multiply_gas_price);

		let params =  {
	        from        : this.account.address,
	        gas         : parseInt(100000 * multiply_gas),
	        gasPrice    : gasPrice.toFixed()
	    };

	    logger.log(params);
	    return params;
	}

	async get_erc20(symbol){

		const ABI_ERC20 	= utils.read_json('./includes/abi_erc20.json');
		const erc20_address = this.tokens.get_token_address(symbol)
		return [ABI_ERC20, erc20_address]
	}

	async deposit_erc20_to_capn(symbol, amount){
		
		const balance = await this.get_balance_wallet({"print": true});
		let enough_balance = false;

		if(symbol in balance){
			let bal = new BigNumber(balance[symbol]);
			if(bal.isGreaterThanOrEqualTo(amount)){
				enough_balance = true;
			}
		}

		if(!enough_balance){
			throw new Error(`Amount ${amount} exceeds ERC20 balance`);
			return;
		}

		const [ABI_ERC20, erc20_address] = await this.get_erc20(symbol);
		const send_params = await this.get_send_params();

		const erc20 = new this.web3.eth.Contract(ABI_ERC20, erc20_address);
        
        const status = await erc20.methods.transfer(
            this.ADDRESS_CAPNRAB, 
            amount
        ).send(send_params);

        return status;

	}

	async withdraw_erc20_from_capn(symbol, amount){
		
		const [,erc20_address] = await this.get_erc20(symbol);
		const send_params = await this.get_send_params();

		const status = await this.CONTRACT_CAPNRAB.methods.withdraw_erc20(
            erc20_address,
            amount
        ).send(send_params);
        return status;

	}

	async check_token_validity(num_coins_available_in_liquidity=100000){

		const tokens = await this.tokens.get_tokens({"raw": true});

		// console.log(tokens); return;
		let sellToken = tokens[0];

		let sellAmount = new BigNumber(
			num_coins_available_in_liquidity * Math.pow(10, 18)
		).toFixed();

		for(let i=1;i<tokens.length;i++){

			console.log("*".repeat(60));
			console.log(`Checking : ${tokens[i]["symbol"]} - ${tokens[i]["address"]}`);
			console.log("*".repeat(60));

			const status = await query_0x({
			    "sellToken"   			: tokens[0]["address"], 
			    "buyToken"    			: tokens[i]["address"], 
			    "sellAmount"  			: sellAmount
			});


			// let to_exists = ("to" in status["json"]);

			if(status["error"]){
				console.log(`??? ${status["error"]} | url: ${status["url"]}`);
			}
			else{
				console.log(`??? | url: ${status["url"]}`);
			}

		}
		

	}





	async swap(name, stats=[], min_expected){

		if(stats.length==0){
			logger.debug("No stats");
			return;
		}

		logger.debug(`name: ${name} (${stats.length}) | min_expected: ${min_expected}`)


		//////////////////////////////////////////
		// check balacne and make note in DB
		//////////////////////////////////////////

		const bal_before = await this.get_balance_wallet({
			"human_digits" : true, 
			"non_zero_only": true
		});


		console.log(banner(`Before swaps`));
		logger.log(bal_before);

		//////////////////////////////////////////////////////////////////
		// we have to include this here b/c including up on top causes
		// problems since swap() is called inside microjob threads
		//////////////////////////////////////////////////////////////////

		const { Swap }= require('./db.js');

		let db_record = await Swap.build({ 
            "path"             		: name,          
            "min_expected"     		: min_expected,
            "quotes"				: stats,
            "balance_before_swap"   : bal_before,
        });

        await db_record.save();
		
		/////////////////////////////////////
		// fake swap by just simulating
		/////////////////////////////////////
		// await wait(5000);
		// logger.log(`???? Ending fake swap `);
		// this.lock.clear();


		//////////////////////////////////////////
		// prep the fields for smart contract
		//////////////////////////////////////////
		let swaps = [];
		let gas_combined =0;
		let sellTokens = [];
		let sellAmounts = [];
		let buyTokens= [];
		let spenders=[];
		let swapTargets =[];
		let swapCallDatas =[];
		let msg_values =[];
		let names = [];
		let statuses = [];

		const terminal_coin = stats[0].quote.sellTokenAddress;

		let sum_msg_values = 0;

		logger.log("Sending swaps in sequence");


		let tx_count = await this.web3.eth.getTransactionCount( 
			this.account.address
		);

		// let pending = await this.web3.eth.getTransactionCount( 
		// 	this.account.address, "pending"
		// );

		// let latest = await this.web3.eth.getTransactionCount( 
		// 	this.account.address, "latest"
		// );

		// console.log(tx_count);
		// console.log(pending);
		// console.log(latest);

		let cancel_swap = false;

		for(let i=0;i<stats.length; i++){
			logger.log(`Leg ${i} - ${stats[i].name}`);
			// names.push(			stats[i].name);
			// sellTokens.push(	stats[i].quote.sellTokenAddress );
			// buyTokens.push( 	stats[i].quote.buyTokenAddress );
			// sellAmounts.push(	stats[i].quote.sellAmount);
			// spenders.push( 		stats[i].quote.allowanceTarget );
			// swapTargets.push( 	stats[i].quote.to );
			// swapCallDatas.push( stats[i].quote.data );
			// msg_values.push( 	stats[i].quote.value );

	        // gas_combined += parseInt(stats[i].quote.gas);
	        // sum_msg_values += parseInt(stats[i].quote.value);

	        // const send_params = {
	        //     from 	: this.account.address,
	        //     value 	: stats[i].quote.value,
	        //     gas 	: stats[i].quote.gas,
	        //     gasPrice: stats[i].quote.gasPrice
	        // };

	        const before_tx_balance = await this.get_balance_wallet({
				"human_digits" : false, 
				"non_zero_only": false
			});
    	
    		// logger.log("before_tx_balance");
    		// logger.log(before_tx_balance);
			///////////////////////////////////////////
			// re-query 0x to get proper gas/gasPrice
			////////////////////////////////////////////

			const intended_sellAmount 	= stats[i].quote.sellAmount;
			const intended_buyAmount 	= stats[i].quote.buyAmount;
			
			let sellAmount 				= new BigNumber(intended_sellAmount);
			
			const stb = before_tx_balance[ stats[i].sellToken ];
			logger.log(`token: ${stats[i].sellToken} | intended sellAmount: ${intended_sellAmount} | actual current balance: ${stb}`);
								

			if(sellAmount.isGreaterThan(stb)){
				///////////////////////////////////////
				// we keep 1 gwei in the blockchain
				///////////////////////////////////////
				sellAmount = (new BigNumber(stb)).minus(1);
				logger.log(`reducing sell amount to current balance: ${sellAmount.toFixed()}`)
			}



			//////////////////////////////////
			// make sure sell token has approval
			//////////////////////////////////

			const current_ST = {
				"symbol" 	: stats[i].sellToken,
				"address" 	: stats[i].quote.sellTokenAddress
			};
			
			const allowed = await this.erc20.get_allowance({
				token 		: current_ST, 
				spender 	: this.ADDRESS_0x
			});


			const do_approval = (allowed==0) ? "???? approving" : "???? not needed";
			console.log(`token: ${current_ST["symbol"]} | ${do_approval} | allowance: ${allowed}`);

			if(allowed <= 0){

				const send_params = await this.get_send_params({
					// "multiply_gas" 			: 0.35
				});

				await this.erc20.set_allowance({
					"token" 		: current_ST, 
					"spender" 		: this.ADDRESS_0x,
					"send_params" 	: send_params
				});
			}


			/////////////////////////////////
			// procceed with 0x query
			/////////////////////////////////

			// logger.log(stats[i]);
			const params = {
				"chain"       		: this.config.CHAIN,
				"sellToken"	  		: stats[i].sellToken,
				"buyToken"	  		: stats[i].buyToken,
			    "sellAmount"  		: sellAmount.toFixed(),
			    "takerAddress"		: this.account.address
			};

			// logger.log(params);
			
			let quote = await query_0x(params);
			if(quote.error){
				throw new Error(quote.error);
				return;
			}
			// console.log(quote);
			const buyAmount_without_takerAddress 	= new BigNumber(stats[i].quote.buyAmount);
			const buyAmount_with_takerAddress 		= new BigNumber(quote.json.buyAmount)

			logger.log(`buyAmount w/o takerAddress: ${buyAmount_without_takerAddress.toString()}`);
			logger.log(`buyAmount w/  takerAddress: ${buyAmount_with_takerAddress.toString()} `);


			const buyAmount_diff = buyAmount_without_takerAddress.minus(
				buyAmount_with_takerAddress
			).dividedBy(
				buyAmount_without_takerAddress
			);

			const QUOTE_DIFF_THRESHOLD=0.20;

			logger.log(`buyAmount difference: ${buyAmount_diff.toString()}`)
			
			if(buyAmount_diff.isGreaterThan(QUOTE_DIFF_THRESHOLD)){
				logger.log(`difference ratio: ${buyAmount_diff.toFixed()} |  QUOTE_DIFF_THRESHOLD: ${QUOTE_DIFF_THRESHOLD} | greater, so rolling back`);
				
				////////////////////////////////////////////////////////
				// if first swap, do nothing
				// otherwise, get quote for currnet selltoken and terminal token	
				////////////////////////////////////////////////////////
				
				if(i==0){
					quote = null;
				
				} else {

					const go_back_home_params = {
						"chain"       		: this.config.CHAIN,
						"sellToken"	  		: stats[i].sellToken,
						"buyToken"	  		: this.config.TERMINAL_COIN,
					    "sellAmount"  		: sellAmount.toFixed(),
					    "takerAddress"		: this.account.address
					};

					quote = await query_0x(go_back_home_params);

					if(quote.error){
						throw new Error(quote.error);
						return;
					}
				}


				cancel_swap = true;
			}

			// console.log(stats[i].quote);
			// console.log(quote.json);
			// process.exit(1);

			// const nonce = this.web3.utils.toHex( await this.web3.eth.getTransactionCount( 
			// 	this.account.address ,'pending'
			// ));

	
			if(quote){

				logger.log(`tx_count: ${tx_count}`)


				

				///////////////////////////////////////
				// proceed to swap
				////////////////////////////////////////

				// const v =  quote.json.value;
				const v = Web3.utils.toHex(quote.json.value);

				const direct_swap = {
					"nonce"     : this.web3.utils.toHex(tx_count),
					// "nonce"		: tx_count,
					"from"		: this.account.address,
					"to"		: quote.json.to,
					"data"		: quote.json.data,
					"value"		: v,
					"gasPrice"	: quote.json.gasPrice,
					"gas" 		: quote.json.gas
				};
				
				logger.log("submitting transaction");
				// console.log(direct_swap);

				let receipt = await this.web3.eth.sendTransaction(direct_swap);
				receipt["scanner"] = `${this.config.SCANNER}/tx/${receipt["transactionHash"]}`;
				logger.log(receipt["scanner"]);
				statuses.push(receipt);
				tx_count+=1;

				let after_tx_balance = null;
				
				let waiting_statement_printed = false;
				while(true){

					after_tx_balance = await this.get_balance_wallet({
						"human_digits" : false, 
						"non_zero_only": false
					});

					let bal_before 	= before_tx_balance[ stats[i].buyToken ];
					let bal_after 	= after_tx_balance[ stats[i].buyToken ];
					let bal_chancged= (bal_after!=bal_before);


					logger.log(`buyToken: ${stats[i].buyToken} | bal_before: ${bal_before} | bal_after: ${bal_after} | bal_chancged: ${bal_chancged}`);

					if(bal_chancged){
						logger.log("???? Balance changed. Moving on.")					
						break;
					}

					if(!waiting_statement_printed){
						logger.log("???? Balance not updated. Waiting...")
						waiting_statement_printed = true;	
					}
					process.stdout.write("???")
					await wait(1000);
				}
			}

			if(cancel_swap){
				logger.log(`???? cancelling swap on step ${i}`)
				break;
			}

        }

        if(!cancel_swap){
	    	console.log(banner("???? Success ????"));	
	    }
		
		const bal_after = await this.get_balance_wallet({
			"human_digits" : true, 
			"non_zero_only": true
		});

		
		console.log(banner(`After swaps`));
		logger.log(bal_after);
	
		const gas_price_usd = await get_gecko_coin_price_in_usd(
			this.config.NATIVE_COIN_GECKO_ID
		);

		await db_record.update({
			"balance_after_swap" : bal_after,
			"gas_price_usd"		 : gas_price_usd
		});


	    ///////////////////////////////////////
	    // if transaction is reverting due to 
	    // out of gas error,
	    // increase gas NOT gasPrice
	    ///////////////////////////////////////

		

        // logger.log(send_params);
        
        // let status = {
        // 	"receipt" : null,
        // 	"error" : null
        // };

		///////////////////////////////////////
		// update record after
		///////////////////////////////////////

		// const bal_after = await this.get_balance({
		// 	"human_digits" : true, 
		// 	"non_zero_only": true
		// });

		// if(!status["error"]){
		// 	console.log(banner(`After swaps`));
		// 	logger.log(bal_after);
		// }

		// const gas_price_usd = await get_gecko_coin_price_in_usd(
		// 	this.config.NATIVE_COIN_GECKO_ID
		// );

		// await db_record.update({
		// 	"balance_after_swap" : bal_after,
		// 	"gas_price_usd"		 : gas_price_usd
		// });
    

	    // return status;
	}

	async get_weth_address(){
		const weth_address = await this.CONTRACT_CAPNRAB.methods.get_weth_address().call({
			"from" : this.account.address
		});
		console.log(`weth_address: ${weth_address}`);
		return weth_address;
	}

	async test_single_swap(options={
		"sellToken" : "WETH", "buyToken": "DAI", "sellAmount" : "201077907286800927"
		// "sellToken" : "DAI", "buyToken"	: "USDC","sellAmount" : "6868365176232856098"
	}) {


	    
	    const sellToken = options["sellToken"];
	    const sellTokenAddress = this.tokens.get_token_address(options["sellToken"]);



	    const [erc20_abi, erc20_addr] = await this.get_erc20(sellToken);

	    const erc20 = new this.web3.eth.Contract(erc20_abi, erc20_addr);

		let allowance = await erc20.methods.allowance(
			this.account.address,
			this.ADDRESS_0x
		).call();


	    const buyToken 	= options["buyToken"];
	    const sellAmount = options["sellAmount"];
	    // const sellAmount= (new BigNumber(options["sellAmount"])).multipliedBy(0.5).integerValue().toFixed();


	    logger.log(`sellToken: ${sellToken} | buyToken: ${buyToken} | sellAmount: ${sellAmount}`);
	    // return

	    
	    const swap = {
	    	"sellToken" 		: sellToken, 
	    	"buyToken" 			: buyToken, 
	    	"sellAmount"		: sellAmount,
	    	"takerAddress"		: this.account.address
	   	};

	    const q1 = await query_0x(swap /*, {"debug": true} */);

	    // console.log(q1);
	    // process.exit(1);

	    if(q1.error){
	    	const errs = {
	    		"q1_error" : q1.error
	    	}
	    	console.log(errs);
	    	return;
	    	
	    }

	    logger.log("Submitting transaction...");
	    let receipt = null;
	    try{
	    	

	        // receipt = await this.CONTRACT_CAPNRAB.methods.fillQuote(
	        //     q1.json.sellTokenAddress,
	        //     q1.json.buyTokenAddress,
	        //     q1.json.allowanceTarget,
	        //     q1.json.to,
	        //     q1.json.data
	        // ).send({
	        // 	from: this.account.address,
	        //     value: q1.json.value,
	        //     gasPrice: q1.json.gasPrice,
	        //     gas: 500000
	        // });

			
	        // receipt = await this.CONTRACT_CAPNRAB.methods.multiswap(

	        //     [ q1.json.to ],
	        //     [ q1.json.data ],
	        //     [ q1.json.value ],
	        //     [  "test swap" ],
	        //     [sellTokenAddress],
	        //     [ swap["sellAmount"] ],
	        //     "0"
	        // ).send({
	        // 	from: this.account.address,
	        //     value: q1.json.value,
	        //     gasPrice: q1.json.gasPrice,
	        //     gas: 500000
	        // });

	        // receipt = await this.CONTRACT_CAPNRAB.methods.multiswap(

	        //     [ q1.json.to ],
	        //     [ q1.json.data ],
	        //     [ q1.json.value ],
	        //     [  "test swap" ],
	        //     [sellTokenAddress],
	        //     [ swap["sellAmount"] ],
	        //     "0"
	        // ).send({
	        // 	from: this.account.address,
	        //     value: q1.json.value,
	        //     gasPrice: q1.json.gasPrice,
	        //     gas: 500000
	        // });


	        const direct_swap = {
				"from"		: this.account.address,
				"to"		: q1.json.to,
				"data"		: q1.json.data,
				"value"		: q1.json.value,
				"gasPrice"	: q1.json.gasPrice,
				"gas" 		: q1.json.gas
			};

			// logger.log(direct_swap);
			receipt = await this.web3.eth.sendTransaction(direct_swap);



	        logger.log("SUCCESS - pausing few seconds for blocks to sync");
	        await wait(15 * 1000);

        } catch(error){
        	logger.log("FAIL");
        	console.log(error);
        }finally {
        	if(receipt && "transactionHash" in receipt){
        		logger.log(`${receipt["transactionHash"]} - ${receipt["status"]}`);
	    		logger.log(`${this.config.SCANNER}/tx/${receipt["transactionHash"]}`);	
        	}
        	else{
				logger.log("no receipt")        		
        	}
	    	
	    }

	}


	async test_multi_swap(path) {
	    
	    const sellToken = "DAI";
	    const buyToken = "WETH";
	    const sellAmount='3952047556935788635';

	    const terminal_coin = this.tokens.get_token_address(sellToken);
	    const original_sell_amount = new BigNumber(sellAmount);
		const min_expected = original_sell_amount.multipliedBy(
			this.config.MIN_PROFIT_PCT
		).integerValue().toFixed();

		logger.log(`min_expected: ${min_expected}`);

	    const swap_one = {
	    	"sellToken" 		: sellToken, 
	    	"buyToken" 			: buyToken, 
	    	"sellAmount"		: sellAmount
	   	};

	   	logger.log(swap_one);
	    const q1 = await query_0x(swap_one);

	    // console.log(`q1 buyAmount: ${q1.json.buyAmount}`)

	    ////////////////////////////////////////
	    // decrease next swap by slippage amount
	    // in case of not enough balance issue
	    ////////////////////////////////////////

	    // const q2_sellamount = (new BigNumber(q1.json.buyAmount)).multipliedBy(
	    // 	1-slippagePercentage
	    // ).integerValue().toFixed();

	    const q2_sellamount = q1.json.buyAmount;
		

	    const swap_two = {
	    	"sellToken" 		: swap_one["buyToken"], 
	    	"buyToken" 			: swap_one["sellToken"], 
	    	"sellAmount"		: q2_sellamount
	   	};
	   	logger.log(swap_two);

	    const q2 = await query_0x(swap_two);
		
	    if(q1.error || q2.error){
	    	const errs = {
	    		"q1_error" : q1.error,
	    		"q2_error" : q2.error
	    	}
	    	console.log(errs);
	    	return;
	    	
	    }


	    const names = [ `${sellToken}-${buyToken}`, `${buyToken}-${sellToken}` ];
		const sellTokens = [ q1.json.sellTokenAddress, q2.json.sellTokenAddress ];
		const buyTokens = [ q1.json.buyTokenAddress, q2.json.buyTokenAddress ];
	    const allowanceTargets = [q1.json.allowanceTarget, q2.json.allowanceTarget];
		const swapTargets = [q1.json.to, q2.json.to]
		const swapCallDatas = [q1.json.data, q2.json.data];
		const msg_values = [q1.json.value, q2.json.value];
		const sellAmounts = [q1.json.sellAmount, q2.json.sellAmount];
		

	    let receipt = null;

	    const send_params = {
        	from: this.account.address,
            value: q1.json.value,
            gasPrice: q1.json.gasPrice,
            gas: 1000000
        };

        // logger.log("terminalToken");
        // logger.log(terminalToken);

  		// logger.log("send_params");
		// logger.log(send_params);
		// return;

	    try{
	        // receipt = await this.CONTRACT_CAPNRAB.methods.multiswap(
	        // 	swapTargets,
	        // 	swapCallDatas,
	        // 	msg_values,
	        // 	names,
	        // 	terminal_coin,
	        // 	min_expected
	        // ).send(send_params);

	        receipt = await this.CONTRACT_CAPNRAB.methods.multiswap(
	        	swapTargets,
	        	swapCallDatas,
	        	msg_values,
	        	names,
	        	sellTokens,
	        	sellAmounts,
	        	min_expected
	        ).send(send_params);


	        logger.log("SUCCESS");

	        const url = `${this.config.SCANNER}/tx/${receipt["transactionHash"]}`;
	        logger.log(url);

        } catch(err){
        	// console.log(error);
        	logger.log("*".repeat(60));
        	logger.log("FAIL");
        	logger.log(err);
        	logger.log("*".repeat(60));

	        const error = await parse_web3_tx_error(err, this.config.SCANNER);
	        logger.log(error);
        }

	}

}


let da_capn = null;

async function get_capn_instance(params={"force_new" : false}){

	const instantiate_new = params["force_new"] || false;
	
	if(!da_capn || instantiate_new){
		da_capn = await new CapnRab();
	}
	return da_capn;
}


////////////////////////////////////////////////////////////////////////////
//	  ____                                          _   _     _            
//	 / ___|___  _ __ ___  _ __ ___   __ _ _ __   __| | | |   (_)_ __   ___ 
//	| |   / _ \| '_ ` _ \| '_ ` _ \ / _` | '_ \ / _` | | |   | | '_ \ / _ \
//	| |__| (_) | | | | | | | | | | | (_| | | | | (_| | | |___| | | | |  __/
//	 \____\___/|_| |_| |_|_| |_| |_|\__,_|_| |_|\__,_| |_____|_|_| |_|\___|
//	                                                                       
//	    _                                         _       
//	   / \   _ __ __ _ _   _ _ __ ___   ___ _ __ | |_ ___ 
//	  / _ \ | '__/ _` | | | | '_ ` _ \ / _ \ '_ \| __/ __|
//	 / ___ \| | | (_| | |_| | | | | | |  __/ | | | |_\__ \
//	/_/   \_\_|  \__, |\__,_|_| |_| |_|\___|_| |_|\__|___/
//	             |___/                                    
//
////////////////////////////////////////////////////////////////////////////


async function main(){
	
    const parser = new ArgumentParser({
      description: 'Argparse example'
    });
     

    parser.add_argument(
        '-al', '--allowance' , 
        {help: "Check allowance of CapnRab", required: false, action: "store_true" }
    );

    parser.add_argument(
        '-alw', '--allowance_wallet' , 
        {help: "Check allowance of wallet", required: false, action: "store_true" }
    );


    parser.add_argument(
        '-balw', '--balance_wallet', 
        {help: "Check balance of wallet", required: false, action: "store_true"}
    );

    parser.add_argument(
        '-bal', '--balance', 
        {help: "Check balance of CapnRab", required: false, action: "store_true"}
    );
    
    parser.add_argument(
        '-hd', '--human_digits', 
        {help: "Human readable balance / allowance", required: false, action: "store_true"}
    );

    parser.add_argument(
        '-nzo', '--non_zero_only', 
        {help: "Non zero balance / allowance", required: false, action: "store_true"}
    );

    parser.add_argument(
        '-w', '--withdraw', 
        {help: "Withdraw", required: false, action: "store"}
    );

    parser.add_argument(
        '-we', '--withdraw_erc20', 
        {help: "Withdraw", required: false, action: "store"}
    );

    parser.add_argument(
        '-ts', '--test_single_swap', 
        {help: "Test single  swap", required: false, action: "store_true"}
    );

    parser.add_argument(
        '-wea', '--withdraw_erc20_amount', 
        {help: "Withdraw", required: false, action: "store"}
    );


    parser.add_argument(
        '-d', '--deposit', 
        {help: "Deposit ETH", required: false, action: "store"}
    );

    parser.add_argument(
        '-de', '--deposit_erc20', 
        {help: "Deposite ERC20", required: false, action: "store"}
    );

    parser.add_argument(
        '-ba', '--bulk_approve', 
        {help: "Bulk approve", required: false, action: "store_true"}
    );

    parser.add_argument(
        '-baw', '--bulk_approve_wallet', 
        {help: "Bulk approve wallet", required: false, action: "store_true"}
    );


    parser.add_argument(
        '-dea', '--deposit_erc20_amount', 
        {help: "Deposit ERC20", required: false, action: "store"}
    );

    parser.add_argument(
        '-oc', '--owner_call', 
        {help: "Owner call", required: false, action: "store_true"}
    );


    parser.add_argument(
        '-ptc', '--prep_contract', 
        {help: "Deposit eth, weth, bulk_approve", required: false, action: "store_true"}
    );

    parser.add_argument(
        '-gwe', '--get_weth_address', 
        {help: "Get weth address", required: false, action: "store_true"}
    );



    parser.add_argument(
        '-gp', '--gas_price', 
        {help: "Gas Price", required: false, action: "store_true"}
    );

    parser.add_argument(
        '-rw', '--reset_wallet_to_eth', 
        {help: "Reset wallet (sell all ERC20 for eth)", required: false, action: "store_true"}
    );


    parser.add_argument(
        '-ctv', '--check_token_validity', 
        {help: "Check token validity", required: false, action: "store_true"}
    );



    const args = parser.parse_args()

    const capn = await new CapnRab();



    const lance_args = {
        "non_zero_only" : args.non_zero_only || false,
        "human_digits"  : args.human_digits|| false
    }
    
    if(args.allowance){
    	console.log(banner(`[${capn.config.CHAIN}] Capn allowance:`))
        console.log(await capn.get_allowance(lance_args));
    }

    else if(args.balance){
    	console.log(banner(`[${capn.config.CHAIN}] Capn Balance:`))
        console.log(await capn.get_balance(lance_args));
    }

    else if(args.allowance_wallet){
    	console.log(banner(`[${capn.config.CHAIN}] Wallet Allowance:`))
        console.log(await capn.get_allowance_wallet(lance_args));
    }

    else if(args.balance_wallet){
    	console.log(banner(`[${capn.config.CHAIN}] Wallet Balance:`))
        console.log(await capn.get_balance_wallet(lance_args));
    }

    else if(args.bulk_approve){
    	console.log(banner(`[${capn.config.CHAIN}] Bulk Approve:`))
        console.log(await capn.bulk_approve());
    }
    
    else if(args.bulk_approve_wallet){
    	console.log(banner(`[${capn.config.CHAIN}] Bulk Approve Wallet:`))
        console.log(await capn.bulk_approve_wallet());
    }

    else if(args.get_weth_address){
        console.log(await capn.get_weth_address());
    }

    else if(args.deposit){
    	console.log(banner(`[${capn.config.CHAIN}] Deposit:`))
        const amount = args.deposit;
        console.log(`Deposit ETH : ${amount}`);
        
        console.log(await capn.deposit_eth_to_capn(amount))
    }

    else if(args.deposit_test){
        const amount = args.deposit;
        console.log(`Deposit ETH : ${amount}`);
        
        console.log(await capn.deposit_eth_to_capn(amount))
    }


    else if(args.deposit_erc20){
    	console.log(banner(`[${capn.config.CHAIN}] Deposit ERC20:`))
        const token = args.deposit_erc20;
        const amount = args.deposit_erc20_amount;
        console.log(`Deposit ERC20 :  ${token} | ${amount}`);

        console.log(await capn.deposit_erc20_to_capn(token, amount));
    }

    else if(args.withdraw){
    	console.log(banner(`[${capn.config.CHAIN}] Withdraw:`))

        const amount = args.withdraw;
        console.log(`Withdraw ETH : ${amount}`);
        
        if(amount=="all"){
        	const balance = await capn.get_balance({"non_zero_only": true});


        	const tokens = Object.keys(balance);

        	const eth_tokens = ["ETH", "FTM"];
        	for(let t=0; t<tokens.length;t++){

        		const token = tokens[t];
        		const token_amount = balance[token];

        		console.log(`withdraw: ${token} | amount: ${token_amount}`);

        		if( eth_tokens.includes(token) ){
        			// console.log(`[ETH withdraw]: native | ${token_amount}`);
        			const withdraw_eth = await capn.withdraw_eth_from_capn(token_amount);
        			console.log(withdraw_eth);
        		}else{
        			// console.log(`[ERC withdraw] token: ${token} | amount: ${token_amount}`);
        			const erc_withdrawn = await capn.withdraw_erc20_from_capn(token, token_amount);
        			console.log(erc_withdrawn);
        		}
        	}
        }
        else{

        	const eth_withdrawn = await capn.withdraw_eth_from_capn(amount);
			console.log("[ETH withdraw]: ");
			console.log(eth_withdrawn);
        }
     	   
    }

    else if(args.withdraw_erc20){

    	console.log(banner(`[${capn.config.CHAIN}] Withdraw ERC20:`))

        const token = args.withdraw_erc20;
        const amount = args.withdraw_erc20_amount;
        console.log(`Withdraw ERC20 :  ${token} | ${amount}`);

        console.log(await capn.withdraw_erc20_from_capn(token, amount));
    }
    else if(args.check_token_validity){
        console.log(await capn.check_token_validity());
    }

    else if(args.gas_price){
    	console.log(banner(`[${capn.config.CHAIN}] Gas Price:`))

    	const gp = await capn.get_gas_price();
        console.log(`Gas Price: ${gp}`);
    }

    else if(args.prep_contract){
    	await capn.prep_contract()
    }

    else if(args.reset_wallet_to_eth){
    	await capn.reset_wallet_to_eth()
    }

    else if(args.test_single_swap){
    	console.log(banner(`[${capn.config.CHAIN}] TEst Single Swap:`))
        console.log(await capn.test_single_swap());
    }

    else {
    	console.log(banner(`[${capn.config.CHAIN}] Test Multi Swap:`))
        console.log(await capn.test_multi_swap());
    }
    
    // console.log(get_coin_value_wei("DAI", 1));
}


//////////////////////////////////////////////////////////////////
// node.js equivalent of python's if __name__ == '__main__'
//
// https://stackoverflow.com/questions/4981891/node-js-equivalent-of-pythons-if-name-main
//
//////////////////////////////////////////////////////////////////
(async () => {

	if (typeof module !== 'undefined' && !module.parent) {
		await main();
	}
})();


module.exports={
	get_capn_instance
}