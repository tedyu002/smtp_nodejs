var config = require('./config.js');
var log = require('./log.js');
var constant = require('./constant.js');
var readline = require('./readline.js');

var cluster = require('cluster');
var fs = require('fs');

var net = require('net');
var seq = 0;
var cmd_parser = require('./grammar_cmd.js').parser;
var address_parser = require('./grammar_address.js').parser;



function Session() {
	var me = this;

	this.user_name = null;
	this.pass = null;

	this.auth = function(name, pass) {
	};
}

var pop3_server = function () {
	var server = net.createServer(function(connection) {
		var logger = log.instance(connection.remoteAddress);
		var readline_inst;
		logger('client connected');

		connection.on('close', function() {
			readline_inst.emitter.removeAllListeners();
			connection.removeAllListeners();
			logger('cliet disconnected');
		});

		var session = new Session();

		readline_inst = readline.instance(connection, 'evt_cmd', 'evt_data', 'evt_data_end', 'evt_char_invalid', 'buf_overflow_event');

		connection.on('error', function() {
			logger('connection error');
			connection.destroy();
		});

		var safe_send = function(mesg, callback) {
			try{
				if (config.debug) {
					logger('send ' + mesg);
				}
				connection.write(mesg, callback);
			}
			catch(e) {
				logger(e);
				connection.destroy();
			}
		};

		var next_cmd = function() {
			readline_inst.read_next();
		};

		connection.on('data', readline_inst.read);
		connection.pause();

		readline_inst.emitter.on('evt_cmd', function(cmd_line) {
			var res;
			try {
				res = cmd_parser.parse(cmd_line);
			}
			catch (e) {
				res = {cmd:''};
				logger(e);
			}
		});

		readline_inst.emitter.on('evt_char_invalid', function() {
			// TODO
			safe_send('500 syntax error - invalid character\r\n', function() {
				readline_inst.read_next();
			});
		});

		readline_inst.emitter.on('buf_overflow_event', function() {
			// TODO
			safe_send('500 syntax error - the line to long\r\n', function() {
				readline_inst.disable_data_mode();
				readline_inst.read_next();
			});
		});

		connection.on('timeout', function() {
			connection.destroy();
		});

		connection.setTimeout(config.idle_time);

		safe_send('+OK ' + config.domain_name + ' POP3 ready\r\n', next_cmd);
	});

	server.listen(config.pop3_port, function() {
		var logger = log.instance('');
		logger('server is listening');
	});
};

module.exports = {
	run: pop3_server
};
