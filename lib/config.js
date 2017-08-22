var fs = require('fs-extra');
var path = require('path');
var homedir = require('homedir');
var mpxconfig = path.join(homedir(), '.mpxconfig');
var sample = path.join(__dirname, '../', 'config.sample.json');
if (!fs.existsSync(mpxconfig)) {
  fs.copySync(sample, mpxconfig);
}
var config = JSON.parse(fs.readFileSync(mpxconfig, 'utf8'));
module.exports = config;
