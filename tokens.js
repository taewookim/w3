const utils = require("./util.js");
const BigNumber = require('bignumber.js');
const logger = require('logger-line-number')


class TokenParser{


	constructor(json_file, eth_address){
		this.json_file = json_file;
		this.TOKENS=utils.read_json(json_file);
		this.eth_address = eth_address;
		// this.weth_address = (weth_address) ? 
		// 	weth_address.toLowerCase():
		// 	"";
	}

	multiply(token, amount, multiply_by){

		const current 	= this.get_coin_value_wei(token, amount);
		const multiple 	= new BigNumber(multiply_by);
		return current.multipliedBy(multiple).toNumber();
	}

	is_eth(symbol){
		const address = this.get_token_address(symbol);
		// logger.log(`is_eth: ${address}`);
		return (address.toLowerCase()=="0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee");
	}

	// is_weth(symbol){
	// 	const address = this.get_token_address(symbol);
	// 	// logger.log(`is_weth: ${address} | ${this.weth_address}`);
	// 	return (address.toLowerCase() == this.weth_address);
	// }
	
	get_coin_value_human(token, amount){   
	    const numero = new BigNumber(amount);
	    const decimals = this.get_decimals(token);
	    return numero.dividedBy(decimals).toFixed();	
	    
	}


	get_coin_value_wei(token, amount){
	    const numero = new BigNumber(amount);
	    const decimals = this.get_decimals(token);    
	    return numero.multipliedBy(decimals).toFixed();
	}

	get_decimals(token){
		
		if(token==this.eth_address){
			return new BigNumber(Math.pow(10, 18));
		}

		try{
	    	return new BigNumber(Math.pow(10, this.TOKENS[token]["decimals"]));
	    } catch(error){
	    	throw new Error(`token ${token} decimals missing from ${this.json_file}`);
	    }
	}

	get_tokens(options={
		"symbols"	: false, 
		"raw" 		: false,
		"start" 	: null, 
		"limit" 	: null
	}){


	    const get_symbols 	= options.symbols 	|| false;

		///////////////////////////////////////
		// 100/5 start/limit for BSC specific
		// should specify on config.js 
		///////////////////////////////////////
	    const start 		= options.start 	|| null;
		const limit 		= options.limit 	|| null;
	    

	    let returns=[];

	    let num_entry = -1;

	    for (const [token_symbol, token_attributes] of Object.entries(this.TOKENS)) {
		    	
	    	num_entry++;

	    	if(start && num_entry < start) {
	    		// console.log(`skip ${num_entry}`)
	    		continue;
	    	}


	    	if(options["raw"]){
	    		token_attributes["symbol"] = token_symbol;
	    		returns.push(token_attributes);
	    	}
	        else if(get_symbols){
	            returns.push(token_symbol);
	        }
	        else{
	            returns.push(token_attributes["address"]);
	        }

	        if(limit && returns.length >=limit ){
	        	// console.log(`limit break : ${num_entry}`)
	        	break;
	        }
	    }
	    return returns;
	}

	get_token_address(symbol){

		if(symbol==this.eth_address){
			return "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
		}

		try{
			return this.TOKENS[symbol]["address"];	
		} catch(error){
	    	throw new Error(`token ${symbol} addrss missing from ${this.json_file}`);
	    }
		
	}


	format_token_numbers(tokens, values, options={"human_digits" : false, "non_zero_only": false}){

	    if(tokens.length!= values.length){
	        throw new Error(`Uneven arrays - ${tokens.length} vs ${values.length}`)
	    }

	    let r = {};
	    
	    for(let i=0; i<tokens.length;i++){     

	        let token = tokens[i];
	        let token_num = new BigNumber(values[i])

	        // console.log(`${token} - ${token_num.toFixed()}`)
	        if(options["non_zero_only"] && (token_num.isEqualTo(0) || token_num.isEqualTo(1))) {
	            continue;
	        }

	        r[token] = (options["human_digits"]) ? 
	            this.get_coin_value_human(token, values[i]) :
	        	token_num.toFixed();
	    }

	    return r;

	}

}





/////////////////////////////////////////////////////////////////
//
// Begin class here
//
/////////////////////////////////////////////////////////////////
module.exports.TokenParser=TokenParser;
