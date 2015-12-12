var config = require('./config.js');
var log = require('./log.js');
var constant = require('./constant.js');
var readline = require('./readline.js');

var cluster = require('cluster');

if (cluster.isMaster) {
	for (var i = 0; i < config.fork_num; ++i) {
		cluster.fork();
	}
	cluster.on('exit', function(worker, code, signal) {
		console.log('worker ' + worker.process.pid + 'died');
	});
}
else {
	var net = require('net');
	var cmd_parser = require('./grammar_cmd.js').parser;
	var address_parser = require('./grammar_address.js').parser;
	var server = net.createServer(function(connection) {
		var log_prefix = log.prefix(connection.remoteAddress);
		console.log( log_prefix + 'client connected');

		connection.on('end', function() {
			console.log(log_prefix + 'cliet disconnected');
		});
		

		var readline_inst = readline.instance(connection, 'evt_cmd', 'evt_data', 'evt_data_end');
		var next_cmd = function() {
			readline_inst.read_next();
		}

		connection.on('data', readline_inst.read);
		connection.pause();

		readline_inst.emitter.on('evt_cmd', function(cmd_line) {
			var res;
			try {
				res = cmd_parser.parse(cmd_line);
			}
			catch (e) {
				res = {cmd:''};
				console.log(e);
			}
			var domain;
			if (res.cmd === 'HELO' || res.cmd === 'MAIL' || res.cmd === 'RCPT') {
				try {
					domain = address_parser.parse(res.args);
				}
				catch (e) {
					domain = {type: ''};
					console.log(e);
				}
			}

			switch (res.cmd) {
				case 'HELO':
					if (domain.type === 'domain') {
						if (res.is_ext === 1) {
							connection.write("250-" + config.domain_name + " greeting " + domain.value + "\r\n", next_cmd);
							connection.write("250 SIZE " + config.mail_data_max + "\r\n", next_cmd);
						}
						else {
							connection.write("250 " + config.domain_name + " greeting " + domain.value + "\r\n", next_cmd);
						}
					}
					else {
						connection.write("550 syntax error domain name '" + res.args + "'\r\n", next_cmd);
					}
					break;
				case 'MAIL':
					if (domain.type === 'path' || domain.type === 'empty') {
						connection.write("250 The reverse-path is '" + domain.value.local_part + '@' + domain.value.domain + "'\r\n", next_cmd);
					}
					else if (domain.type === 'domain') {
						connection.write("553 '" + domain.value + "' is a domain, not a mailbox\r\n", next_cmd);
					}
					else {
						connection.write("553 '" + res.args + "' is not a mailbox.\r\n", next_cmd);
					}
					break;
				case 'RCPT':
					if (domain.type === 'path') {
						connection.write("250 The forward-path is '" + domain.value.local_part + '@' + domain.value.domain + "'\r\n", next_cmd);
					}
					else if (domain.type === 'domain') {
						connection.write("553 '" + domain.value + "' is a domain, not a mailbox\r\n", next_cmd);
					}
					else if (domain.type === 'empty') {
						connection.write("553 mailbox can't be empty\r\n", next_cmd);
					}
					else {
						connection.write("553 '" + res.args + "' is not a mailbox.\r\n", next_cmd);
					}

					break;
				case 'DATA':
					console.log('DATA');
					readline_inst.enter_data_mode();
					connection.write("354 Start mail input; end with <CRLF>.<CRLF>\r\n", next_cmd);
					break;
				case 'RSET':
					connection.write('250\r\n', next_cmd);
					break;
				case 'QUIT':
					connection.write('221\r\n', function() {
						connection.end();
					});
					break;
				default:
					connection.write("550 '" + cmd_line + "' not recognize\r\n", next_cmd);
					break;
			}
		});

		readline_inst.emitter.on('evt_data', function(buf) {
			console.log("Get buf with length " + buf.length + ' ' + buf.toString('ascii'));
			readline_inst.read_next();
		});

		readline_inst.emitter.on('evt_data_end', function() {
			connection.write('250\r\n', function() {
				readline_inst.disable_data_mode();
				readline_inst.read_next();
			});
		});

		connection.on('timeout', function() {
			connection.end();
		});

		connection.setTimeout(config.idle_time);

		readline_inst.read_next();
	});

	server.listen(8000, function() {
		var log_prefix = log.prefix('');
		console.log(log_prefix + 'server is listening');
	});
}
