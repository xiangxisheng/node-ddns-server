const http2_fetch = require('./http2_fetch');
module.exports = async function (login_token) {
	const options = {};
	options.servername = 'dnsapi.cn';
	options.hostname = '43.159.107.58';
	options.port = 443;
	const oPrivate = {
		clientSession: await http2_fetch(options),
		fParamsInit() {
			const oParams = new URLSearchParams();
			oParams.append('login_token', login_token);
			oParams.append('format', 'json');
			return oParams;
		},
		Error(sTitle, sMessage, mParam) {
			const err = new Error(sMessage);
			err.title = sTitle;
			for (const k in mParam) {
				err[k] = mParam[k];
			}
			return err;
		},
		async post(path, mParam) {
			const oParams = oPrivate.fParamsInit();
			for (const name in mParam) {
				oParams.append(name, mParam[name]);
			}
			const options = { path, data: oParams.toString() };
			//console.log('[ApiDnspod.post.options]', options);
			const res = await oPrivate.clientSession.request(options);
			const data = await res.json();
			if (!data.status) {
				throw oPrivate.Error('ApiDnspod.post.NoStatus', data, { path, data });
			}
			if (path === '/Record.List' && data.status.code == 10) {
				return data;
			}
			if (data.status.code != 1) {
				throw oPrivate.Error('ApiDnspod.post.message', data.status.message, { path, data });
			}
			return data;
		},
	}
	const oPublic = {
		async RecordCreate(domain, sub_domain, record_type, value) {
			// 添加记录
			const mParam = { domain, sub_domain, record_type, value };
			mParam.record_line_id = 0;
			mParam.ttl = 120;
			const data = await oPrivate.post('/Record.Create', mParam);
			return data.record.id;
		},
		async RecordList(domain, sub_domain) {
			// 记录列表
			const mParam = { domain, sub_domain };
			const data = await oPrivate.post('/Record.List', mParam);
			return data.records;
		},
		async RecordModify(domain, record_id, sub_domain, record_type, value) {
			// 修改记录
			const mParam = { domain, record_id, sub_domain, record_type, value };
			mParam.record_line_id = 0;
			await oPrivate.post('/Record.Modify', mParam);
		},
		async RecordDdns(domain, record_id, sub_domain, record_type, value) {
			// 更新动态 DNS 记录
			const mParam = { domain, record_id, sub_domain, value };
			mParam.record_line_id = 0;
			await oPrivate.post('/Record.Ddns', mParam);
		},
		async RecordRemark(domain, record_id, remark) {
			const mParam = { domain, record_id, remark };
			await oPrivate.post('/Record.Remark', mParam);
		},
		async RecordUpsertTypeValue(domain, sub_domain, record_type, value, remark = '') {
			const records = await oPublic.RecordList(domain, sub_domain);
			if (records) {
				for (const record of records) {
					//console.log('记录类型和值都没变', record);
					if (record.type !== record_type || record.value !== value) {
						const res = await oPublic.RecordDdns(domain, record.id, sub_domain, record_type, value);
						//console.log('记录类型或值变了，已更新', res);
					}
					if (record.remark !== remark) {
						//console.log('正在更新remark', remark);
						await oPublic.RecordRemark(domain, record.id, remark);
					}
				}
			} else {
				const recordId = await oPublic.RecordCreate(domain, sub_domain, record_type, value);
				await oPublic.RecordRemark(domain, recordId, remark);
			}
		},
		async RecordInfo(domain, record_id) {
			const mParam = { domain, record_id };
			const res = await oPrivate.post('/Record.Info', mParam);
			console.log(res);
		},
	};
	return oPublic;
};
