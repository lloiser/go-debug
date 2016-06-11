"use babel";

import { CompositeDisposable } from "atom";
import * as Delve from "./delve";

let subscriptions, goconfig, goget;
let editors, output, panel, store, commands;
let initialState, dependenciesInstalled, path;
let cmds;

export default {
	activate(state) {
		initialState = state;

		require("atom-package-deps").install("go-debug").then(() => {
			dependenciesInstalled = true;
			this.start();
			return true;
		}).catch((e) => {
			console.log(e);
		});
	},
	deactivate() {
		if (subscriptions) {
			subscriptions.dispose();
			subscriptions = null;
		}
		dependenciesInstalled = false;
		path = null;
	},
	serialize() {
		return store ? store.serialize() : initialState;
	},

	consumeGoget(service) {
		goget = service;
		this.getDlv();
	},
	consumeGoconfig(service) {
		goconfig = service;
		this.getDlv();
	},
	getDlv() {
		if (!goget || !goconfig) {
			return;
		}

		goconfig.locator.findTool("dlv").then((p) => {
			let prom = Promise.resolve(p);
			if (!p) {
				prom = Delve.get(goget, goconfig);
			}
			prom.then((p) => {
				if (!p) {
					return;
				}
				path = p;
				this.start();
			}).catch(() => {});
		});
	},

	start() {
		if (!dependenciesInstalled || !path) {
			return;
		}

		// load all dependencies once after everything is ready
		// this reduces the initial load time of this package
		commands = require("./commands");

		store = require("./store");
		store.init(initialState);
		store.store.dispatch({ type: "SET_DLV_PATH", path: path });

		editors = require("./editors");
		panel = require("./panel.jsx");
		output = require("./output.jsx");

		panel.init();
		editors.init();
		output.init();

		subscriptions = new CompositeDisposable(
			atom.commands.add("atom-workspace", {
				"go-debug:toggle-panel": commands.get("toggle-panel").action
			}),
			store,
			editors,
			panel,
			output
		);

		// start observing config values
		subscriptions.add(
			atom.config.observe("go-debug.limitCommandsToGo", this.observeCommandsLimit.bind(this))
		);
	},
	observeCommandsLimit(limitCommandsToGo) {
		if (cmds) {
			subscriptions.remove(cmds);
			cmds.dispose();
		}

		let selector = "atom-text-editor";
		if (limitCommandsToGo === true) {
			selector = "atom-text-editor[data-grammar~='go']";
		}
		cmds = atom.commands.add(selector, commands.getKeyboardCommands());
		subscriptions.add(cmds);
	}
};
