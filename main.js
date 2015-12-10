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
	var parser = require('./grammar.js').parser;
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
			var res = parser.parse(cmd_line);
			switch (res.cmd) {
				case 'HELO':
					if (res.is_ext === 1) {
						connection.write("250-" + config.domain_name + "\r\n", next_cmd);
						connection.write("250 SIZE " + config.mail_data_max + "\r\n", next_cmd);
					}
					else {
						connection.write("250 " + config.domain_name + "\r\n", next_cmd);
					}
					break;
				case 'MAIL':
					console.log('Get mail from ' + res.from);
					break;
				case 'RCPT':
					console.log('Rect to ' + res.to);
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
					console.log("Unknown: " + res.cmd);
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
