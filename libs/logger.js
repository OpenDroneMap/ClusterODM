"use strict";

let config = require('../config');
let winston = require('winston');
let fs = require('fs');
let path = require('path');
const package = require('../package_info');

// Set up logging
// Configure custom File transport to write plain text messages
let logPath = ( config.logger.logDirectory ? 
				config.logger.logDirectory : 
				path.join(__dirname, "..") );

// Check that log file directory can be written to
try {
	fs.accessSync(logPath, fs.W_OK);
} catch (e) {
	console.log( "Log directory '" + logPath + "' cannot be written to"  );
	throw e;
}
logPath += path.sep;
logPath += package.name + ".log";

let logger = new (winston.Logger)({
  transports: [
    new (winston.transports.Console)({ level: config.logger.level }),
  ]
});
logger.add(winston.transports.File, {
		filename: logPath, // Write to projectname.log
		json: false, // Write in plain text, not JSON
		maxsize: config.logger.maxFileSize, // Max size of each file
		maxFiles: config.logger.maxFiles, // Max number of files
		level: config.logger.level // Level of log messages
	});

if (config.deamon){
	// Console transport is no use to us when running as a daemon
	logger.remove(winston.transports.Console);
}

module.exports = logger;