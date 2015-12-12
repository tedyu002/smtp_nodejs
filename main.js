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

	function MailTransaction(readline_inst) {
		var me = this;
		this.mail_from = null;
		this.rcpt = [];
		this.all_set = function() {
			return me.mail_from != null && me.rcpt.length > 0;
		}
	}

	var server = net.createServer(function(connection) {
		var log_prefix = log.prefix(connection.remoteAddress);
		console.log( log_prefix + 'client connected');

		connection.on('end', function() {
			console.log(log_prefix + 'cliet disconnected');
		});

		var mail_transaction = new MailTransaction();

		var readline_inst = readline.instance(connection, 'evt_cmd', 'evt_data', 'evt_data_end', 'evt_char_invalid', 'buf_overflow_event');

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
						mail_transaction = new MailTransaction();
					}
					else {
						connection.write("550 syntax error domain name '" + res.args + "'\r\n", next_cmd);
					}
					break;
				case 'MAIL':
					if (mail_transaction.mail_from != null) {
						connection.write('503 Mail Already be set\r\n', next_cmd);
					}
					else {
						if (domain.type === 'path') {
							mail_transaction.mail_from = domain;
							connection.write("250 The reverse-path is '" + domain.value.local_part + '@' + domain.value.domain + "'\r\n", next_cmd);
						}
						else if (domain.type === 'empty') {
							mail_transaction.mail_from = domain;
							connection.write("250 The reverse-path is empty\r\n", next_cmd);
						}
						else if (domain.type === 'domain') {
							connection.write("553 '" + domain.value + "' is a domain, not a mailbox\r\n", next_cmd);
						}
						else {
							connection.write("553 '" + res.args + "' is not a mailbox.\r\n", next_cmd);
						}
					}
					break;
				case 'RCPT':
					if (mail_transaction.mail_from == null) {
						connection.write('503 Mail from is not set\r\n', next_cmd);
					}
					else if (mail_transaction.rcpt.length >= config.rcpt_max) {
						connection.write('452 Too many recipients\r\n', next_cmd);
					}
					else {
						if (domain.type === 'path') {
							mail_transaction.rcpt.push(domain);
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
					}
					break;
				case 'DATA':
					if (mail_transaction.all_set()) {
						readline_inst.enter_data_mode();
						connection.write("354 Start mail input; end with <CRLF>.<CRLF>\r\n", next_cmd);
					}
					else {
						connection.write("503 Reverse path or forward-path not set\r\n", next_cmd);
					}
					break;
				case 'RSET':
					mail_transaction = new MailTransaction();
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
			readline_inst.read_next();
		});

		readline_inst.emitter.on('evt_data_end', function(drop_mode) {
			var message = drop_mode ? '500 syntax error - invalid character or bufoverflow for an line, drop message\r\n' : '250 mail accept\r\n';
			connection.write(message, function() {
				mail_transaction = new MailTransaction();
				readline_inst.disable_data_mode();
				readline_inst.read_next();
			});
		});

		readline_inst.emitter.on('evt_char_invalid', function() {
			connection.write('500 syntax error - invalid character\r\n', function() {
				readline_inst.read_next();
			});
		});

		readline_inst.emitter.on('buf_overflow_event', function() {
			connection.write('500 syntax error - the line to long\r\n', function() {
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
