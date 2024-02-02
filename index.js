'use strict';
String.prototype.clr = function(hexColor) {
	return `<font color='#${hexColor}'>${this}</font>`;
};
module.exports = {
	NetworkMod: function(mod) {
		const Message = require('../tera-message');
		const MSG = new Message(mod);
		let enabled = true;
		let sendToAlert = false;
		
		function getDefVersion() {
        let ver = 18
        switch (mod.majorPatchVersion) {
            case 31:
                ver = 2; // Classic
                break;
            case 92:
                ver = 3;
                break;
            case 100:
                ver = 3;
                break;
            default:
                ver = '*'
        }
        return ver
    }
		
		const cache = {
			achievements: {},
			strings: {},
			progress: {}
		}

		function achievementsStatus() {
			sendStatus("",
				mod.command.message('Модуль: ' + (enabled ? 'Включен'.clr('56B4E9') : 'Отключен'.clr('FF0000'))),
				mod.command.message('Уведомление в центре: ' + (sendToAlert ? 'Включены'.clr('56B4E9') : 'Отключены'.clr('FF0000')))
			);
		}

		function sendStatus(msg) {
			sendMessage([...arguments].join('\n\t'));
		}

		mod.command.add("ach", (arg) => {
			if (!arg) {
				enabled = !enabled;
				sendMessage('Модуль: ' + (enabled ? 'Включен'.clr('56B4E9') : 'Отключен'.clr('FF0000')));
				if (enabled) {
					achievementsStatus();
				}
			} else {
				switch (arg) {
					case "alert":
						sendToAlert = !sendToAlert;
						sendMessage('Уведомление в центре: ' + (sendToAlert ? 'Включено'.clr('56B4E9') : 'Отключено'.clr('FF0000')));
						break
					case "status":
						achievementsStatus();
						break
					default:
						sendStatus("",
							('ach: ' + ('Включение модуля'.clr('56B4E9'))),
							('ach alert: ' + ('Уведомление в центре'.clr('56B4E9'))),
							('ach status: ' + ('Состояние модуля'.clr('56B4E9')))
						);
						break
				}
			}
		})

		function sendMessage(msg) {
			mod.command.message(msg)
		}

		function sendAlert(msg) {
			mod.send('S_CHAT', getDefVersion(), {
				channel: 21,  // 21 = приватное уведомление, 1 = команда (пати), 2 = гильдия, 25 = уведомление лидера рейда
				chat: false,
				message: msg,
			});
		}

		async function getString(name) {
			const id = /^@Achievement:(?<id>\d+)$/.exec(name).groups.id;
			if (!(id in cache.strings)) {
				const result = await mod.queryData('/StrSheet_Achievement/String@id=?/', [Number(id)], false, false, ['string']);
				cache.strings[id] = result?.attributes.string ?? '';
			}
			return cache.strings[id];
		}
		async function getData(ids) {
			const filtered = ids.filter(id => !(id in cache.achievements))
			if (filtered.length > 0) {
				const achievements = await mod.queryData('/AchievementList/Achievement@id=?/', [ids], true);
				for (const {
						attributes: {
							id,
							name: rawName
						},
						children
					}
					of achievements) {
					const name = await getString(rawName);
					const conditions = children.filter(({
						name,
						attributes: {
							type
						}
					}) => name === 'Condition' && type !== 'check').map(({
						attributes
					}) => attributes);
					for (const condition of conditions) {
						if (condition.string !== undefined) condition.string = await getString(condition.string);
					}
					cache.achievements[id] = {
						name,
						conditions
					}
				}
			}
		}
		mod.hook('S_UPDATE_ACHIEVEMENT_PROGRESS', 1, ({
			achievements
		}) => {
			if (enabled) {
				getData(achievements.map(({
					id
				}) => id)).then(() => {
					achievements.forEach(achievement => {
						if (!(mod.game.me.name in cache.progress)) cache.progress[mod.game.me.name] = {}
						if (achievement.id in cache.progress[mod.game.me.name] && achievement.id in cache.achievements) {
							achievement.requirements.forEach(requirement => {
								const cached = cache.progress[mod.game.me.name][achievement.id].requirements.find(({
									index
								}) => index === requirement.index);
								if (cached?.amount < requirement.amount) {
									const achievementData = cache.achievements[achievement.id];
									const conditionData = achievementData.conditions.find(({
										id
									}) => id === requirement.index);
									if (requirement.amount <= conditionData?.max) {
										sendMessage(MSG.TIP(`${achievementData.name}: `) + MSG.TIP(`${conditionData.string} `) + MSG.BLU(`${requirement.amount}`) + "/" + MSG.RED(`${conditionData.max}`));
										if (sendToAlert) {
											sendAlert(MSG.TIP(`${achievementData.name}: `) + MSG.TIP(`${conditionData.string} `) + MSG.BLU(`${requirement.amount}`) + "/" + MSG.RED(`${conditionData.max}`));
										}

									}
								}
							});
						}
						cache.progress[mod.game.me.name][achievement.id] = achievement;
					});
				});
			}
		});

		this.saveState = () => cache;
		this.destructor = () => {}
		this.loadState = state => Object.assign(cache, state);
	}
};