"use babel";

import { CompositeDisposable } from "atom";

let subscriptions, goconfig;
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

	consumeGoconfig (service) {
		goconfig = service;
		goconfig.locator.findTool("dlv").then((p) => {
			if (!p) {
				atom.notifications.addWarning(
					"Could not find delve executable 'dlv' in your GOPATH!",
					{
						dismissable: true,
						detail: "Starting atom via a desktop icon might not pass GOPATH to atom!\nTry starting atom from the command line instead."
					}
				);
				return;
			}
			path = p;
			this.start();
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

		require("./delve");
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
