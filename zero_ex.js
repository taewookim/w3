const utils = require("./util.js");
const axios = require("axios");
const logger = require('logger-line-number');
const { config, tokens, http_proxy } = require('./config.js');
// const execSync = require('child_process').execSync;

async function query_0x(params={
    "sellToken"     : "USDC", 
    "buyToken"      : "DAI",
    "sellAmount"    : "1000000",
    "slippagePercentage" : 0.001,
    "takerAddress" : null
    }, debug={"debug": false}){


    if(parseInt(params['sellAmount'])==0){
        throw new Error(`sellToken: ${params["sellToken"]} | sellAmount cannot be 0 (make sure to check balance`);
    }

    // if(!params['takerAddress']){
    //     throw new Error(`taker address cannot be empty`);
    // }


    const sellTokenAddress = tokens.get_token_address(params["sellToken"]).toLowerCase();
    const buyTokenAddress  = tokens.get_token_address(params["buyToken"]).toLowerCase();
    const slippagePercentage = params.slippagePercentage || config.SLIPPAGE_PERCENTAGE;

    const qs_params = {
        "sellToken"         : sellTokenAddress,
        "buyToken"          : buyTokenAddress,
        "sellAmount"        : params['sellAmount'],
        "slippagePercentage": slippagePercentage
    };

    if(params["takerAddress"]){
        qs_params["takerAddress"] = params["takerAddress"];
    }

    const qs = createQueryString(qs_params);
    const API_QUOTE_URL=`https://${config.CHAIN}.api.0x.org/swap/v1/quote`;
    const quoteUrl = `${API_QUOTE_URL}?${qs}`;

    // console.log(quoteUrl);
    // console.log(`debug["debug"]: ${debug["debug"]}`);
    if(debug && debug["debug"] ){
        logger.log("*".repeat(30));
        logger.log(`sellToken: ${params["sellToken"]} | buyToken: ${params["buyToken"]} | ${quoteUrl}`);
        logger.log("*".repeat(30));    
    }
    

    try{
        //////////////////////////////////
        // direct connection unless proxy specified
        //////////////////////////////////
            
        let axios_params = {timeout : 3000};
        if(http_proxy){
            axios_params["proxy"] = JSON.parse(http_proxy);
        }

        const response = await axios(quoteUrl, axios_params);

        const { status } = response; 
        const json_data = await response.data;

        return {
            "status"    : status,
            "error"     : (status!=200) ? JSON.stringify(json_data["validationErrors"]) : null, 
            "json"      : json_data,
            "url"       : quoteUrl
        }
            
    }catch(error){
        // console.log(error);

        let error_string = null;

        try{
            error_string = JSON.stringify(error.response.data);
        } catch(e){
            // (error.code === 'ECONNABORTED')
            error_string = error.code;
        }
         
        return {"error" : `${error_string} - ${quoteUrl}`};
    }
    

    /////////////////////////////////////////////
    // use curl if axios breaks
    /////////////////////////////////////////////
    // const quoteUrl = 'https://ropsten.api.0x.org/swap/v1/quote?sellToken=0x07865c6e87b9f70255377e024ace6630c1eaa37f&buyToken=0xc778417e063141139fce010982780140aa0cd5ab&sellAmount=5320198&slippagePercentage=0.001';

    // const command = `curl -sL "${quoteUrl}"`;

    // // console.log(command);
    // let result = execSync(command).toString();
    // // console.log(result);

    // let json_data = JSON.parse(result);
    // // console.log(result_json);
    // // return result_json;

    // const error = ("validationErrors" in json_data) ?
    //     JSON.stringify(json_data["validationErrors"]) : null;

    // return {
    //     "error"     : error, 
    //     "json"      : json_data,
    //     "url"       : quoteUrl
    // }

}

function createQueryString(params) {
    return Object.entries(params).map(([k, v]) => `${k}=${v}`).join('&');
}

module.exports.query_0x=query_0x;

(async () => {

    if (typeof module !== 'undefined' && !module.parent) {
        console.log(await query_0x());
    }
})();