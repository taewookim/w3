const CoinGecko = require('coingecko-api');
const readline = require('readline');
const web3 = require("web3");
const fs = require('fs');
const center_align = require('center-align');
const execSync = require('child_process').execSync;


function get_hostname(){
    return execSync(`hostname`).toString().trim();
}




function banner(text, width=50){
    let b = "*".repeat(width) + "\n";
    b += center_align(text, width) + "\n";
    b += "*".repeat(width);
    return b;
}

async function get_salt(){
	return crypto.randomBytes(20).toString('hex');
}
async function wait(ms){
	await new Promise(r => setTimeout(r, ms));
}

function toString(number, padLength) {
    return number.toString().padStart(padLength, '0');
}

function is_native_coin(address){
    return (address.toLowerCase()=='0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee')
}

function horizontal_line(headr=null){

    let length =  process.stdout.columns;
    if(headr){
        length -= headr.length;
    }
    return '-'.repeat(length-1);
}

function now(log_style=false){

    let date = new Date();

    let dateTimeNow = null;

    if(!log_style){
        dateTimeNow= toString( date.getFullYear(),     4 )
            + '-'  + toString( date.getMonth() + 1,    2 )
            + '-'  + toString( date.getDate(),         2 )
            + ' ' + toString( date.getHours(),        2 )
            + ':'  + toString( date.getMinutes(),      2 )
            + ':'  + toString( date.getSeconds(),      2 );
    } else{
        dateTimeNow= toString( date.getFullYear(),     4 )
            + ''  + toString( date.getMonth() + 1,    2 )
            + ''  + toString( date.getDate(),         2 )
            + '_' + toString( date.getHours(),        2 )
            + ''  + toString( date.getMinutes(),      2 )
            + ''  + toString( date.getSeconds(),      2 );
    }

    return dateTimeNow;
}


//////////////////////////////////////////////////////////////////////////////
// https://www.coingecko.com/api/documentations/v3#/coins/get_coins_list
//////////////////////////////////////////////////////////////////////////////

const CoinGeckoClient = new CoinGecko();
async function get_gecko_coin_list(csv_output=null){
	let coin_list = await CoinGeckoClient.coins.list();
	return coin_list.data;
}

async function get_gecko_coin_price_in_usd(coin_id){

    // console.log(`et_gecko_coin_price_in_usd: ${coin_id}`)
	// let data = await CoinGeckoClient.coins.fetch(coin_id);

	let resp = await CoinGeckoClient.coins.fetch(coin_id);
	return resp.data.market_data.current_price.usd;
    
    // var _coinList = {};
    // var _datacc = data.data.tickers.filter(t => t.target == 'USD');
    // ['BTC'].forEach((i) => {
    //     var _temp = _datacc.filter(t => t.base == i);
    //     var _res = _temp.length == 0 ? [] : _temp[0];
    //     _coinList[i] = _res.last;
    // })

	// return data;

}


function get_key_val(line, key){
    if(line.includes(key)){
        return line.split(":")[1].replace(/\W/g, '');
    }
    return null;
}

async function parse_web3_tx_error(error, scanner){
    
    ///////////////////////////////////////////
    //remove first line then convert to json
    ///////////////////////////////////////////
    let e = error.toString().split('\n');
    let first_line = e.splice(0,1);
    e = e.join('\n');
    

    let json_error = null;

    try{
        json_error = JSON.parse(e);
    }catch(err){
        return {
            "full"     : error.toString()
        }
    }

    try{
        json_error["reason"] = error.reason;
    } catch(err){
        json_error["reason"] = null;
    }

    if("transactionHash" in json_error){
        json_error["scanner"] = `${scanner}/tx/${json_error["transactionHash"]}`;    
    }

    return json_error;
}


function read_json(file){
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}





////////////////////////////////////////////////////////////////////
// https://stackoverflow.com/questions/18193953/waiting-for-user-to-enter-input-in-node-js
////////////////////////////////////////////////////////////////////

function askQuestion(query) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise(resolve => rl.question(query, ans => {
        rl.close();
        resolve(ans);
    }))
}

function randomInt(min, max) { // min and max included 
  return Math.floor(Math.random() * (max - min + 1) + min)
}




function array_to_string(a){
    
    let str = []    
    Object.keys(a).forEach((k,index)=>{
        str.push(`${k} : ${a[k]}`);
    })
    return str.join(" | ");
}

function show_object_methods(obj){
    return Object.getOwnPropertyNames(obj);
}

function console_log_json_tabbed(obj){
    console.log("");
    console.group();
    console.log(JSON.stringify(obj, null, 2));
    console.groupEnd();
    console.log("");
}



function getPermutations(array, size) {

    function p(t, i) {
        if (t.length === size) {
            result.push(t);
            return;
        }
        if (i + 1 > array.length) {
            return;
        }
        p(t.concat(array[i]), i + 1);
        p(t, i + 1);
    }

    var result = [];
    p([], 0);
    return result;
}


function sortOnKeys(dict) {
    // https://stackoverflow.com/a/10946984/644566
    var sorted = [];
    for(var key in dict) {
        sorted[sorted.length] = key;
    }
    sorted.sort();

    var tempDict = {};
    for(var i = 0; i < sorted.length; i++) {
        tempDict[sorted[i]] = dict[sorted[i]];
    }

    return tempDict;
}


function dumpError(err) {
  if (typeof err === 'object') {
    if (err.message) {
      console.log('\nMessage: ' + err.message)
    }
    if (err.stack) {
      console.log('\nStacktrace:')
      console.log('====================')
      console.log(err.stack);
    }
  } else {
    console.log('dumpError :: argument is not an object');
  }
}

module.exports.dumpError=dumpError;
module.exports.sortOnKeys=sortOnKeys;
module.exports.banner=banner;
module.exports.getPermutations=getPermutations;
module.exports.read_json=read_json;
module.exports.array_to_string=array_to_string;
module.exports.console_log_json_tabbed=console_log_json_tabbed;
module.exports.show_object_methods=show_object_methods;
module.exports.horizontal_line=horizontal_line;
module.exports.is_native_coin=is_native_coin;
module.exports.now=now;
module.exports.randomInt=randomInt;
module.exports.askQuestion=askQuestion;
module.exports.wait=wait;
module.exports.get_gecko_coin_price_in_usd=get_gecko_coin_price_in_usd;
module.exports.get_gecko_coin_list=get_gecko_coin_list;
module.exports.get_salt=get_salt;
module.exports.parse_web3_tx_error=parse_web3_tx_error;
module.exports.get_hostname=get_hostname;



// (async () => {
//     console.log(await get_gecko_coin_price_in_usd("fantom"));

// })();

