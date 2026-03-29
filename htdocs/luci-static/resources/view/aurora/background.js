'use strict';
'require form';
'require fs';
'require rpc';
'require uci';
'require ui';
'require view';

const callSystemInfo = rpc.declare({
	object: 'system',
	method: 'info'
});

const callRemoveBackground = rpc.declare({
	object: 'luci.aurora',
	method: 'remove_background',
	params: ['filename'],
	expect: { '': {} }
});

const callRenameBackground = rpc.declare({
	object: 'luci.aurora',
	method: 'rename_background',
	params: ['newname'],
	expect: { '': {} }
});

const bg_path = '/www/luci-static/aurora/background/';

return view.extend({
	load() {
		return Promise.all([
			uci.load('aurora'),
			L.resolveDefault(callSystemInfo(), {}),
			L.resolveDefault(fs.list(bg_path), {})
		]);
	},

	render(data) {
		let m, s, o;

		m = new form.Map('aurora', _('Aurora background configuration'),
			_('Here you can set the background pictures and videos of the login page of Aurora theme, Chrome is recommended.'));

		s = m.section(form.TypedSection, 'global', _('Background configuration'));
		s.addremove = false;
		s.anonymous = true;

		o = s.option(form.ListValue, 'online_wallpaper', _('Wallpaper source'));
		o.value('none', _('Built-in'));
		o.value('bing', _('Bing'));
		o.value('ghser', _('GHSer'));
		o.value('unsplash', _('Unsplash'));
		o.value('wallhaven', _('Wallhaven'));
		o.default = 'bing';
		o.forcewrite = true;
		o.rmempty = false;
		o.cfgvalue = function(section_id) {
			let value = uci.get(data[0], section_id, 'online_wallpaper') || 'bing';
			return value.split('_')[0];
		}
		o.write = function(section_id, value) {
			let collection_id = this.section.formvalue(section_id, 'collection_id');
			if (collection_id && (value === 'unsplash' || value === 'wallhaven')) {
				value = value + '_' + collection_id;
			}
			uci.set(data[0], section_id, 'online_wallpaper', value);
		}

		o = s.option(form.Value, 'collection_id', _('Collection ID'), _('Collection ID for Unsplash or Wallhaven.'));
		o.datatype = 'uinteger';
		o.depends('online_wallpaper', 'unsplash');
		o.depends('online_wallpaper', 'wallhaven');
		o.cfgvalue = function(section_id) {
			let value = uci.get(data[0], section_id, 'online_wallpaper');
			if (!value || !value.includes('_'))
				return '';

			return value.split('_')[1];
		}
		o.write = function() { };

		o = s.option(form.Value, 'use_api_key', _('API key'), _('Specify API key for Unsplash or Wallhaven.'));
		o.depends('online_wallpaper', 'unsplash');
		o.depends('online_wallpaper', 'wallhaven');

		o = s.option(form.Value, 'extra_params', _('Extra parameters'), _('Specify extra parameters for Wallhaven. etc: categories=100&purity=100&ratios=16x9&page=1&seed=[a-zA-Z0-9]{6}. <br/>Refer to Wallhaven API for details: <a %s>Wallhaven API</a>').format('href="https://wallhaven.cc/help/api" target="_blank"'));
		o.depends('online_wallpaper', 'wallhaven');

		o = s.option(form.Flag, 'use_exact_resolution', _('Use exact resolution'), _('Use exact resolution or at least 1080P for Wallhaven.'));
		o.default = o.enabled;
		o.depends('online_wallpaper', 'wallhaven');

		o = s.option(form.Button, '_save', _('Save settings'));
		o.inputstyle = 'apply';
		o.inputtitle = _('Save current settings');
		o.onclick = function() {
			ui.changes.apply(true);
			return this.map.save(null, true);
		}

		s = m.section(form.TypedSection, 'global', _('Upload background (available space: %1024.2mB)')
			.format(data[1].root.avail * 1024),
			_('You can upload files such as gif/jpg/mp4/png/webm/webp files, to change the login page background.'));
		s.addremove = false;
		s.anonymous = true;

		o = s.option(form.Button, '_upload_bg', _('Upload background'),
			_('Files will be uploaded to <code>%s</code>.').format(bg_path));
		o.inputstyle = 'action';
		o.inputtitle = _('Upload...');
		o.onclick = function(ev, section_id) {
			let file = '/tmp/aurora_background.tmp';
			return ui.uploadFile(file, ev.target).then(function(res) {
				return L.resolveDefault(callRenameBackground(res.name), {}).then(function(ret) {
					if (ret.result === 0)
						return location.reload();
					else {
						ui.addNotification(null, E('p', _('Failed to upload file: %s.').format(res.name)));
						return L.resolveDefault(fs.remove(file), {});
					}
				});
			})
			.catch(function(e) { ui.addNotification(null, E('p', e.message)); });
		};
		o.modalonly = true;

		s = m.section(form.TableSection);
		s.render = function() {
			let tbl = E('table', { 'class': 'table cbi-section-table' },
				E('tr', { 'class': 'tr table-titles' }, [
					E('th', { 'class': 'th' }, [ _('Filename') ]),
					E('th', { 'class': 'th' }, [ _('Modified date') ]),
					E('th', { 'class': 'th' }, [ _('Size') ]),
					E('th', { 'class': 'th' }, [ _('Action') ])
				])
			);

			cbi_update_table(tbl, data[2].map(L.bind(function(file) {
				return [
					file.name,
					new Date(file.mtime * 1000).toLocaleString(),
					String.format('%1024.2mB', file.size),
					E('button', {
						'class': 'btn cbi-button cbi-button-remove',
						'click': ui.createHandlerFn(this, function() {
							return L.resolveDefault(callRemoveBackground(file.name), {})
							.then(function() { return location.reload(); });
						})
					}, [ _('Delete') ])
				];
			}, this)), E('em', _('No files found.')));

			return E('div', { 'class': 'cbi-map', 'id': 'cbi-filelist' }, [
				E('h3', _('Background file list')),
				tbl
			]);
		};

		return m.render();
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
