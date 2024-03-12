const ApiDnspod = require('./api-dnspod');

const dgram = require('dgram');

const mMacAddr = {};

const delay = ms => new Promise((resolve) => setTimeout(resolve, ms))

function fGetTimestamp() {
	return +new Date();
}

async function fGetNameByMacAddr(sMacAddr) {
	if (sMacAddr === 'bc2411905555') {
		return '1102';
	}
	if (sMacAddr === 'bc2411ff58fd') {
		return '1103';
	}
	if (sMacAddr === 'bc241123f51c') {
		return '1121';
	}
	if (sMacAddr === 'bc2411976101') {
		return '1151';
	}
	if (sMacAddr === 'bc2411b9f970') {
		return '1523';
	}
	if (sMacAddr === 'bc241186f851') {
		return '1551';
	}
	if (sMacAddr === 'bc241186f87d') {
		return '1552';
	}
	if (sMacAddr === '46806cc657fd') {
		return '8888';
	}
}

async function do_ddns_aaaa(apiDnspod, sMacAddr, sIpv6, isOnline) {
	// 主机在线状态已改变，因此需要重新解析
	const sName = await fGetNameByMacAddr(sMacAddr);
	console.log(new Date(), sName, sMacAddr, sIpv6, isOnline);
	if (!sName) {
		return;
	}
	if (isOnline) {
		await apiDnspod.RecordUpsertTypeValue(process.env.DNSPOD_DOMAIN, `${sName}.v6`, 'AAAA', sIpv6, sMacAddr);
	}
}

async function handleLoop() {
	const apiDnspod = await ApiDnspod(process.env.DNSPOD_LOGIN_TOKEN);
	while (true) {
		for (const sMacAddr in mMacAddr) {
			// 这里搞个循环遍历，实时监测主机是否在线
			const mRow = mMacAddr[sMacAddr];
			const isOnline = fGetTimestamp() - mRow.time < 1000 * 5;
			if (mRow.online != isOnline) {
				while (1) {
					try {
						await do_ddns_aaaa(apiDnspod, sMacAddr, mRow.ipv6, isOnline);
						// 没出错就结束循环
						break;
					} catch (ex) {
						console.log(new Date(), '[do_ddns_aaaa]', ex);
						// 出错后要延迟1秒
						await delay(1000);
					}
				}
				await delay(1000);
				mRow.online = isOnline;
			}
		}
		await delay(1000);
	}
}
handleLoop();

// 创建 UDP 服务器
const server = dgram.createSocket('udp6');

// 监听 'message' 事件，当接收到消息时触发
server.on('message', (msg, rinfo) => {
	//console.log(new Date(), `接收到来自 [${rinfo.address}]:${rinfo.port} 的消息: ${msg}`);
	const sMacAddr = msg.toString().replace(/\-|\:/g, '').toLowerCase();
	if (!mMacAddr[sMacAddr]) {
		mMacAddr[sMacAddr] = {};
	}
	mMacAddr[sMacAddr].time = fGetTimestamp();
	const sIpv6 = rinfo.address;
	if (mMacAddr[sMacAddr].ipv6 !== sIpv6) {
		mMacAddr[sMacAddr].online = false;
		mMacAddr[sMacAddr].ipv6 = sIpv6;
	}
});

// 监听 'listening' 事件，服务器启动后触发
server.on('listening', () => {
	const address = server.address();
	console.log(new Date(), `服务器已启动，正在监听 ${address.address}:${address.port}`);
});

// 监听错误事件
server.on('error', (err) => {
	console.error(new Date(), `服务器发生错误: ${err.stack}`);
	server.close();
});

// 绑定服务器到指定的主机和端口
const PORT = 1; // 服务器监听的端口
server.bind(PORT, '::');
