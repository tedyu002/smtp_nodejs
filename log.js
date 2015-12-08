var cluster = require('cluster');

module.exports = {
	prefix: function(ip) {
		return '[' + cluster.worker.id + ' ' + cluster.worker.process.pid + ' ' + ip + '] ';
	}
};
