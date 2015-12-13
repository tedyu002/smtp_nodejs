var config = require('./config.js');
var log = require('./log.js');
var constant = require('./constant.js');
var readline = require('./readline.js');

var cluster = require('cluster');
var fs = require('fs');

if (cluster.isMaster) {
	fs.mkdir(config.work_dir, function() {
		fs.mkdir(config.dst_dir, function() {
			for (var i = 0; i < config.fork_num; ++i) {
				cluster.fork();
			}
			cluster.on('exit', function(worker, code, signal) {
				console.log('worker ' + worker.process.pid + ' died, refork');
				cluster.fork();
			});
		});
	});
}
else {
	var net = require('net');
	var seq = 0;
	var cmd_parser = require('./grammar_cmd.js').parser;
	var address_parser = require('./grammar_address.js').parser;

	function MailTransaction(readline_inst) {
		var me = this;
		this.mail_from = null;
		this.rcpt = [];
		this.file_name = null;
		this.stream = null;
		this.fs_err = null;
		this.src = null;
		this.dst = null;
		this.write_size = 0;
		this.bufs = [];
		this.all_set = function() {
			return me.mail_from != null && me.rcpt.length > 0;
		}
		this.open = function() {
			if (seq === 10000000) {
				seq = 0;
			}
			me.file_name = (new Date()).getTime() + '-' + cluster.worker.id + '-' + cluster.worker.process.pid + '-' + (seq++) + '-' + Math.random() + '.eml';
			me.src = config.work_dir + '/' + me.file_name;
			me.dst = config.dst_dir + '/' + me.file_name;
			me.stream = fs.createWriteStream(me.src, {
				flags: "w",
				defaultEncoding: "ascii",
				fd: null,
				mode: 0o664
			});
			return me.stream ? true :false;
		};

		this.finish = function(failed) {
			if (failed) {
				me.stream.end();
				fs.unlink(me.src);
			}
			else {
				me.stream.end();
				fs.rename(me.src, me.dst);
			}
		};
	}

	var server = net.createServer(function(connection) {
		var log_prefix = log.prefix(connection.remoteAddress);
		var readline_inst;
		console.log(log_prefix + 'client connected');

		connection.on('close', function() {
			readline_inst.emitter.removeAllListeners();
			connection.removeAllListeners();
			console.log(log_prefix + 'cliet disconnected');
		});

		var mail_transaction = new MailTransaction();

		readline_inst = readline.instance(connection, 'evt_cmd', 'evt_data', 'evt_data_end', 'evt_char_invalid', 'buf_overflow_event');

		connection.on('error', function() {
			console.log(log_prefix + ' connection error');
			connection.destroy();
		});

		var safe_send = function(mesg, callback) {
			try{
				connection.write(mesg, callback);
			}
			catch(e) {
				console.log(log_prefix + e);
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
							safe_send("250-" + config.domain_name + " greeting " + domain.value + "\r\n" +
									  "250 SIZE " + config.mail_data_max + "\r\n", next_cmd);
						}
						else {
							safe_send("250 " + config.domain_name + " greeting " + domain.value + "\r\n", next_cmd);
						}
						mail_transaction = new MailTransaction();
					}
					else {
						safe_send("550 syntax error domain name '" + res.args + "'\r\n", next_cmd);
					}
					break;
				case 'MAIL':
					if (mail_transaction.mail_from != null) {
						safe_send('503 Mail Already be set\r\n', next_cmd);
					}
					else {
						if (domain.type === 'path') {
							mail_transaction.mail_from = domain;
							safe_send("250 The reverse-path is '" + domain.value.local_part + '@' + domain.value.domain + "'\r\n", next_cmd);
						}
						else if (domain.type === 'empty') {
							mail_transaction.mail_from = domain;
							safe_send("250 The reverse-path is empty\r\n", next_cmd);
						}
						else if (domain.type === 'domain') {
							safe_send("553 '" + domain.value + "' is a domain, not a mailbox\r\n", next_cmd);
						}
						else {
							safe_send("553 '" + res.args + "' is not a mailbox.\r\n", next_cmd);
						}
					}
					break;
				case 'RCPT':
					if (mail_transaction.mail_from == null) {
						safe_send('503 Mail from is not set\r\n', next_cmd);
					}
					else if (mail_transaction.rcpt.length >= config.rcpt_max) {
						safe_send('452 Too many recipients\r\n', next_cmd);
					}
					else {
						if (domain.type === 'path') {
							mail_transaction.rcpt.push(domain);
							safe_send("250 The forward-path is '" + domain.value.local_part + '@' + domain.value.domain + "'\r\n", next_cmd);
						}
						else if (domain.type === 'domain') {
							safe_send("553 '" + domain.value + "' is a domain, not a mailbox\r\n", next_cmd);
						}
						else if (domain.type === 'empty') {
							safe_send("553 mailbox can't be empty\r\n", next_cmd);
						}
						else {
							safe_send("553 '" + res.args + "' is not a mailbox.\r\n", next_cmd);
						}
					}
					break;
				case 'DATA':
					if (mail_transaction.all_set()) {
						if (mail_transaction.open()) {
							readline_inst.enter_data_mode();
							safe_send("354 Start mail input; end with <CRLF>.<CRLF>\r\n", next_cmd);
						}
						else {
							mail_transaction = new MailTransaction();
							safe_send("452 insufficient system storage\r\n", next_cmd);
						}
					}
					else {
						safe_send("503 Reverse path or forward-path not set\r\n", next_cmd);
					}
					break;
				case 'RSET':
					mail_transaction = new MailTransaction();
					safe_send('250\r\n', next_cmd);
					break;
				case 'QUIT':
					safe_send('221\r\n', function() {
						connection.destroy();
					});
					break;
				default:
					safe_send("550 '" + cmd_line + "' not recognize\r\n", next_cmd);
					break;
			}
		});

		readline_inst.emitter.on('evt_data', function(buf) {
			if (mail_transaction.fs_err == null || mail_transaction.write_size < config.mail_data_max) {
				mail_transaction.bufs.push(buf);
				if (mail_transaction.bufs.length > 64) {
					var buf_merge = Buffer.concat(mail_transaction.bufs);
					mail_transaction.bufs = [];
					mail_transaction.stream.write(buf_merge, 'buffer', function(err){
						if (err) {
							mail_transaction.fs_err = err;
						}
						mail_transaction.write_size += buf_merge.length;
						readline_inst.read_next();
					});
				}
				else {
					readline_inst.read_next();
				}
			}
			else {
				readline_inst.read_next();
			}
		});

		var data_end_func = function(drop_mode) {
			var failed = drop_mode !== false || mail_transaction.fs_err !== null || mail_transaction.write_size >= config.mail_data_max;

			var message = failed ? '500 syntax error - invalid character or bufoverflow for an line, drop message\r\n' : '250 mail accept with size ' + mail_transaction.write_size + '\r\n';

			mail_transaction.finish(failed);

			safe_send(message, function() {
				mail_transaction = new MailTransaction();
				readline_inst.disable_data_mode();
				readline_inst.read_next();
			});

		};

		readline_inst.emitter.on('evt_data_end', function(drop_mode) {
			if (mail_transaction.bufs.length != 0) {
				var buf_merge = Buffer.concat(mail_transaction.bufs);
				mail_transaction.bufs = [];
				mail_transaction.stream.write(buf_merge, 'buffer', function(err){
					if (err) {
						mail_transaction.fs_err = err;
					}
					mail_transaction.write_size += buf_merge.length;
					data_end_func(drop_mode);
				});
			}
			else {
				data_end_func(drop_mode);
			}
		});

		readline_inst.emitter.on('evt_char_invalid', function() {
			safe_send('500 syntax error - invalid character\r\n', function() {
				readline_inst.read_next();
			});
		});

		readline_inst.emitter.on('buf_overflow_event', function() {
			safe_send('500 syntax error - the line to long\r\n', function() {
				readline_inst.disable_data_mode();
				readline_inst.read_next();
			});
		});

		connection.on('timeout', function() {
			connection.destroy();
		});

		connection.setTimeout(config.idle_time);

		readline_inst.read_next();
	});

	server.listen(config.bind_port, function() {
		var log_prefix = log.prefix('');
		console.log(log_prefix + 'server is listening');
	});
}
