const fs = require('fs');
const ini = require('ini')
const { TokenParser } = require('./tokens.js');


const config_file =ini.parse(fs.readFileSync('./includes/capn_rab.ini', 'utf-8'))
const config = config_file[config_file.ACTIVE];

const http_proxy = config_file.HTTP_PROXY;

require('dotenv').config({ 
    path: config.DOTENV
});

function show_config(){
    console.log("*".repeat(90));
    console.log(config);
    console.log("*".repeat(90));
    console.log(""); 
}
 
const tokens         = new TokenParser(
    `./includes/${config.CHAIN}_coins.json`,
    config.NATIVE_COIN
)
module.exports.show_config=show_config;
module.exports.config=config;
module.exports.http_proxy=http_proxy;
module.exports.tokens=tokens;