var autoUpdater = require('auto-updater');
var updater = function(config) {
  var self = this;
  self.config = config || {};
  self.au = new autoUpdater({
   pathToJson: '../',
   autoupdate: false,
   checkgit: false,
   jsonhost: 'raw.githubusercontent.com',
   contenthost: 'codeload.github.com',
   progressDebounce: 0,
   devmode: false
  });
  self.au.on('git-clone', function() {
	  console.log("You have a clone of the repository. Use 'git pull' to be up-to-date");
	});
	self.au.on('check.up-to-date', function(v) {
  		console.info("Você tem a ultima versão: " + v);
	});
	self.au.on('check.out-dated', function(v_old, v) {
  		console.warn("Sua versão é antiga. atual:" + v_old + " nova: " + v);
  		self.au.fire('download-update');
	});
	self.au.on('update.downloaded', function() {
	  console.log("Update downloaded and ready for install");
	  self.au.fire('extract');
	});
	self.au.on('update.not-installed', function() {
	  console.log("The Update was already in your folder! It's read for install");
	  self.au.fire('extract');
	});
	self.au.on('update.extracted', function() {
	  console.log("Update extracted successfully!");
	  console.warn("RESTART THE APP!");
	});
	self.au.on('download.start', function(name) {
	  console.log("Starting downloading: " + name);
	});
	self.au.on('download.progress', function(name, perc) {
	  process.stdout.write("Downloading " + perc + "% \033[0G");
	});
	self.au.on('download.end', function(name) {
	  console.log("Downloaded " + name);
	});
	self.au.on('download.error', function(err) {
	  console.error("Error when downloading: " + err);
	});
	self.au.on('end', function() {
	  console.log("The app is ready to function");
	});
	self.au.on('error', function(name, e) {
	  console.error(name, e);
	});
  self.au.fire('check');
};
module.exports = updater;
