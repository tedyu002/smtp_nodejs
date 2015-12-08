var config = require('./config.js');
var log = require('./log.js');

var cluster = require('cluster');

if (cluster.isMaster) {
	for (var i = 0;i < config.fork_num; ++i) {
		cluster.fork();
	}
	cluster.on('exit', function(worker, code, signal) {
		console.log('worker ' + worker.process.pid + 'died');
	});
}
else {
	var net = require('net');
	var server = net.createServer(function(connection) {
		var log_prefix = log.prefix(connection.remoteAddress);
		console.log( log_prefix + 'client connected');

		connection.on('end', function() {
			console.log(log_prefix + 'cliet disconnected');
		});
		
		connection.write("Hello Word\r\n");

		var read_func = function(chunk) {
			connection.pause();
			connection.write(chunk, function() {
				connection.resume();
			});
		};

		connection.on('data', read_func);

		connection.on('timeout', function() {
			connection.end();
		});

		connection.setTimeout(config.idle_time);
	});

	server.listen(8000, function() {
		var log_prefix = log.prefix('');
		console.log(log_prefix + 'server is listening');
	});
}
