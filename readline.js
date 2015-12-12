var util = require('util');
var events = require('events');
var config = require('./config.js');
var constant = require('./constant.js');

var crlf_buf = new Buffer(2);
crlf_buf[0] = constant.CR;
crlf_buf[1] = constant.LF;

var dotcrlf_buf = new Buffer(3);
dotcrlf_buf[0] = constant.PERIOD;
dotcrlf_buf[1] = constant.CR;
dotcrlf_buf[2] = constant.LF;

var DM_DIS = 0;
var DM_ENTER = 1;
var DM_INTER = 2;

var INTERNAL_NEXT_EVT = 'nextinterl_evt';

module.exports = {
	instance : function(connection, event_name, data_event, data_end_event, invalid_char_event, buf_overflow_event) {
		var bufs = [];
		var total_length = 0;
		var emitter = new events.EventEmitter();
		var data_mode = DM_DIS;
		var drop_mode = false;

		var post_process = function (cmd_buf) {
			if (drop_mode === false) {
				for (var i = 0; i < cmd_buf.length; ++i) {
					if (cmd_buf[i] == 0 || cmd_buf[i] >= 128) {
						if (data_mode == DM_DIS) {
							connection.pause();
							emitter.emit(invalid_char_event, cmd_buf[i]);
							return;
						}
						else {
							drop_mode = true;
						}
					}
				}
			}

			if (data_mode === DM_DIS) {
				if (drop_mode === false) {
					var str = cmd_buf.slice(0, cmd_buf.length - 2).toString('ascii');
					connection.pause();
					emitter.emit(event_name, str);
				}
				else {
					connection.pause();
					emitter.emit(buf_overflow_event);
				}
			}
			else {
				if (cmd_buf[0] == constant.PERIOD && cmd_buf.length > dotcrlf_buf.length) {
					cmd_buf = cmd_buf.slice(1);
				}

				if (cmd_buf.length == dotcrlf_buf.length &&
					cmd_buf.equals(dotcrlf_buf)) {
					connection.pause();
					emitter.emit(data_end_event, drop_mode);
				}
				else {
					data_mode = DM_INTER;
					if (drop_mode === false) {
						connection.pause();
						emitter.emit(data_event, cmd_buf);
					}
					else {
						emitter.emit(INTERNAL_NEXT_EVT);
					}
				}
			}
		};

		var ret = {
			emitter: emitter,
			disable_data_mode: function() {
				data_mode = DM_DIS;
				drop_mode = false;
			},
			enter_data_mode: function() {
				data_mode = DM_ENTER;
			},
			inter_data_mode: function() {
				data_mode = DM_INTER;
			},
			read: function(chunk) {
				var new_buf;
				var processed = false;

				if (bufs.length !== 0) {
					var buf = bufs[bufs.length - 1];
					if (buf[buf.length -1] === constant.CR && chunk[0] === constant.LF) {
						bufs.push(crlf_buf.slice(1));
						var tmp_buf = chunk.slice(1);
						if (tmp_buf.length > 0) {
							new_buf = tmp_buf;
						}
						processed = true;
					}
				}

				if (processed === false) {
					var index = chunk.indexOf(crlf_buf);

					if (index === -1) {
						if (total_length > config.buffer_size) {
							/* Buf Overflow Error handling drop but remain least three to detect crlf or dotcrlf */

							var append_buf = Buffer.concat(bufs);
							bufs = null;

							var remain_buf = new Buffer(append_buf.slice(append_buf.length - dotcrlf_buf.length));
							append_buf = null;

							bufs = [remain_buf];
							total_length = remain_buf.length;

							drop_mode = true;
						}

						bufs.push(chunk);
						total_length += chunk.length;
					}
					else {
						bufs.push(chunk.slice(0, index + crlf_buf.length));
						var tmp_buf = chunk.slice(index + crlf_buf.length);
						if (tmp_buf.length > 0) {
							new_buf = tmp_buf;
						}

						processed = true;
					}
				}

				if (processed === true) {
					var cmd_buf = Buffer.concat(bufs);

					bufs = new_buf ? [new_buf] : [];
					total_length = new_buf ? new_buf.length : 0;

					post_process(cmd_buf);
				}
			},
			read_next: function() {
				if (bufs.length == 0) {
					connection.resume();	
				}
				else if (bufs.length > 1) {
					/* TODO Error Handling */
					console.log('should not hapepen error handling');
				}
				else {
					var index = bufs[0].indexOf(crlf_buf);
					if (index === -1) {
						connection.resume();
					}
					else {
						var cmd_buf = bufs[0].slice(0, index + crlf_buf.length);
						var tmp_buf = bufs[0].slice(index + crlf_buf.length);

						bufs = tmp_buf.length > 0 ? [tmp_buf] : [];

						post_process(cmd_buf);
					}
				}
			}
		};

		emitter.on(INTERNAL_NEXT_EVT, ret.read_next);
		return ret;
	}
};
