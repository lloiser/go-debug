"use babel";

import { CompositeDisposable } from "atom";
import { store, serialize } from "./store";
import * as Panel from "./panel.jsx";
import * as Editors from "./editors";
import * as Delve from "./delve";

function currentFile() {
	const editor = atom.workspace.getActiveTextEditor();
	return editor && editor.getPath();
}

export default {
	subscriptions: null,
	dependenciesInstalled: false,
	activate(state) {
		store.dispatch({ type: "INITIAL_STATE", state });

		this.subscriptions = new CompositeDisposable();
		this.subscriptions.add(
			atom.commands.add("atom-workspace", {
				"go-debug:runTests":   () => Delve.runTests(currentFile()),
				"go-debug:runPackage": () => Delve.runPackage(currentFile()),
				"go-debug:continue":   () => Delve.command("continue"),
				"go-debug:next":       () => Delve.command("next"),
				"go-debug:step":       () => Delve.command("step"),
				"go-debug:restart":    () => Delve.restart(),
				"go-debug:stop":       () => Delve.stop()
			})
		);
		Panel.show();

		require("atom-package-deps").install("go-debug").then(() => {
			this.dependenciesInstalled = true;
			return true;
		}).catch((e) => {
			console.log(e);
		});
	},
	deactivate() {
		if (this.subscriptions) {
			this.subscriptions.dispose();
		}
		Panel.destroy();
		Editors.destroy();
	},
	serialize() {
		return serialize(); // the store
	},

	consumeGoconfig (service) {
		this.goconfig = service;
		this.goconfig.locator.findTool("dlv").then(function(path) {
			Delve.setDlvPath(path);
		});
	}
};
