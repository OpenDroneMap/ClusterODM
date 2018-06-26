const fs = require('fs');
module.exports = JSON.parse(fs.readFileSync("./package.json", {encoding: 'utf8'}));
