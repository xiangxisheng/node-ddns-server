const tls = require('node:tls');
const http2 = require('node:http2');
//const {SocksClient} = require('socks');
module.exports = async function (_options) {
	const {
		HTTP2_HEADER_METHOD,
		HTTP2_HEADER_PATH,
		HTTP2_HEADER_STATUS,
		HTTP2_HEADER_CONTENT_TYPE,
	} = http2.constants;
	const oPrivate = {
		async getSocketByProxy(_options) {
			// SOCKS 代理服务器的信息
			const proxyOptions = {
				proxy: {
					// 代理服务器的 IP 地址
					host: _options.proxy.hostname,
					// 代理服务器的端口号
					port: parseFloat(_options.proxy.port),
					// SOCKS 版本，通常为 5
					type: 5,
				},
				destination: {
					// 目标服务器的 IP 地址
					host: _options.hostname ? _options.hostname : _options.servername,
					// 目标服务器的端口号
					port: _options.port ? parseFloat(_options.port) : 443,
				},
				command: 'connect'
			};
			const infoSocksClient = await SocksClient.createConnection(proxyOptions);
			return infoSocksClient.socket;
		},
		getURLByHost(_host) {
			return new URL(`https://${_host}`);
		},
		async http2_connect(sUrl, options_connect) {
			oPrivate.client = http2.connect(sUrl, options_connect);
			oPrivate.client.on('error', async (e) => {
				// 处理服务器错误
				if (e.errno === -4077) {
					// code: 'ECONNRESET'
					await oPrivate.http2_connect(sUrl, options_connect);
					return;
				}
				console.error(new Date(), e);
			});
		},
		async init() {
			if (_options.proxy) {
				_options.socket = await oPrivate.getSocketByProxy(_options);
			}
			const oURL = oPrivate.getURLByHost(_options.servername);
			if (_options.port) {
				oURL.port = _options.port;
			}
			const sUrl = oURL.toString();
			const options_connect = {};
			if (_options.hostname) {
				options_connect.createConnection = (mUrl) => {
					const options = {};
					// 创建 SOCKS 代理客户端
					if (_options.socket) {
						options.socket = _options.socket;
					} else {
						options.host = _options.hostname ? _options.hostname : mUrl.hostname;
						options.port = mUrl.port ? parseFloat(mUrl.port) : 443;
					}
					options.servername = mUrl.hostname;
					options.ALPNProtocols = ['h2'];
					return tls.connect(options);
				}
			}
			await oPrivate.http2_connect(sUrl, options_connect);
		},
		async request(options) {
			for (var i = 1; i <= 10; i++) {
				try {
					return oPrivate.client.request(options);
				} catch (err) {
					if (err.code === 'ERR_HTTP2_INVALID_SESSION') {
						console.info(err);
						await oPrivate.init();
						if (i <= 3) {
							continue;
						}
					}
					throw err;
				}
			}
		},
	};
	const oPublic = {
		async request(_options) {
			const { path, data } = _options;
			const options = {};
			options[HTTP2_HEADER_PATH] = path;
			if (data) {
				options[HTTP2_HEADER_METHOD] = 'POST';
				options[HTTP2_HEADER_CONTENT_TYPE] = 'application/x-www-form-urlencoded';
			}
			return new Promise(async (fReqReslove, fReqReject) => {
				const req = await oPrivate.request(options);
				req.on('error', (error) => {
					console.log(new Date(), '[http2-req-on-error]', error);
					if (error.code === 'ERR_HTTP2_STREAM_ERROR') {
						console.info('Stream closed with error code NGHTTP2_STREAM_CLOSED');
					}
					if (error.code === 'ERR_HTTP2_INVALID_SESSION') {
						console.info('The session has been destroyed');
					}
					fReqReject(error);
				});
				req.on('response', (headers) => {
					const oResResult = {};
					oResResult.headers = JSON.parse(JSON.stringify(headers));
					delete oResResult.headers[HTTP2_HEADER_STATUS];
					oResResult.status = headers[HTTP2_HEADER_STATUS];
					oResResult.arrayBuffer = async () => {
						return new Promise((fResReslove, fResReject) => {
							const chunks = [];
							req.on('data', (chunk) => {
								chunks.push(chunk);
							});
							req.on('end', () => {
								fResReslove(Buffer.concat(chunks));
							});
						});
					};
					oResResult.text = async () => {
						return (await oResResult.arrayBuffer()).toString();
					};
					oResResult.json = async () => {
						return JSON.parse(await oResResult.text());
					};
					fReqReslove(oResResult);
				});
				if (data) {
					req.write(data);
				}
				req.end();
			});
		},
		async get(path) {
			return await oPublic.request({ path });
		},
		async post(path, data) {
			return await oPublic.request({ path, data });
		},
	}
	await oPrivate.init();
	return oPublic;
};
