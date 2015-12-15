var config = require('./config.js');
var log = require('./log.js');
var constant = require('./constant.js');
var readline = require('./readline.js');

var util = require('util');
var crypto = require('crypto');
var cluster = require('cluster');
var fs = require('fs');

var net = require('net');
var seq = 0;

var pop3_parser = require('./grammar_pop3.js').parser;

function Session() {
	var me = this;

	this.user = null;
	this.pass = null;
	this.maildrop = null;
	this.mail_lists = null;
	this.is_auth = false;
	this.stream = null;
	this.total_size = 0;
	this.full_total_size = 0;
	this.deleted_num = 0;
	this.auth = function() {
		return true;
	};
}

function Message(id, size) {
	this.deleted = false;
	this.id = id;
	this.size = size;
}

var pop3_server = function () {
	var login_users = {};

	var server = net.createServer(function(connection) {
		var logger = log.instance(connection.remoteAddress);
		var readline_inst;
		logger('client connected');

		var session = new Session();

		connection.on('close', function() {
			readline_inst.emitter.removeAllListeners();
			connection.removeAllListeners();
			if (session.stream) {
				session.stream.end();
			}
			delete login_users[session.user];
			session = null;
			logger('cliet disconnected');
		});

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
			var cmd;
			try {
				cmd = pop3_parser.parse(cmd_line);
			}
			catch (e) {
				cmd = {cmd:''};
				logger(e);
			}

			switch (cmd.cmd) {
				case 'USER':
					if (session.is_auth) {
						safe_send("-ERR Already auth\r\n", next_cmd);
						break;
					}
					session.user = cmd.arg;
					safe_send("+OK User accept\r\n", next_cmd);
					break;
				case 'PASS':
					if (session.is_auth) {
						safe_send("-ERR Already Auth\r\n", next_cmd);
						break;
					}
					if (session.user === null) {
						safe_send("-ERR Who are you\r\n", next_cmd);
						break;
					}
					session.pass = cmd.arg;
					if (session.auth()) {
						if (login_users[session.user]) {
							safe_send("-ERR You are already login\r\n", next_cmd);
							session = new Session();
							break;
						}

						var md5sum = crypto.createHash('md5');
						md5sum.update(session.user);
						var user_dir_name = md5sum.digest('hex');
						var user_dir = config.dst_dir + '/' + user_dir_name;
						session.maildrop = user_dir;
						session.is_auth = true;

						login_users[session.user] = true;

						fs.readdir(session.maildrop, function(err, files) {
							session.mail_lists = [];
							if (!err) {
								for (var i = 0; i < files.length; ++i) {
									var full_path = session.maildrop + '/' + files[i];
									var stat = fs.statSync(full_path);
									if (stat) {
										var size = Number(util.inspect(stat.size));
										session.total_size += size;
										session.mail_lists.push(new Message(files[i], size));
									}
								}
								session.full_total_size = session.total_size;
							}
							safe_send("+OK Pass accepted, user " + session.user + " has " + session.mail_lists.length + " messages (" + session.total_size + " octets)\r\n", next_cmd);
							logger("User '" + session.user + "' login");
						});

						break;
					}
					else {
						safe_send("-ERR Auth error\r\n", ext_cmd);
						session = new Session();
						break;
					}
					break;
				case 'STAT':
					if (session.is_auth === false) {
						safe_send("-ERR No Auth\r\n", next_cmd);
						break;
					}
					safe_send('+OK ' + (session.mail_lists.length - session.deleted_num) + ' ' + session.total_size + "\r\n", next_cmd);
					break;
				case 'LIST':
					if (session.is_auth === false) {
						safe_send("-ERR No Auth\r\n", next_cmd);
						break;
					}

					var messages = [];
					for (var i = 0; i < session.mail_lists.length; ++i) {
						var message = session.mail_lists[i];
						if (message.deleted === false) {
							messages.push('' + (i + 1) + ' ' + message.size + "\r\n");
						}
					}
					messages.push(".\r\n");
					var entire_message = messages.join('');
					messages = null;

					safe_send(entire_message, next_cmd);
					break;
				case 'RETR':
					if (session.is_auth === false) {
						safe_send("-ERR No Auth\r\n", next_cmd);
						break;
					}
					else if (cmd.arg < 1 || cmd.arg > session.mail_lists.length) {
						safe_send("-ERR out of range\r\n", next_cmd);
					}
					else if (session.mail_lists[cmd.arg - 1].deleted) {
						safe_send("-ERR already deleted\r\n", next_cmd);
					}
					else {
						var message = session.mail_lists[cmd.arg - 1];
						fs.readFile(session.maildrop + '/' + message.id, {encoding: 'ascii'}, function(err, data) {
							if (err) {
								safe_send('-ERR mail read error\r\n', next_cmd);
							}
							else {
								var buffers = [];
								buffers.push("+OK " + message.size + " octets\r\n");
								if (data.length > 0 && data.charCodeAt(0) == '.') {
									buffers.push('.');
								}
								var start_index = 0;
								var next_index = 0;
console.log(data);
								while ((next_index = data.indexOf("\r\n.", start_index)) != -1 ) {
									buffers.push(data.substr(start_index, next_index + 2));
									buffers.push('.');
									start_index += 3;
								}
								buffers.push(data.substr(start_index));

								buffers.push(".\r\n");

								var final_buffer = buffers.join('');
								buffers = null;
								data = null;

								safe_send(final_buffer, next_cmd);
							}
						});
					}

					break;
				case 'DELE':
					if (session.is_auth === false) {
						safe_send("-ERR No Auth\r\n", next_cmd);
					}
					else if (cmd.arg < 1 || cmd.arg > session.mail_lists.length) {
						safe_send("-ERR out of range\r\n", next_cmd);
					}
					else if (session.mail_lists[cmd.arg - 1].deleted) {
						safe_send("-ERR already deleted\r\n", next_cmd);
					}
					else {
						var message = session.mail_lists[cmd.arg - 1];
						message.deleted = true;
						session.total_size -= message.size;
						session.deleted_num++;
						safe_send("+OK Delete\r\n", next_cmd);
					}
					break;
				case 'NOOP':
					if (session.is_auth === false) {
						safe_send("-ERR No Auth\r\n", next_cmd);
						break;
					}

					safe_send("+OK NOOP\r\n", next_cmd);
					break;
				case 'RSET':
					if (session.is_auth === false) {
						safe_send("-ERR No Auth\r\n", next_cmd);
						break;
					}

					for (var i = 0; i < session.mail_lists.length; ++i) {
						session.mail_lists[i].deleted = false;
					}
					session.deleted_num = 0;
					session.total_size = session.full_total_size;

					safe_send("+OK Reset\r\n", next_cmd);
					break;
				case 'QUIT':
					if (session.is_auth) {
						var remain_message = 0;
						for (var i = 0; i < session.mail_lists.length; ++i) {
							var message = session.mail_lists[i];
							if (message.deleted === true) {
								var file = session.maildrop + '/' + message.id;
								fs.unlink(file);
							}
							else {
								remain_message++;
							}
						}

						safe_send("+OK Goodbye, '" + session.user + "' (" + remain_message + " message left)\r\n");
					}
					else {
						safe_send("+OK Goodbye, unknown user\r\n");
					}
					connection.destroy();
					break;
				case 'UIDL':
					if (session.is_auth === false) {
						safe_send("-ERR No Auth\r\n", next_cmd);
						break;
					}

					var messages = [];
					for (var i = 0; i < session.mail_lists.length; ++i) {
						var message = session.mail_lists[i];
						if (message.deleted === false) {
							messages.push('' + (i + 1) + ' ' + message.id + "\r\n");
						}
					}
					messages.push(".\r\n");
					var entire_message = messages.join('');
					messages = null;

					safe_send(entire_message, next_cmd);
					break;
				default:
					safe_send("Command '" + cmd_line + "' is not recoginized\r\n", next_cmd);
			}
		});

		readline_inst.emitter.on('evt_char_invalid', function() {
			safe_send('-ERR invalid character\r\n', function() {
				readline_inst.read_next();
			});
		});

		readline_inst.emitter.on('buf_overflow_event', function() {
			safe_send('-ERR the line to long\r\n', function() {
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
		logger('pop3 server is listening');
	});
};

module.exports = {
	run: pop3_server
};
