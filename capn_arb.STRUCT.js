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

const { TokenParser } = require('./tokens.js');
const { query_0x } = require('./zero_ex.js');
const { config } = require('./config.js');
const { wait } = require('./util.js');

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
		    
		   	for(let i=0;i<RECONNECT.retry_max; i++){
		    
		    	this.web3    = new Web3(process.env.rpc_url);

		    	if(this.web3.eth.net.isListening()){
		    		break;
		    	}
		    	logger.log(`[attempt ${$i}] web3 not connected. trying after ${RECONNECT.sleep_between} ms"`);
		    	await wait(RECONNECT.sleep_between);

		    	if(i==RECONNECT.retry_max-1){
		    		throw new Error(`cannot connect to RPC: ${process.env.rpc_url}`);
		    	}	
		    }

		    this.account = this.web3.eth.accounts.privateKeyToAccount(
		    	'0x' + process.env.key
		    );
		    
		    
		    await this.web3.eth.accounts.wallet.add(this.account);
		    // console.log("r");
		    
		    const accounts  = await this.web3.eth.getAccounts();

		    // console.log(accounts);
		    // console.log("e");
		    this.web3.eth.defaultAccount = this.account.address;
		    
			////////////////////////////////
			// setup smart contract - capn_rab
			////////////////////////////////
			
		    const ABI_CAPNRAB		= utils.read_json('./includes/abi_capnrab.json');
			this.ADDRESS_CAPNRAB 	= this.config.CAPN_RAB;

		    this.CONTRACT_CAPNRAB 	= new this.web3.eth.Contract(
		        ABI_CAPNRAB, 
		        this.ADDRESS_CAPNRAB
		    );

		    ////////////////////////////////
			// setup smart contract - balance_oracle
			// for querying wallet
			////////////////////////////////

			const ABI_BALANCE_ORACLE		= utils.read_json('./includes/abi_balanceoracle.json');
			const ADDRESS_BALANCE_ORACLE 	= this.config.BALANCE_ORACLE;
		    this.CONTRACT_BALANCE_ORACLE 	= new this.web3.eth.Contract(
		        ABI_BALANCE_ORACLE, 
		        ADDRESS_BALANCE_ORACLE
		    );

		    this.ADDRESS_0x  		=  this.config.ALLOWANCE_TARGET_0X;

		    this.tokens				= new TokenParser(`./includes/${this.config.CHAIN}_coins.json`);
		    return this;
		})();
	}

	async get_gas_price(){
		await this.web3.eth.getGasPrice();
	}


	async bulk_approve(){

	    const status = await this.CONTRACT_CAPNRAB.methods.bulk_approve(
	        this.tokens.get_tokens(),
	        this.ADDRESS_0x
	    ).send({
	        from        : this.account.address,
	        gas         : 1000000,
	        gasPrice    : await this.get_gas_price()
	    });

	    return status;
	}


	async get_allowance(options={"human_digits" : false, "non_zero_only": false}){


	    const allowance = await this.CONTRACT_CAPNRAB.methods.get_combined_allowance(
	        this.tokens.get_tokens(options),
	        this.ADDRESS_0x
	    ).call({"from" : this.account.address});

	    
	    return this.tokens.format_token_numbers(
	        this.tokens.get_tokens({"symbols" : true}),
	        allowance,
	        options
	    );
	}



	async get_balance(options={"human_digits" : false, "non_zero_only": false}){


	    const balance = await this.CONTRACT_CAPNRAB.methods.get_combined_balance(
	        this.tokens.get_tokens()
	    ).call({
	    	"from" : this.account.address
	   	});

	    return this.tokens.format_token_numbers(
	        this.tokens.get_tokens({"symbols" : true}),
	        balance,
	        options
	    );

	}





	async get_allowance_wallet(options={"human_digits" : false, "non_zero_only": false}){


	    const allowance = await this.CONTRACT_BALANCE_ORACLE.methods.get_combined_allowance(
	        this.tokens.get_tokens(options),
	        this.account.address,
	        this.ADDRESS_0x
	    ).call({"from" : this.account.address});

	    
	    return this.tokens.format_token_numbers(
	        this.tokens.get_tokens({"symbols" : true}),
	        allowance,
	        options
	    );
	}

	async get_balance_wallet(options={"human_digits" : false, "non_zero_only": false}){

	    const balance = await this.CONTRACT_BALANCE_ORACLE.methods.get_combined_balance(
	        this.tokens.get_tokens(),
	        this.account.address
	    ).call({
	    	"from" : this.account.address
	   	});

	    return this.tokens.format_token_numbers(
	        this.tokens.get_tokens({"symbols" : true}),
	        balance,
	        options
	    );

	}



	async deposit_eth_to_capn(amount){
		const status = await this.web3.eth.sendTransaction({
            to      : this.ADDRESS_CAPNRAB, 
            from    : this.account, 
            value   : amount,
            gasLimit: 3000000
        });

        return status

	}

	async withdraw_eth_from_capn(amount){

		const send_params = {
	        from        : this.account.address,
	        gas         : 1000000,
	        gasPrice    : await this.get_gas_price()
	    };


		const status = await this.CONTRACT_CAPNRAB.methods.withdraw(amount).send(send_params);
		return status;
	}


	async get_send_params(){
		return {
	        from        : this.account.address,
	        gas         : 1000000,
	        gasPrice    : await this.get_gas_price()
	    };
	}

	async get_erc20(symbol){

		const ABI_ERC20 	= utils.read_json('./includes/abi_erc20.json');
		const erc20_address = this.tokens.get_token_address(symbol)
		return [ABI_ERC20, erc20_address]
	}

	async deposit_erc20_to_capn(symbol, amount){
		
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
			    "chain"       : this.config.CHAIN,
			    "sellToken"   : tokens[0]["address"], 
			    "buyToken"    : tokens[i]["address"], 
			    "sellAmount"  : sellAmount
			});


			// let to_exists = ("to" in status["json"]);

			if(status["error"]){
				console.log(`❌ ${status["error"]} | url: ${status["url"]}`);
			}
			else{
				console.log(`✅ | url: ${status["url"]}`);
			}

		}
		

	}





	async swap(name_of_swap, stats=[], min_expected){

		if(stats.length==0){
			logger.debug("No stats");
			return;
		}

		let swaps = [];
		let gas_combined =0;


		// IERC20[] memory sellTokens,
		// IERC20[] memory buyTokens,
		// address[] memory spenders,
		// address[] memory swapTargets,
		// bytes[] memory swapCallDatas,
		// uint256[] memory msg_values,
		// uint256 min_expected

		let sellTokens = [], buyTokens= [], spenders=[], swapTargets =[]

		for(let i=0;i<stats.length; i++){
	        
			// console.log(i);
			// if(stats[i].quote.value=="0"){
			// 	return {
			// 		"error" : `[quote ${i}] ${stats[i].name} - msg.value==0`
			// 	};
			// }
			// logger.log(stats[i].quote);
	        swaps.push({
	            "sellToken"     : stats[i].quote.sellTokenAddress,
	            "buyToken"      : stats[i].quote.buyTokenAddress,
	            "sellAmount"    : stats[i].quote.sellAmount,
	            "buyAmount"    : stats[i].quote.buyAmount,
	            "spender"       : stats[i].quote.allowanceTarget,
	            "swapTarget"    : stats[i].quote.to,
	            "msg_value"     : stats[i].quote.value,
	            "swapCallData"  : stats[i].quote.data
	        });

	        gas_combined += parseInt(stats[i].quote.gas);
	    }
	    
	    // logger.log("Sending swaps");
		const send_params = {
            from 	: this.account.address,
            // value 	: stats[0].quote.value,
            gas 	: gas_combined * 5,
            gasPrice: stats[0].quote.gasPrice,
        };

        // logger.log(send_params);
        
        let status = {
        	"receipt" : null,
        	"error" : null
        }

        try {

        	

	        // const receipt = await this.CONTRACT_CAPNRAB.methods.swap(
	        //     name_of_swap,
	        //     swaps,
	        //     min_expected
	        // ).send(send_params);

	        const first_swap = swaps[0];
        	// logger.log("Sending swap");
        	logger.log(`sellAmount:  ${first_swap.sellAmount}`);

	        const fillquote_params = {
	            from 	: this.account.address,
	            value 	: first_swap.msg_value,
	            gasPrice: stats[0].quote.gasPrice,
	            gas 	: parseInt( stats[0].quote.gas ) * 10
	        };

	        logger.log(fillquote_params);
	        

	        const receipt = await this.CONTRACT_CAPNRAB.methods.fillQuote(
	            first_swap.sellToken,
	            first_swap.buyToken,
	            first_swap.spender,
	            first_swap.swapTarget,
	            first_swap.swapCallData,
	        ).send(fillquote_params);

	        logger.log(receipt);	        
        	status["receipt"] = receipt;
        } catch (err) {

        	logger.log("************************");
        	logger.log(err);
        	logger.log("************************");
	        const error = await utils.parse_web3_tx_error(err, this.web3);
			
			error["scanner"] = `${this.config.SCANNER}/tx/${error["txHash"]}`;
	        logger.log(error);
	        status["error"] = error;
	    }

	    return status;
	}


	async test_swap(path) {
	    
	    const sellToken = "DAI";
	    const buyToken = "WETH";

	    const q1 = await query_0x({
	    	"chain" 	: this.config.CHAIN, 
	    	"sellToken" : this.tokens.get_token_address(sellToken), 
	    	"buyToken" 	: this.tokens.get_token_address(buyToken), 
	    	"sellAmount": 1
	   	});
	    logger.log(`Q1 quote`);
	    logger.log(q1);

	    const q2 = await query_0x({
	    	"chain" 	: this.config.CHAIN,
	    	"sellToken" : this.tokens.get_token_address(buyToken), 
	    	"buyToken" 	: this.tokens.get_token_address(sellToken), 
	    	"sellAmount": 1
	    });
		
	    if(q1.error || q2.error){
	    	const errs = {
	    		"q1_error" : q1.error,
	    		"q2_error" : q2.error
	    	}
	    	console.log(errs);
	    	return;
	    	
	    }


        const  status = await this.swap(`swap`,[
    		{
    			"name" : `${sellToken}-${buyToken}`,
    			"quote": q1
    		},
    		{
    			"name" : `${buyToken}-${sellToken}`,
    			"quote": q2
    		}
    	]);
	    console.log(status);
	}

}



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
        '-dea', '--deposit_erc20_amount', 
        {help: "Deposit ERC20", required: false, action: "store"}
    );

    parser.add_argument(
        '-oc', '--owner_call', 
        {help: "Owner call", required: false, action: "store_true"}
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
        console.log(await capn.get_allowance(lance_args));
    }

    else if(args.balance){
        console.log(await capn.get_balance(lance_args));
    }

    else if(args.allowance_wallet){
        console.log(await capn.get_allowance_wallet(lance_args));
    }

    else if(args.balance_wallet){
        console.log(await capn.get_balance_wallet(lance_args));
    }

    else if(args.bulk_approve){
        console.log(await capn.bulk_approve());
    }

    else if(args.deposit){
        const amount = args.deposit;
        console.log(`Deposit ETH : ${amount}`);
        
        console.log(await capn.deposit_eth_to_capn(amount))
    }

    else if(args.deposit_erc20){
        const token = args.deposit_erc20;
        const amount = args.deposit_erc20_amount;
        console.log(`Deposit ERC20 :  ${token} | ${amount}`);

        console.log(await capn.deposit_erc20_to_capn(token, amount));
    }

    else if(args.withdraw){
        const amount = args.withdraw;
        console.log(`Withdraw ETH : ${amount}`);
        
     	console.log(await capn.withdraw_eth_from_capn(amount));   
    }

    else if(args.withdraw_erc20){
        const token = args.withdraw_erc20;
        const amount = args.withdraw_erc20_amount;
        console.log(`Withdraw ERC20 :  ${token} | ${amount}`);

        console.log(await capn.withdraw_erc20_from_capn(token, amount));
    }
    else if(args.check_token_validity){
        console.log(await capn.check_token_validity());
    }


    else{
        console.log(await capn.test_swap());
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
	CapnRab
}