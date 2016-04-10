"use babel";

import { CompositeDisposable } from "atom";

function currentFile() {
	const editor = atom.workspace.getActiveTextEditor();
	return editor && editor.getPath();
}

function currentLine() {
	const editor = atom.workspace.getActiveTextEditor();
	return editor && editor.getCursorBufferPosition().row;
}

let subscriptions, goconfig;
let delve, editors, output, panel, store;
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
		return store.serialize();
	},

	consumeGoconfig (service) {
		goconfig = service;
		goconfig.locator.findTool("dlv").then((p) => {
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

		store = require("./store");
		store.init(initialState);
		store.store.dispatch({ type: "SET_DLV_PATH", path: path });

		delve = require("./delve");
		editors = require("./editors");
		panel = require("./panel.jsx");
		output = require("./output.jsx");

		panel.init();
		editors.init();
		output.init();

		subscriptions = new CompositeDisposable(
			atom.commands.add("atom-workspace", {
				"go-debug:togglePanel": () => store.store.dispatch({ type: "TOGGLE_PANEL" })
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

		let commandsSelector = "atom-text-editor";
		if (limitCommandsToGo === true) {
			commandsSelector = "atom-text-editor[data-grammar~='go']";
		}
		cmds = atom.commands.add(commandsSelector, {
			"go-debug:runTests":         () => delve.runTests(currentFile()),
			"go-debug:runPackage":       () => delve.runPackage(currentFile()),
			"go-debug:continue":         () => delve.command("continue"),
			"go-debug:next":             () => delve.command("next"),
			"go-debug:step":             () => delve.command("step"),
			"go-debug:restart":          () => delve.restart(),
			"go-debug:stop":             () => delve.stop(),
			"go-debug:toggleBreakpoint": () => delve.toggleBreakpoint(currentFile(), currentLine())
		});
		subscriptions.add(cmds);
	}
};
